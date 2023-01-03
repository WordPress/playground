import { bootWordPress } from './boot';
import { login, installPlugin, installTheme } from './wp-macros';
import {
	cloneResponseMonitorProgress,
	responseTo,
} from '../php-wasm-browser/index';
import { ProgressObserver, ProgressType } from './progress-observer';
import { PromiseQueue } from './promise-queue';

const query = new URL(document.location.href).searchParams as any;

const wpFrame = document.querySelector('#wp') as HTMLIFrameElement;

let isBooted = false;

async function main() {
	const preinstallPlugins = query.getAll('plugin').map(toZipName);
	// Don't preinstall the default theme
	const queryTheme =
		query.get('theme') === 'twentytwentythree' ? null : query.get('theme');
	const preinstallTheme = toZipName(queryTheme);

	const installPluginProgress = Math.min(preinstallPlugins.length * 15, 45);
	const installThemeProgress = preinstallTheme ? 20 : 0;
	const bootProgress = 100 - installPluginProgress - installThemeProgress;

	const progress = setupProgressBar();
	const workerThread = await bootWordPress({
		onWasmDownloadProgress: progress.partialObserver(
			bootProgress,
			'Preparing WordPress...'
		),
		phpVersion: query.get('php'),
		dataModule: query.get('wp'),
	});
	const appMode = query.get('mode') === 'seamless' ? 'seamless' : 'browser';
	if (appMode === 'browser') {
		setupAddressBar(workerThread);
	}

	if (query.get('login') || preinstallPlugins.length || query.get('theme')) {
		await login(workerThread, 'admin', 'password');
	}

	if (preinstallTheme) {
		// Download the theme file
		const response = cloneResponseMonitorProgress(
			await fetch('/plugin-proxy?theme=' + preinstallTheme),
			progress.partialObserver(
				installThemeProgress - 10,
				`Installing ${zipNameToHumanName(preinstallTheme)} theme...`
			)
		);
		progress.slowlyIncrementBy(10);

		if (response.status === 200) {
			const themeFile = new File(
				[await response.blob()],
				preinstallTheme
			);

			try {
				await installTheme(workerThread, themeFile);
			} catch (error) {
				console.error(
					`Proceeding without the ${preinstallTheme} theme. Could not install it in wp-admin. ` +
						`The original error was: ${error}`
				);
				console.error(error);
			}
		} else {
			console.error(
				`Proceeding without the ${preinstallTheme} theme. Could not download the zip bundle from https://downloads.wordpress.org/themes/${preinstallTheme} – ` +
					`Is the file name correct?`
			);
		}
	}

	if (preinstallPlugins.length) {
		const downloads = new PromiseQueue();
		const installations = new PromiseQueue();

		const progressBudgetPerPlugin =
			installPluginProgress / preinstallPlugins.length;

		/**
		 * Install multiple plugins to minimize the processing time.
		 *
		 * The downloads are done one after another to get installable
		 * zip files as soon as possible. Each completed download triggers
		 * plugin installation without waiting for the next download to
		 * complete.
		 */
		await new Promise((finish) => {
			for (const preinstallPlugin of preinstallPlugins) {
				downloads.enqueue(async () => {
					const response = cloneResponseMonitorProgress(
						await fetch('/plugin-proxy?plugin=' + preinstallPlugin),
						progress.partialObserver(
							progressBudgetPerPlugin * 0.66,
							`Installing ${zipNameToHumanName(
								preinstallPlugin
							)} plugin...`
						)
					);
					if (response.status !== 200) {
						console.error(
							`Proceeding without the ${preinstallPlugin} plugin. Could not download the zip bundle from https://downloads.wordpress.org/plugin/${preinstallPlugin} – ` +
								`Is the file name correct?`
						);
						return null;
					}
					return new File([await response.blob()], preinstallPlugin);
				});
			}
			downloads.addEventListener('resolved', (e: any) => {
				installations.enqueue(async () => {
					if (!e.detail) {
						return;
					}
					progress.slowlyIncrementBy(progressBudgetPerPlugin * 0.33);
					try {
						await installPlugin(workerThread, e.detail as File);
					} catch (error) {
						console.error(
							`Proceeding without the ${e.detail.name} plugin. Could not install it in wp-admin. ` +
								`The original error was: ${error}`
						);
						console.error(error);
					}
				});
			});
			installations.addEventListener('empty', () => {
				if (installations.resolved === preinstallPlugins.length) {
					finish(null);
				}
			});
		});
	}

	if (query.get('rpc')) {
		console.log('Registering an RPC handler');
		async function handleMessage(data) {
			if (data.type === 'rpc') {
				return await workerThread[data.method](...data.args);
			} else if (data.type === 'go_to') {
				wpFrame.src = workerThread.pathToInternalUrl(data.path);
			} else if (data.type === 'is_alive') {
				return true;
			} else if (data.type === 'is_booted') {
				return isBooted;
			}
		}
		window.addEventListener('message', async (event) => {
			const result = await handleMessage(event.data);

			// When `requestId` is present, the other thread expects a response:
			if (event.data.requestId) {
				const response = responseTo(event.data.requestId, result);
				window.parent.postMessage(response, '*');
			}
		});

		// Notify the parent window about any URL changes in the
		// WordPress iframe
		wpFrame.addEventListener('load', (e: any) => {
			window.parent.postMessage(
				{
					type: 'new_path',
					path: workerThread.internalUrlToPath(
						e.currentTarget!.contentWindow.location.href
					),
				},
				'*'
			);
		});
	}

	if (query.has('ide')) {
		let doneFirstBoot = false;
		const { WordPressPluginIDE, createBlockPluginFixture } = await import(
			// eslint-disable-next-line import/no-unresolved
			'../wordpress-plugin-ide/index.js'
		);
		const { default: React } = await import('react');
		const {
			default: { render },
		} = await import('react-dom');
		render(
			<WordPressPluginIDE
				plugin={createBlockPluginFixture}
				workerThread={workerThread}
				initialEditedFile="edit.js"
				onBundleReady={(bundleContents: string) => {
					if (doneFirstBoot) {
						(wpFrame.contentWindow as any).eval(bundleContents);
					} else {
						doneFirstBoot = true;
						wpFrame.src = workerThread.pathToInternalUrl(
							query.get('url') || '/'
						);
					}
				}}
			/>,
			document.getElementById('test-snippets')!
		);
	} else {
		wpFrame.src = workerThread.pathToInternalUrl(query.get('url') || '/');
	}
	isBooted = true;
}

