import {
	ensurePathPrefix,
	toRelativeUrl,
	removePathPrefix,
	DEFAULT_BASE_URL,
} from './urls';
import type { FileInfo, BasePHP, PHPRunOptions } from './php';
import Semaphore from './semaphore';
import { PHPResponse } from './php-response';

export type PHPRequest = Pick<PHPRunOptions, 'method' | 'headers'> & {
	url: string;
	files?: Record<string, File>;
} & (
		| (Pick<PHPRunOptions, 'body'> & { formData?: never })
		| { body?: never; formData: Record<string, unknown> }
	);

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
	 * Callback used by the PHPRequestHandler to decide whether
	 * the requested path refers to a PHP file or a static file.
	 */
	isStaticFilePath?: (path: string) => boolean;
}

/**
 * A fake PHP server that handles HTTP requests but does not
 * bind to any port.
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

	/**
	 * The PHP instance
	 */
	php: BasePHP;
	#isStaticFilePath: (path: string) => boolean;

	/**
	 * @param  php    - The PHP instance.
	 * @param  config - Request Handler configuration.
	 */
	constructor(php: BasePHP, config: PHPRequestHandlerConfiguration = {}) {
		this.#semaphore = new Semaphore({ concurrency: 1 });
		const {
			documentRoot = '/www/',
			absoluteUrl = location.origin,
			isStaticFilePath = () => false,
		} = config;
		this.php = php;
		this.#DOCROOT = documentRoot;
		this.#isStaticFilePath = isStaticFilePath;

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
	 * The absolute URL of this PHPRequestHandler instance.
	 */
	get documentRoot() {
		return this.#DOCROOT;
	}

	/**
	 * Serves the request – either by serving a static file, or by
	 * dispatching it to the PHP runtime.
	 *
	 * @param  request - The request.
	 * @returns The response.
	 */
	async request(request: PHPRequest): Promise<PHPResponse> {
		const isAbsolute =
			request.url.startsWith('http://') ||
			request.url.startsWith('https://');
		const requestedUrl = new URL(
			request.url,
			isAbsolute ? undefined : DEFAULT_BASE_URL
		);

		const normalizedRelativeUrl = removePathPrefix(
			requestedUrl.pathname,
			this.#PATHNAME
		);
		if (this.#isStaticFilePath(normalizedRelativeUrl)) {
			return this.#serveStaticFile(normalizedRelativeUrl);
		}
		return await this.#dispatchToPHP(request, requestedUrl);
	}

	/**
	 * Serves a static file from the PHP filesystem.
	 *
	 * @param  path - The requested static file path.
	 * @returns The response.
	 */
	#serveStaticFile(path: string): PHPResponse {
		const fsPath = `${this.#DOCROOT}${path}`;

		if (!this.php.fileExists(fsPath)) {
			return new PHPResponse(
				404,
				{},
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
		/*
		 * Prevent multiple requests from running at the same time.
		 * For example, if a request is made to a PHP file that
		 * requests another PHP file, the second request may
		 * be dispatched before the first one is finished.
		 */
		const release = await this.#semaphore.acquire();
		try {
			this.php.addServerGlobalEntry('DOCUMENT_ROOT', this.#DOCROOT);
			this.php.addServerGlobalEntry(
				'HTTPS',
				this.#ABSOLUTE_URL.startsWith('https://') ? 'on' : ''
			);

			let preferredMethod: PHPRunOptions['method'] = 'GET';

			const fileInfos: FileInfo[] = [];
			if (request.files) {
				preferredMethod = 'POST';
				for (const key in request.files) {
					const file: File = request.files[key];
					fileInfos.push({
						key,
						name: file.name,
						type: file.type,
						data: new Uint8Array(await file.arrayBuffer()),
					});
				}
			}

			const defaultHeaders: Record<string, string> = {
				host: this.#HOST,
			};

			let body;
			if (request.formData !== undefined) {
				preferredMethod = 'POST';
				defaultHeaders['content-type'] =
					'application/x-www-form-urlencoded';
				body = new URLSearchParams(
					request.formData as Record<string, string>
				).toString();
			} else {
				body = request.body;
			}

			return await this.php.run({
				relativeUri: ensurePathPrefix(
					toRelativeUrl(requestedUrl),
					this.#PATHNAME
				),
				protocol: this.#PROTOCOL,
				method: request.method || preferredMethod,
				body,
				fileInfos,
				scriptPath: this.#resolvePHPFilePath(requestedUrl.pathname),
				headers: {
					...defaultHeaders,
					...(request.headers || {}),
				},
			});
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
	 * @returns The resolved filesystem path.
	 */
	#resolvePHPFilePath(requestedPath: string): string {
		let filePath = removePathPrefix(requestedPath, this.#PATHNAME);

		// If the path mentions a .php extension, that's our file's path.
		if (filePath.includes('.php')) {
			filePath = filePath.split('.php')[0] + '.php';
		} else {
			// Otherwise, let's assume the file is $request_path/index.php
			if (!filePath.endsWith('/')) {
				filePath += '/';
			}
			if (!filePath.endsWith('index.php')) {
				filePath += 'index.php';
			}
		}

		const resolvedFsPath = `${this.#DOCROOT}${filePath}`;
		if (this.php.fileExists(resolvedFsPath)) {
			return resolvedFsPath;
		}
		return `${this.#DOCROOT}/index.php`;
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
		default:
			return 'application-octet-stream';
	}
}

export default PHPRequestHandler;
