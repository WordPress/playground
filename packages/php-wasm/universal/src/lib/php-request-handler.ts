import { Semaphore, joinPaths } from '@php-wasm/util';
import {
	ensurePathPrefix,
	toRelativeUrl,
	removePathPrefix,
	DEFAULT_BASE_URL,
} from './urls';
import {
	BasePHP,
	PHPExecutionFailureError,
	normalizeHeaders,
} from './base-php';
import { PHPResponse } from './php-response';
import { PHPRequest, PHPRunOptions } from './universal-php';
import { encodeAsMultipart } from './encode-as-multipart';
import { HttpCookieStore } from './http-cookie-store';
import { logger } from '@php-wasm/logger';

export type RewriteRule = {
	match: RegExp;
	replacement: string;
};

export interface PHPRequestHandlerConfiguration {
	/**
	 * The directory in the PHP filesystem where the server will look
	 * for the files to serve. Default: `/var/www`.
	 */
	documentRoot?: string;
	/**
	 * Request Handler URL. Used to populate $_SERVER details like HTTP_HOST.
	 */
	absoluteUrl?: string;

	/**
	 * Rewrite rules
	 */
	rewriteRules?: RewriteRule[];
}

/**
 * Handles HTTP requests using PHP runtime as a backend.
 *
 * @public
 * @example Use PHPRequestHandler implicitly with a new PHP instance:
 * ```js
 * import { PHP } from '@php-wasm/web';
 *
 * const php = await PHP.load( '7.4', {
 *     requestHandler: {
 *         // PHP FS path to serve the files from:
 *         documentRoot: '/www',
 *
 *         // Used to populate $_SERVER['SERVER_NAME'] etc.:
 *         absoluteUrl: 'http://127.0.0.1'
 *     }
 * } );
 *
 * php.mkdirTree('/www');
 * php.writeFile('/www/index.php', '<?php echo "Hi from PHP!"; ');
 *
 * const response = await php.request({ path: '/index.php' });
 * console.log(response.text);
 * // "Hi from PHP!"
 * ```
 *
 * @example Explicitly create a PHPRequestHandler instance and run a PHP script:
 * ```js
 * import {
 *   loadPHPRuntime,
 *   PHP,
 *   PHPRequestHandler,
 *   getPHPLoaderModule,
 * } from '@php-wasm/web';
 *
 * const runtime = await loadPHPRuntime( await getPHPLoaderModule('7.4') );
 * const php = new PHP( runtime );
 *
 * php.mkdirTree('/www');
 * php.writeFile('/www/index.php', '<?php echo "Hi from PHP!"; ');
 *
 * const server = new PHPRequestHandler(php, {
 *     // PHP FS path to serve the files from:
 *     documentRoot: '/www',
 *
 *     // Used to populate $_SERVER['SERVER_NAME'] etc.:
 *     absoluteUrl: 'http://127.0.0.1'
 * });
 *
 * const response = server.request({ path: '/index.php' });
 * console.log(response.text);
 * // "Hi from PHP!"
 * ```
 */
export class PHPRequestHandler {
	#DOCROOT: string;
	#PROTOCOL: string;
	#HOSTNAME: string;
	#PORT: number;
	#HOST: string;
	#PATHNAME: string;
	#ABSOLUTE_URL: string;
	#semaphore: Semaphore;
	#cookieStore: HttpCookieStore;
	rewriteRules: RewriteRule[];

	/**
	 * The PHP instance
	 */
	php: BasePHP;

