import {
	LatestSupportedPHPVersion,
	MessageListener,
	SupportedPHPExtensionsList,
} from '@php-wasm/universal';
import {
	registerServiceWorker,
	setPhpApi,
	spawnPHPWorkerThread,
	exposeAPI,
	consumeAPI,
	setupPostMessageRelay,
	SyncProgressCallback,
} from '@php-wasm/web';

import type { PlaygroundWorkerEndpoint } from './worker-thread';
import type { WebClientMixin } from './playground-client';
import ProgressBar, { ProgressBarOptions } from './progress-bar';

// Avoid literal "import.meta.url" on purpose as vite would attempt
// to resolve it during build time. This should specifically be
// resolved by the browser at runtime to reflect the current origin.
const origin = new URL('/', (import.meta || {}).url).origin;

// @ts-ignore
import moduleWorkerUrl from './worker-thread?worker&url';

export const workerUrl: string = new URL(moduleWorkerUrl, origin) + '';

// @ts-ignore
import serviceWorkerPath from '../../service-worker.ts?worker&url';
import { LatestSupportedWordPressVersion } from '@wp-playground/wordpress-builds';
import type { BindOpfsOptions } from './opfs/bind-opfs';
import { FilesystemOperation } from '@php-wasm/fs-journal';
import { setupFetchNetworkTransport } from './setup-fetch-network-transport';
export const serviceWorkerUrl = new URL(serviceWorkerPath, origin);

// Prevent Vite from hot-reloading this file – it would
// cause bootPlaygroundRemote() to register another web worker
// without unregistering the previous one. The first web worker
// would then fight for service worker requests with the second
// one. It's a difficult problem to debug and HMR isn't that useful
// here anyway – let's just disable it for this file.
// @ts-ignore
if (import.meta.hot) {
	// @ts-ignore
	import.meta.hot.accept(() => {});
}

