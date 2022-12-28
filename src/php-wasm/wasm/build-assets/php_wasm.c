/**
 * Public API for php.wasm.
 *
 * This file abstracts the entire PHP API with the minimal set
 * of functions required to run PHP code in JavaScript.
 */

#include "sapi/embed/php_embed.h"
#include <emscripten.h>
#include <stdlib.h>
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>

#include "zend_globals_macros.h"
#include "zend_exceptions.h"
#include "zend_closures.h"
#include "zend_hash.h"
#include "rfc1867.h"
#include "SAPI.h"

#if (PHP_MAJOR_VERSION == 7 && PHP_MINOR_VERSION >= 4) || PHP_MAJOR_VERSION >= 8
#include "sqlite3.h"
#include "sqlite3.c"
#endif
#if PHP_MAJOR_VERSION >= 8
// In PHP 8 the final linking step won't
// work without these includes:
#include "sqlite_driver.c"
#include "sqlite_statement.c"
#include "pdo_sqlite.c"
#endif

/*
 * Function: redirect_stream_to_file
 * ----------------------------
 *   Redirects writes from a given stream to a file with a speciied path.
 *   Think of it as a the ">" operator in "echo foo > bar.txt" bash command.
 *
 *   This is useful to pass streams of bytes containing null bytes to JavaScript
 *   handlers. You can't do that via stdout and stderr because Emscripten truncates
 *   null bytes from these streams.
 *
 *   stream: The stream to redirect, e.g. stdout or stderr.
 *
 *   path: The path to the file to redirect to, e.g. "/tmp/stdout".
 *
 *   returns: The exit code: 0 on success, -1 on failure.
 */
int redirect_stream_to_file(FILE *stream, char *file_path)
{
	int out = open(file_path, O_TRUNC | O_WRONLY | O_CREAT, 0600);
	if (-1 == out)
	{
		return -1;
	}

	int replacement_stream = dup(fileno(stream));
	if (-1 == dup2(out, fileno(stream)))
	{
		perror("cannot redirect stdout");
		return -1;
	}

	return replacement_stream;
}

/*
 * Function: restore_stream_handler
 * ----------------------------
 *   Restores a stream handler to its original state from before the redirect_stream_to_file
 *   function was called.
 *
 *  stream: The stream to restore, e.g. stdout or stderr.
 *
 *  replacement_stream: The replacement stream returned by the redirect_stream_to_file function.
 */
void restore_stream_handler(FILE *original_stream, int replacement_stream)
{
	dup2(replacement_stream, fileno(original_stream));
	close(replacement_stream);
}

/*
 * Function: phpwasm_run
 * ----------------------------
 *   Runs a PHP script. Writes the output to stdout and stderr,
 *
 *   code: The PHP code to run. Must include the `<?php` opener.
 *
 *   returns: The exit code. 0 means success, 1 means the code died, 2 means an error.
 */
int EMSCRIPTEN_KEEPALIVE phpwasm_run(char *code)
{
	int retVal = 255; // Unknown error.

	// Write to files instead of stdout and stderr because Emscripten truncates null
	// bytes from stdout and stderr, and null bytes are a valid output when streaming
	// binary data.
	int stdout_replacement = redirect_stream_to_file(stdout, "/tmp/stdout");
	int stderr_replacement = redirect_stream_to_file(stderr, "/tmp/stderr");
	if (stdout_replacement == -1 || stderr_replacement == -1)
	{
		return retVal;
	}

	zend_try
	{
		retVal = zend_eval_string(code, NULL, "php-wasm run script");

		if (EG(exception))
		{
			zend_exception_error(EG(exception), E_ERROR);
			retVal = 2;
		}
	}
	zend_catch
	{
		retVal = 1; // Code died.
	}

	zend_end_try();

	fflush(stdout);
	fflush(stderr);

	restore_stream_handler(stdout, stdout_replacement);
	restore_stream_handler(stderr, stderr_replacement);

	return retVal;
}

/*
 * Function: phpwasm_destroy_context
 * ----------------------------
 *   Destroy the current PHP context.
 *   This function trashes the entire memory including all loaded variables,
 *   functions, classes, etc. It's like the final cleanup after running a script.
 */
void EMSCRIPTEN_KEEPALIVE phpwasm_destroy_context()
{
	return php_embed_shutdown();
}