	/**
	 * @param  php    - The PHP instance.
	 * @param  config - Request Handler configuration.
	 */
	constructor(php: BasePHP, config: PHPRequestHandlerConfiguration = {}) {
		this.#semaphore = new Semaphore({ concurrency: 1 });
		const {
			documentRoot = '/www/',
			absoluteUrl = typeof location === 'object' ? location?.href : '',
			rewriteRules = [],
		} = config;
		this.php = php;
		this.#cookieStore = new HttpCookieStore();
		this.#DOCROOT = documentRoot;

		const url = new URL(absoluteUrl);
		this.#HOSTNAME = url.hostname;
		this.#PORT = url.port
			? Number(url.port)
			: url.protocol === 'https:'
			? 443
			: 80;
		this.#PROTOCOL = (url.protocol || '').replace(':', '');
		const isNonStandardPort = this.#PORT !== 443 && this.#PORT !== 80;
		this.#HOST = [
			this.#HOSTNAME,
			isNonStandardPort ? `:${this.#PORT}` : '',
		].join('');
		this.#PATHNAME = url.pathname.replace(/\/+$/, '');
		this.#ABSOLUTE_URL = [
			`${this.#PROTOCOL}://`,
			this.#HOST,
			this.#PATHNAME,
		].join('');
		this.rewriteRules = rewriteRules;
	}

	/**
	 * Converts a path to an absolute URL based at the PHPRequestHandler
	 * root.
	 *
	 * @param  path The server path to convert to an absolute URL.
	 * @returns The absolute URL.
	 */
	pathToInternalUrl(path: string): string {
		return `${this.absoluteUrl}${path}`;
	}

	/**
	 * Converts an absolute URL based at the PHPRequestHandler to a relative path
	 * without the server pathname and scope.
	 *
	 * @param  internalUrl An absolute URL based at the PHPRequestHandler root.
	 * @returns The relative path.
	 */
	internalUrlToPath(internalUrl: string): string {
		const url = new URL(internalUrl);
		if (url.pathname.startsWith(this.#PATHNAME)) {
			url.pathname = url.pathname.slice(this.#PATHNAME.length);
		}
		return toRelativeUrl(url);
	}

	get isRequestRunning() {
		return this.#semaphore.running > 0;
	}

	/**
	 * The absolute URL of this PHPRequestHandler instance.
	 */
	get absoluteUrl() {
		return this.#ABSOLUTE_URL;
	}

	/**
	 * The directory in the PHP filesystem where the server will look
	 * for the files to serve. Default: `/var/www`.
	 */
	get documentRoot() {
		return this.#DOCROOT;
	}

	/**
	 * Serves the request – either by serving a static file, or by
	 * dispatching it to the PHP runtime.
	 *
	 * The request() method mode behaves like a web server and only works if
	 * the PHP was initialized with a `requestHandler` option (which the online version
	 * of WordPress Playground does by default).
	 *
	 * In the request mode, you pass an object containing the request information
	 * (method, headers, body, etc.) and the path to the PHP file to run:
	 *
	 * ```ts
	 * const php = PHP.load('7.4', {
	 * 	requestHandler: {
	 * 		documentRoot: "/www"
	 * 	}
	 * })
	 * php.writeFile("/www/index.php", `<?php echo file_get_contents("php://input");`);
	 * const result = await php.request({
	 * 	method: "GET",
	 * 	headers: {
	 * 		"Content-Type": "text/plain"
	 * 	},
	 * 	body: "Hello world!",
	 * 	path: "/www/index.php"
	 * });
	 * // result.text === "Hello world!"
	 * ```
	 *
	 * The `request()` method cannot be used in conjunction with `cli()`.
	 *
	 * @example
	 * ```js
	 * const output = await php.request({
	 * 	method: 'GET',
	 * 	url: '/index.php',
	 * 	headers: {
	 * 		'X-foo': 'bar',
	 * 	},
	 * 	body: {
	 * 		foo: 'bar',
	 * 	},
	 * });
	 * console.log(output.stdout); // "Hello world!"
	 * ```
	 *
	 * @param  request - PHP Request data.
	 */
	async request(request: PHPRequest): Promise<PHPResponse> {
		const isAbsolute =
			request.url.startsWith('http://') ||
			request.url.startsWith('https://');
		const requestedUrl = new URL(
			// Remove the hash part of the URL as it's not meant for the server.
			request.url.split('#')[0],
			isAbsolute ? undefined : DEFAULT_BASE_URL
		);

		const normalizedRequestedPath = applyRewriteRules(
			removePathPrefix(
				decodeURIComponent(requestedUrl.pathname),
				this.#PATHNAME
			),
			this.rewriteRules
		);
		const fsPath = joinPaths(this.#DOCROOT, normalizedRequestedPath);
		if (seemsLikeAPHPRequestHandlerPath(fsPath)) {
			return await this.#dispatchToPHP(request, requestedUrl);
		}
		return this.#serveStaticFile(fsPath);
	}

	/**
	 * Serves a static file from the PHP filesystem.
	 *
	 * @param  fsPath - Absolute path of the static file to serve.
	 * @returns The response.
	 */
	#serveStaticFile(fsPath: string): PHPResponse {
		if (!this.php.fileExists(fsPath)) {
			return new PHPResponse(
				404,
				// Let the service worker know that no static file was found
				// and that it's okay to issue a real fetch() to the server.
				{
					'x-file-type': ['static'],
				},
				new TextEncoder().encode('404 File not found')
			);
		}
		const arrayBuffer = this.php.readFileAsBuffer(fsPath);
		return new PHPResponse(
			200,
			{
				'content-length': [`${arrayBuffer.byteLength}`],
				// @TODO: Infer the content-type from the arrayBuffer instead of the file path.
				//        The code below won't return the correct mime-type if the extension
				//        was tampered with.
				'content-type': [inferMimeType(fsPath)],
				'accept-ranges': ['bytes'],
				'cache-control': ['public, max-age=0'],
			},
			arrayBuffer
		);
	}

	/**
	 * Runs the requested PHP file with all the request and $_SERVER
	 * superglobals populated.
	 *
	 * @param  request - The request.
	 * @returns The response.
	 */
	async #dispatchToPHP(
		request: PHPRequest,
		requestedUrl: URL
	): Promise<PHPResponse> {
		if (
			this.#semaphore.running > 0 &&
			request.headers?.['x-request-issuer'] === 'php'
		) {
			logger.warn(
				`Possible deadlock: Called request() before the previous request() have finished. ` +
					`PHP likely issued an HTTP call to itself. Normally this would lead to infinite ` +
					`waiting as Request 1 holds the lock that the Request 2 is waiting to acquire. ` +
					`That's not useful, so PHPRequestHandler will return error 502 instead.`
			);
			return new PHPResponse(
				502,
				{},
				new TextEncoder().encode('502 Bad Gateway')
			);
		}
		/*
		 * Prevent multiple requests from running at the same time.
		 * For example, if a request is made to a PHP file that
		 * requests another PHP file, the second request may
		 * be dispatched before the first one is finished.
		 */
		const release = await this.#semaphore.acquire();
		try {
			let preferredMethod: PHPRunOptions['method'] = 'GET';

			const headers: Record<string, string> = {
				host: this.#HOST,
				...normalizeHeaders(request.headers || {}),
				cookie: this.#cookieStore.getCookieRequestHeader(),
			};

			let body = request.body;
			if (typeof body === 'object' && !(body instanceof Uint8Array)) {
				preferredMethod = 'POST';
				const { bytes, contentType } = await encodeAsMultipart(body);
				body = bytes;
				headers['content-type'] = contentType;
			}

			let scriptPath;
			try {
				scriptPath = this.#resolvePHPFilePath(
					decodeURIComponent(requestedUrl.pathname)
				);
			} catch (error) {
				return new PHPResponse(
					404,
					{},
					new TextEncoder().encode('404 File not found')
				);
			}

			try {
				const response = await this.php.run({
					relativeUri: ensurePathPrefix(
						toRelativeUrl(requestedUrl),
						this.#PATHNAME
					),
					protocol: this.#PROTOCOL,
					method: request.method || preferredMethod,
					$_SERVER: {
						REMOTE_ADDR: '127.0.0.1',
						DOCUMENT_ROOT: this.#DOCROOT,
						HTTPS: this.#ABSOLUTE_URL.startsWith('https://')
							? 'on'
							: '',
					},
					body,
					scriptPath,
					headers,
				});
				this.#cookieStore.rememberCookiesFromResponseHeaders(
					response.headers
				);
				return response;
			} catch (error) {
				const executionError = error as PHPExecutionFailureError;
				if (executionError?.response) {
					return executionError.response;
				}
				throw error;
			}
		} finally {
			release();
		}
	}

	/**
	 * Resolve the requested path to the filesystem path of the requested PHP file.
	 *
	 * Fall back to index.php as if there was a url rewriting rule in place.
	 *
	 * @param  requestedPath - The requested pathname.
	 * @throws {Error} If the requested path doesn't exist.
	 * @returns The resolved filesystem path.
	 */
	#resolvePHPFilePath(requestedPath: string): string {
		let filePath = removePathPrefix(requestedPath, this.#PATHNAME);
		filePath = applyRewriteRules(filePath, this.rewriteRules);

		if (filePath.includes('.php')) {
			// If the path mentions a .php extension, that's our file's path.
			filePath = filePath.split('.php')[0] + '.php';
		} else if (this.php.isDir(`${this.#DOCROOT}${filePath}`)) {
			if (!filePath.endsWith('/')) {
				filePath = `${filePath}/`;
			}
			// If the path is a directory, let's assume the file is index.php
			filePath = `${filePath}index.php`;
		} else {
			// Otherwise, let's assume the file is /index.php
			filePath = '/index.php';
		}

		const resolvedFsPath = `${this.#DOCROOT}${filePath}`;
		if (this.php.fileExists(resolvedFsPath)) {
			return resolvedFsPath;
		}
		throw new Error(`File not found: ${resolvedFsPath}`);
	}
}