function toZipName(rawInput) {
	if (!rawInput) {
		return rawInput;
	}
	if (rawInput.endsWith('.zip')) {
		return rawInput;
	}
	return rawInput + '.latest-stable.zip';
}

function setupAddressBar(wasmWorker) {
	// Manage the address bar
	const addressBar = document.querySelector('#url-bar')! as HTMLInputElement;
	wpFrame.addEventListener('load', (e: any) => {
		addressBar.value = wasmWorker.internalUrlToPath(
			e.currentTarget!.contentWindow.location.href
		);
	});

	document.querySelector('#url-bar-form')!.addEventListener('submit', (e) => {
		e.preventDefault();
		let requestedPath = addressBar.value;
		// Ensure a trailing slash when requesting directory paths
		const isDirectory = !requestedPath.split('/').pop()!.includes('.');
		if (isDirectory && !requestedPath.endsWith('/')) {
			requestedPath += '/';
		}
		wpFrame.src = wasmWorker.pathToInternalUrl(requestedPath);
		(
			document.querySelector('#url-bar-form input[type="text"]')! as any
		).blur();
	});
}

function setupProgressBar() {
	// Hide the progress bar when the page is first loaded.
	const HideProgressBar = () => {
		document
			.querySelector('body.is-loading')!
			.classList.remove('is-loading');
		wpFrame.removeEventListener('load', HideProgressBar);
	};
	wpFrame.addEventListener('load', HideProgressBar);

	const progress = new ProgressObserver(
		(progressPercentage, mode, caption) => {
			const infiniteWrapper = document.querySelector(
				'.progress-bar-wrapper.mode-infinite'
			);
			if (infiniteWrapper) {
				infiniteWrapper.classList.remove('mode-infinite');
				infiniteWrapper.classList.add('mode-finite');
			}
			if (caption && caption.length) {
				const captionElement = document.querySelector(
					'.progress-bar-overlay-caption'
				) as HTMLElement;

				if (captionElement) {
					captionElement.innerText = caption;
				}
			}

			const progressBarEl = document.querySelector(
				'.progress-bar.is-finite'
			) as any;
			if (mode === ProgressType.SLOWLY_INCREMENT) {
				progressBarEl.classList.add('slowly-incrementing');
			} else {
				progressBarEl.classList.remove('slowly-incrementing');
			}
			progressBarEl.style.width = `${progressPercentage}%`;
		}
	);

	return progress;
}

function zipNameToHumanName(zipName) {
	const mixedCaseName = zipName.split('.').shift()!.replace('-', ' ');
	return (
		mixedCaseName.charAt(0).toUpperCase() +
		mixedCaseName.slice(1).toLowerCase()
	);
}

main();
