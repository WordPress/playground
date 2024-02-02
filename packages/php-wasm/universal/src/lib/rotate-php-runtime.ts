import { BasePHP } from './base-php';

export interface RotateOptions<T extends BasePHP> {
	php: T;
	recreateRuntime: () => Promise<number> | number;
	maxRequests: number;
}

/**
 * Listens to PHP events and swaps the internal PHP Runtime for a fresh one
 * after a certain number of run() calls (which are responsible for handling
 * HTTP requests).
 *
 * Why? Because PHP and PHP extension have a memory leak. Each request leaves
 * the memory a bit more fragmented and with a bit less available space than
 * before. Eventually, new allocations start failing.
 *
 * Rotating the PHP instance may seem like a workaround, but it's actually
 * what PHP-FPM does natively:
 *
 * https://www.php.net/manual/en/install.fpm.configuration.php#pm.max-tasks
 *
 * @return cleanup function to restore
 */
export function rotatePHPRuntime<T extends BasePHP>({
	php,
	recreateRuntime,
	maxRequests,
}: RotateOptions<T>) {
	let handledCalls = 0;
	async function rotateRuntime() {
		if (++handledCalls < maxRequests) {
			return;
		}
		handledCalls = 0;

		const release = await php.semaphore.acquire();
		try {
			php.hotSwapPHPRuntime(await recreateRuntime());
		} finally {
			release();
		}
	}
	php.addEventListener('request.end', rotateRuntime);
	return function () {
		php.removeEventListener('request.end', rotateRuntime);
	};
}