/**
 * Naively infer a file mime type from its path.
 *
 * @todo Infer the mime type based on the file contents.
 *       A naive function like this one can be inaccurate
 *       and potentially have negative security consequences.
 *
 * @param  path - The file path
 * @returns The inferred mime type.
 */
function inferMimeType(path: string): string {
	const extension = path.split('.').pop();
	switch (extension) {
		case 'css':
			return 'text/css';
		case 'js':
			return 'application/javascript';
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'gif':
			return 'image/gif';
		case 'svg':
			return 'image/svg+xml';
		case 'woff':
			return 'font/woff';
		case 'woff2':
			return 'font/woff2';
		case 'ttf':
			return 'font/ttf';
		case 'otf':
			return 'font/otf';
		case 'eot':
			return 'font/eot';
		case 'ico':
			return 'image/x-icon';
		case 'html':
			return 'text/html';
		case 'json':
			return 'application/json';
		case 'xml':
			return 'application/xml';
		case 'txt':
		case 'md':
			return 'text/plain';
		case 'pdf':
			return 'application/pdf';
		case 'webp':
			return 'image/webp';
		case 'mp3':
			return 'audio/mpeg';
		case 'mp4':
			return 'video/mp4';
		case 'csv':
			return 'text/csv';
		case 'xls':
			return 'application/vnd.ms-excel';
		case 'xlsx':
			return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
		case 'doc':
			return 'application/msword';
		case 'docx':
			return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
		case 'ppt':
			return 'application/vnd.ms-powerpoint';
		case 'pptx':
			return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
		case 'zip':
			return 'application/zip';
		case 'rar':
			return 'application/x-rar-compressed';
		case 'tar':
			return 'application/x-tar';
		case 'gz':
			return 'application/gzip';
		case '7z':
			return 'application/x-7z-compressed';
		default:
			return 'application-octet-stream';
	}
}

