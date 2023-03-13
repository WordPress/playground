export const recommendedWorkerBackend = (function () {
	// Firefox doesn't support module workers with dynamic imports,
	// let's fall back to iframe workers.
	// See https://github.com/mdn/content/issues/24402
	const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
	if (isFirefox) {
		return 'iframe';
	} else {
		return 'webworker';
	}
})();

/**
 * Spawns a new Worker Thread.
 *
 * @param  workerUrl The absolute URL of the worker script.
 * @param  workerBackend     The Worker Thread backend to use. Either 'webworker' or 'iframe'.
 * @param  config
 * @returns The spawned Worker Thread.
 */
export function spawnPHPWorkerThread(
	workerUrl: string,
	workerBackend: 'webworker' | 'iframe' = 'webworker',
	startupOptions: Record<string, string> = {}
) {
	workerUrl = addQueryParams(workerUrl, startupOptions);

	if (workerBackend === 'webworker') {
		return new Worker(workerUrl, { type: 'module' });
	} else if (workerBackend === 'iframe') {
		return createIframe(workerUrl).contentWindow!;
	} else {
		throw new Error(`Unknown backendName: ${workerBackend}`);
	}
}

function addQueryParams(url, searchParams: Record<string, string>) {
	if (!Object.entries(searchParams).length) {
		return url;
	}
	const urlWithOptions = new URL(url);
	for (const [key, value] of Object.entries(searchParams)) {
		urlWithOptions.searchParams.set(key, value);
	}
	return urlWithOptions.toString();
}

function createIframe( workerDocumentURL: string ) {
	const iframe = document.createElement('iframe');
	iframe.src = workerDocumentURL;
	iframe.style.display = 'none';
	document.body.appendChild(iframe);
	return iframe;
}
