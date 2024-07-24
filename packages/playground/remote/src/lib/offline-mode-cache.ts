import { isURLScoped } from '@php-wasm/scopes';

export class OfflineModeCache {
	readonly cacheNamePrefix = 'playground-cache';

	private cacheName: string;
	private hostname: string;

	constructor(cacheVersion: string, hostname: string) {
		this.hostname = hostname;
		this.cacheName = `${this.cacheNamePrefix}-${cacheVersion}`;
	}

	addCache = async (key: Request, response: Response) => {
		const clonedResponse = response.clone();
		const cache = await caches.open(this.cacheName);
		await cache.put(key, clonedResponse);
	};

	getCache = async (key: Request) => {
		const cache = caches.open(this.cacheName);
		return await cache.then((c) => c.match(key, { ignoreSearch: true }));
	};

	shouldCacheUrl = (url: URL) => {
		/**
		 * The development environment uses Vite which doesn't work offline because it dynamically generates assets.
		 * Check the README for offline development instructions.
		 */
		if (
			url.href.startsWith('http://127.0.0.1:5400/') ||
			url.href.startsWith('http://localhost:5400/') ||
			url.pathname.startsWith('/website-server/')
		) {
			return false;
		}

		/**
		 * Scoped URLs are requests made to the PHP Worker Thread.
		 * These requests are not cached because they are not static assets.
		 */
		if (isURLScoped(url)) {
			return false;
		}

		/**
		 * Don't cache PHP files because they are dynamic.
		 */
		if (url.pathname.endsWith('.php')) {
			return false;
		}

		/**
		 * Allow only requests to the same hostname to be cached.
		 */
		return this.hostname === url.hostname;
	};

	removeOutdatedFiles = async () => {
		const keys = await caches.keys();
		const oldKeys = keys.filter(
			(key) =>
				key.startsWith(this.cacheNamePrefix) && key !== this.cacheName
		);
		return Promise.all(oldKeys.map((key) => caches.delete(key)));
	};

	cachedFetch = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		if (!this.shouldCacheUrl(url)) {
			return await fetch(request);
		}
		const cacheKey = request;
		const cache = await this.getCache(cacheKey);
		if (cache) {
			return cache;
		}
		const response = await fetch(request);
		await this.addCache(cacheKey, response);
		return response;
	};

	cacheOfflineModeAssets = async (): Promise<any> => {
		if (!this.shouldCacheUrl(new URL(location.href))) {
			return;
		}

		const cache = await caches.open(this.cacheName);

		// Get the cache manifest and add all the files to the cache
		const manifestResponse = await fetch(
			'/assets-required-for-offline-mode.json'
		);
		const websiteUrls = await manifestResponse.json();
		await cache.addAll([...websiteUrls, ...['/']]);
	};
}
