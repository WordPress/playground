import { postMessageExpectReply, awaitReply } from '../shared/messaging.mjs';
import {
	getPathQueryFragment,
	getURLScope,
	isURLScoped,
	removeURLScope,
} from './library';

const broadcastChannel = new BroadcastChannel(`wordpress-service-worker`);

/**
 * Ensure the client gets claimed by this service worker right after the registration.
 *
 * Only requests from the "controlled" pages are resolved via the fetch listener below.
 * However, simply registering the worker is not enough to make it the "controller" of
 * the current page. The user still has to reload the page. If they don't an iframe
 * pointing to /index.php will show a 404 message instead of WordPress homepage.
 *
 * This activation handles saves the user reloading the page after the initial confusion.
 * It immediately makes this worker the controller of any client that registers it.
 */
self.addEventListener('activate', (event) => {
	// eslint-disable-next-line no-undef
	event.waitUntil(clients.claim());
});

/**
 * The main method. It captures the requests and loop them back to the main
 * application using the Loopback request
 */
self.addEventListener('fetch', (event) => {
	// @TODO A more involved hostname check
	const url = new URL(event.request.url);
	const isWpOrgRequest = url.hostname.includes('api.wordpress.org');
	if (isWpOrgRequest) {
		console.log(`[ServiceWorker] Ignoring request: ${url.pathname}`);
	}

	/**
	 * Detect scoped requests – their url starts with `/scope:`
	 *
	 * We need this mechanics because BroadcastChannel transmits
	 * events to all the listeners across all browser tabs. Scopes
	 * helps WASM workers ignore requests meant for other WASM workers.
	 */
	const scope = getURLScope(url);
	const unscopedUrl = removeURLScope(url);

	const isPHPRequest =
		unscopedUrl.pathname.endsWith('/') ||
		unscopedUrl.pathname.endsWith('.php') ||
		// @TODO: Don't assume the uploads only live in /wp-content/uploads
		unscopedUrl.pathname.startsWith('/wp-content/uploads');
	if (isPHPRequest) {
		event.preventDefault();
		return event.respondWith(
			new Promise(async (accept) => {
				console.log(
					`[ServiceWorker] Serving request: ${getPathQueryFragment(
						unscopedUrl
					)}`
				);
				console.log({ isWpOrgRequest, isPHPRequest });
				const { post, files } = await parsePost(event.request);
				const requestHeaders = {};
				for (const pair of event.request.headers.entries()) {
					requestHeaders[pair[0]] = pair[1];
				}

				const requestedPath = getPathQueryFragment(url);
				let wpResponse;
				try {
					const message = {
						type: 'httpRequest',
						scope,
						request: {
							path: requestedPath,
							method: event.request.method,
							files,
							_POST: post,
							headers: requestHeaders,
						},
					};
					console.log(
						'[ServiceWorker] Forwarding a request to the main app',
						{
							message,
						}
					);
					const messageId = postMessageExpectReply(
						broadcastChannel,
						message
					);
					wpResponse = await awaitReply(broadcastChannel, messageId);
					console.log(
						'[ServiceWorker] Response received from the main app',
						{
							wpResponse,
						}
					);
				} catch (e) {
					console.error(e, { requestedPath });
					throw e;
				}

				accept(
					new Response(wpResponse.body, {
						headers: wpResponse.headers,
					})
				);
			})
		);
	}

	if (isURLScoped(url)) {
		const scopedUrl = url + '';
		url.pathname = '/' + url.pathname.split('/').slice(2).join('/');
		const serverUrl = url + '';
		console.log(
			`[ServiceWorker] Rerouting static request from ${scopedUrl} to ${serverUrl}`
		);

		event.preventDefault();
		return event.respondWith(
			new Promise(async (accept) => {
				const newRequest = await cloneRequest(event.request, {
					url: serverUrl,
				});
				accept(fetch(newRequest));
			})
		);
	}

	console.log(`[ServiceWorker] Ignoring a request to ${event.request.url}`);
});

/**
 * Copy a request with custom overrides.
 *
 * This function is only needed because Request properties
 * are read-only. The only way to change e.g. a URL is to
 * create an entirely new request:
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/Request
 *
 * @param {Request} request
 * @param {Object}  overrides
 * @return {Request} The new request.
 */
async function cloneRequest(request, overrides) {
	const body =
		['GET', 'HEAD'].includes(request.method) || 'body' in overrides
			? undefined
			: await request.blob();
	return new Request(overrides.url || request.url, {
		body,
		method: request.method,
		headers: request.headers,
		referrer: request.referrer,
		referrerPolicy: request.referrerPolicy,
		mode: request.mode,
		credentials: request.credentials,
		cache: request.cache,
		redirect: request.redirect,
		integrity: request.integrity,
		...overrides,
	});
}

async function parsePost(request) {
	if (request.method !== 'POST') {
		return { post: undefined, files: undefined };
	}
	// Try to parse the body as form data
	try {
		const formData = await request.clone().formData();
		const post = {};
		const files = {};

		for (const key of formData.keys()) {
			const value = formData.get(key);
			if (value instanceof File) {
				files[key] = value;
			} else {
				post[key] = value;
			}
		}

		return { post, files };
	} catch (e) {}

	// Try to parse the body as JSON
	return { post: await request.clone().json(), files: {} };
}