/*
 * Function: phpwasm_init_context
 * ----------------------------
 *   Creates a new PHP context.
 *   This function enables running PHP code, allocating variables, etc.
 *   It must be called before running any script.
 */
int EMSCRIPTEN_KEEPALIVE phpwasm_init_context()
{
	putenv("USE_ZEND_ALLOC=0");

	return php_embed_init(0, NULL);
}

/*
 * Function: phpwasm_refresh
 * ----------------------------
 *   Destroy the current PHP context (variables, functions, memory etc)
 *   and start a new one.
 */
int EMSCRIPTEN_KEEPALIVE phpwasm_refresh()
{
	phpwasm_destroy_context();

	return phpwasm_init_context();
}

// === FILE UPLOADS SUPPORT ===

/*
 * Function: free_filename
 * ----------------------------
 *   Frees the memory after a zval allocated to store the uploaded
 *   variable name.
 */
static void free_filename(zval *el)
{
	// Uncommenting this code causes a runtime error in the browser:
	// @TODO evaluate whether keeping it commented leads to a memory leak
	//       and how to fix it if it does.
	// zend_string *filename = Z_STR_P(el);
	// zend_string_release_ex(filename, 0);
}

/*
 * Function: phpwasm_init_uploaded_files_hash
 * ----------------------------
 *   Allocates an internal HashTable to keep track of the legitimate uploads.
 *
 *   Functions like `is_uploaded_file` or `move_uploaded_file` don't work with
 *   $_FILES entries that are not in an internal hash table. It's a security feature.
 *   This function allocates that internal hash table.
 *
 *   @see PHP.initUploadedFilesHash in the JavaScript package for more details.
 */
void EMSCRIPTEN_KEEPALIVE phpwasm_init_uploaded_files_hash()
{
	zend_hash_init(&PG(rfc1867_protected_variables), 8, NULL, NULL, 0);

	HashTable *uploaded_files = NULL;
	ALLOC_HASHTABLE(uploaded_files);
	#if PHP_MAJOR_VERSION == 5
	zend_hash_init(uploaded_files, 5, NULL, (dtor_func_t) free_estring, 0);
	#else
	zend_hash_init(uploaded_files, 8, NULL, free_filename, 0);
	#endif
	SG(rfc1867_uploaded_files) = uploaded_files;
}

/*
 * Function: phpwasm_register_uploaded_file
 * ----------------------------
 *   Registers an uploaded file in the internal hash table.
 *
 *   @see PHP.initUploadedFilesHash in the JavaScript package for more details.
 */
void EMSCRIPTEN_KEEPALIVE phpwasm_register_uploaded_file(char *tmp_path_char)
{
	#if PHP_MAJOR_VERSION == 5
		zend_hash_add(SG(rfc1867_uploaded_files), tmp_path_char, strlen(tmp_path_char) + 1, &tmp_path_char, sizeof(char *), NULL);
	#else
		zend_string *tmp_path = zend_string_init(tmp_path_char, strlen(tmp_path_char), 1);
		zend_hash_add_ptr(SG(rfc1867_uploaded_files), tmp_path, tmp_path);
	#endif
}

/*
 * Function: phpwasm_destroy_uploaded_files_hash
 * ----------------------------
 *   Destroys the internal hash table to free the memory.
 *
 *   @see PHP.initUploadedFilesHash in the JavaScript package for more details.
 */
void EMSCRIPTEN_KEEPALIVE phpwasm_destroy_uploaded_files_hash()
{
	destroy_uploaded_files_hash();
}

#ifdef WITH_VRZNO
#include "../php-src/ext/vrzno/php_vrzno.h"

/*
 * Function: exec_callback
 * ----------------------------
 *   Required by the VRZNO module.
 *   Why? I'm not sure.
 *
 *   @see https://github.com/seanmorris/vrzno
 */
int EMSCRIPTEN_KEEPALIVE exec_callback(zend_function *fptr)
{
	int retVal = vrzno_exec_callback(fptr);

	fflush(stdout);

	return retVal;
}

/*
 * Function: del_callback
 * ----------------------------
 *   Required by the VRZNO module.
 *   Why? I'm not sure.
 *
 *   @see https://github.com/seanmorris/vrzno
 */
int EMSCRIPTEN_KEEPALIVE del_callback(zend_function *fptr)
{
	return vrzno_del_callback(fptr);
}
#endif