const query = new URL(document.location.href).searchParams;
export async function bootPlaygroundRemote() {
	assertNotInfiniteLoadingLoop();

	const hasProgressBar = query.has('progressbar');
	let bar: ProgressBar | undefined;
	if (hasProgressBar) {
		bar = new ProgressBar();
		document.body.prepend(bar.element);
	}

	const wpVersion = parseVersion(
		query.get('wp'),
		LatestSupportedWordPressVersion
	);
	const phpVersion = parseVersion(
		query.get('php'),
		LatestSupportedPHPVersion
	);
	const phpExtensions = parseList(
		query.getAll('php-extension'),
		SupportedPHPExtensionsList
	);
	const withNetworking = query.get('networking') === 'yes';
	const sapiName = query.get('sapi-name') || undefined;

	const scope = Math.random().toFixed(16);
	await registerServiceWorker(scope, serviceWorkerUrl + '');

	const phpApi = consumeAPI<PlaygroundWorkerEndpoint>(
		await spawnPHPWorkerThread(workerUrl, {
			wpVersion,
			phpVersion,
			['php-extension']: phpExtensions,
			networking: withNetworking ? 'yes' : 'no',
			storage: query.get('storage') || '',
			...(sapiName ? { sapiName } : {}),
			'site-slug': query.get('site-slug') || 'wordpress',
			scope,
		})
	);
	// Set PHP API in the service worker
	setPhpApi(phpApi);

	const wpFrame = document.querySelector('#wp') as HTMLIFrameElement;
	const webApi: WebClientMixin = {
		async onDownloadProgress(fn) {
			return phpApi.onDownloadProgress(fn);
		},
		async journalFSEvents(root: string, callback) {
			return phpApi.journalFSEvents(root, callback);
		},
		async replayFSJournal(events: FilesystemOperation[]) {
			return phpApi.replayFSJournal(events);
		},
		async addEventListener(event, listener) {
			return await phpApi.addEventListener(event, listener);
		},
		async removeEventListener(event, listener) {
			return await phpApi.removeEventListener(event, listener);
		},
		async setProgress(options: ProgressBarOptions) {
			if (!bar) {
				throw new Error('Progress bar not available');
			}
			bar.setOptions(options);
		},
		async setLoaded() {
			if (!bar) {
				throw new Error('Progress bar not available');
			}
			bar.destroy();
		},
		async onNavigation(fn) {
			// Manage the address bar
			wpFrame.addEventListener('load', async (e: any) => {
				try {
					const path = await playground.internalUrlToPath(
						e.currentTarget!.contentWindow.location.href
					);
					fn(path);
				} catch (e) {
					// @TODO: The above call can fail if the remote iframe
					// is embedded in StackBlitz, or presumably, any other
					// environment with restrictive CSP. Any error thrown
					// due to CORS-related stuff crashes the entire remote
					// so let's ignore it for now and find a correct fix in time.
				}
			});
		},
		async goTo(requestedPath: string) {
			if (!requestedPath.startsWith('/')) {
				requestedPath = '/' + requestedPath;
			}
			const newUrl = await playground.pathToInternalUrl(requestedPath);
			const oldUrl = wpFrame.src;

			// If the URL is the same, we need to force a reload
			// because otherwise the iframe will not reload the page.
			if (newUrl === oldUrl && wpFrame.contentWindow) {
				try {
					wpFrame.contentWindow.location.href = newUrl;
					return;
				} catch (e) {
					// The above call can fail if we're embedded in an
					// environment with a restrictive CSP policy.
				}
			}
			wpFrame.src = newUrl;
		},
		async getCurrentURL() {
			let url = '';
			try {
				url = wpFrame.contentWindow!.location.href;
			} catch (e) {
				// The above call can fail if we're embedded in an
				// environment with a restrictive CSP policy.
			}
			if (!url) {
				// If we can't get the URL from the iframe (e.g. it's not loaded
				// yet), let's refer to the src attribute of the iframe itself.
				// This is less reliable because the src attribute may not be
				// updated when the iframe navigates to a new URL.
				url = wpFrame.src;
			}
			return await playground.internalUrlToPath(url);
		},
		async setIframeSandboxFlags(flags: string[]) {
			wpFrame.setAttribute('sandbox', flags.join(' '));
		},
		/**
		 * This function is merely here to explicitly call workerApi.onMessage.
		 * Comlink should be able to handle that on its own, but something goes
		 * wrong and if this function is not here, we see the following error:
		 *
		 * Error: Failed to execute 'postMessage' on 'Worker': function() {
		 * } could not be cloned.
		 *
		 * In the future, this explicit declaration shouldn't be needed.
		 *
		 * @param callback
		 * @returns
		 */
		async onMessage(callback: MessageListener) {
			return await phpApi.onMessage(callback);
		},
		/**
		 * Ditto for this function.
		 * @see onMessage
		 * @param callback
		 * @returns
		 */
		async bindOpfs(
			options: BindOpfsOptions,
			onProgress?: SyncProgressCallback
		) {
			return await phpApi.bindOpfs(options, onProgress);
		},

		/**
		 * Download WordPress assets.
		 * @see backfillStaticFilesRemovedFromMinifiedBuild in the worker-thread.ts
		 */
		async backfillStaticFilesRemovedFromMinifiedBuild() {
			await phpApi.backfillStaticFilesRemovedFromMinifiedBuild();
		},

		/**
		 * Checks whether we have the missing WordPress assets readily
		 * available in the request cache.
		 */
		async hasCachedStaticFilesRemovedFromMinifiedBuild() {
			return await phpApi.hasCachedStaticFilesRemovedFromMinifiedBuild();
		},
	};

	await phpApi.isConnected();

	// If onDownloadProgress is not explicitly re-exposed here,
	// Comlink will throw an error and claim the callback
	// cannot be cloned. Adding a transfer handler for functions
	// doesn't help:
	// https://github.com/GoogleChromeLabs/comlink/issues/426#issuecomment-578401454
	// @TODO: Handle the callback conversion automatically and don't explicitly re-expose
	//        the onDownloadProgress method
	const [setAPIReady, setAPIError, playground] = exposeAPI(webApi, phpApi);

	try {
		await phpApi.isReady();

		setupPostMessageRelay(
			wpFrame,
			getOrigin((await playground.absoluteUrl)!)
		);
		setupMountListener(playground);
		if (withNetworking) {
			await setupFetchNetworkTransport(phpApi);
		}

		setAPIReady();
	} catch (e) {
		setAPIError(e as Error);
		throw e;
	}

	/**
	 * When we're running WordPress from a minified bundle, we're missing some static assets.
	 * The section below backfills them if needed. It doesn't do anything if the assets are already
	 * in place, or when WordPress is loaded from a non-minified bundle.
	 *
	 * Minified bundles are shipped without most static assets to reduce the bundle size and
	 * the loading time. When WordPress loads for the first time, the browser parses all the
	 * <script src="">, <link href="">, etc. tags and fetches the missing assets from the server.
	 *
	 * Unfortunately, fetching these assets on demand wouldn't work in an offline mode.
	 *
	 * Below we're downloading a zipped bundle of the missing assets.
	 */
	if (await webApi.hasCachedStaticFilesRemovedFromMinifiedBuild()) {
		/**
		 * If we already have the static assets in the cache, the backfilling only
		 * involves unzipping the archive. This is fast. Let's do it before the first
		 * render.
		 *
		 * Why?
		 *
		 * Because otherwise the initial offline page render would lack CSS.
		 * Without the static assets in /wordpress/wp-content, the browser would
		 * attempt to fetch them from the server. However, we're in an offline mode
		 * so nothing would be fetched.
		 */
		await webApi.backfillStaticFilesRemovedFromMinifiedBuild();
	} else {
		/**
		 * If we don't have the static assets in the cache, we need to fetch them.
		 *
		 * Let's wait for the initial page load before we start the backfilling.
		 * The static assets are 12MB+ in size. Starting the download before
		 * Playground is loaded would noticeably delay the first paint.
		 */
		wpFrame.addEventListener('load', () => {
			webApi.backfillStaticFilesRemovedFromMinifiedBuild();
		});
	}

	/*
	 * An assertion to make sure Playground Client is compatible
	 * with Remote<PlaygroundClient>
	 */
	return playground;
}