/**
 * Guesses whether the given path looks like a PHP file.
 *
 * @example
 * ```js
 * seemsLikeAPHPRequestHandlerPath('/index.php') // true
 * seemsLikeAPHPRequestHandlerPath('/index.php') // true
 * seemsLikeAPHPRequestHandlerPath('/index.php/foo/bar') // true
 * seemsLikeAPHPRequestHandlerPath('/index.html') // false
 * seemsLikeAPHPRequestHandlerPath('/index.html/foo/bar') // false
 * seemsLikeAPHPRequestHandlerPath('/') // true
 * ```
 *
 * @param  path The path to check.
 * @returns Whether the path seems like a PHP server path.
 */
export function seemsLikeAPHPRequestHandlerPath(path: string): boolean {
	return seemsLikeAPHPFile(path) || seemsLikeADirectoryRoot(path);
}

function seemsLikeAPHPFile(path: string) {
	return path.endsWith('.php') || path.includes('.php/');
}

function seemsLikeADirectoryRoot(path: string) {
	const lastSegment = path.split('/').pop();
	return !lastSegment!.includes('.');
}

/**
 * Applies the given rewrite rules to the given path.
 *
 * @param  path  The path to apply the rules to.
 * @param  rules The rules to apply.
 * @returns The path with the rules applied.
 */
export function applyRewriteRules(path: string, rules: RewriteRule[]): string {
	for (const rule of rules) {
		if (new RegExp(rule.match).test(path)) {
			return path.replace(rule.match, rule.replacement);
		}
	}
	return path;
}