function getOrigin(url: string) {
	return new URL(url, 'https://example.com').origin;
}

function setupMountListener(playground: WebClientMixin) {
	window.addEventListener('message', async (event) => {
		if (typeof event.data !== 'object') {
			return;
		}
		if (event.data.type !== 'mount-directory-handle') {
			return;
		}
		if (typeof event.data.directoryHandle !== 'object') {
			return;
		}
		if (!event.data.mountpoint) {
			return;
		}
		await playground.bindOpfs({
			opfs: event.data.directoryHandle,
			mountpoint: event.data.mountpoint,
		});
	});
}

function parseVersion<T>(value: string | undefined | null, latest: T) {
	if (!value || value === 'latest') {
		return latest as string;
	}
	return value;
}

function parseList<T>(value: string[], list: readonly T[]) {
	if (!value) {
		return [];
	}
	return value.filter((item) => list.includes(item as any));
}

/**
 * When the service worker fails for any reason, the page displayed inside
 * the iframe won't be a WordPress instance we expect from the service worker.
 * Instead, it will be the original page trying to load the service worker. This
 * causes an infinite loop with a loader inside a loader inside a loader.
 */
function assertNotInfiniteLoadingLoop() {
	let isBrowserInABrowser = false;
	try {
		isBrowserInABrowser =
			window.parent !== window &&
			(window as any).parent.IS_WASM_WORDPRESS;
	} catch (e) {
		// ignore
	}
	if (isBrowserInABrowser) {
		throw new Error(
			`The service worker did not load correctly. This is a bug,
			please report it on https://github.com/WordPress/wordpress-playground/issues`
		);
	}
	(window as any).IS_WASM_WORDPRESS = true;
}
