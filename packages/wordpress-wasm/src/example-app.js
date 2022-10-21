import { bootWordPress } from './index'
import { login, installPlugin } from './macros'
import { cloneResponseMonitorProgress } from 'php-wasm-browser'

function setupAddressBar(wasmWorker) {
    // Manage the address bar
    const addressBar = document.querySelector("#address-bar");
    wpFrame.addEventListener("load", (e) => {
        addressBar.value = wasmWorker.internalUrlToPath(
            e.currentTarget.contentWindow.location.href
        );
    });

    document
        .querySelector("#address-bar-form")
        .addEventListener("submit", (e) => {
            e.preventDefault();
            wpFrame.src = wasmWorker.pathToInternalUrl(
            addressBar.value
            );
        });
}

class FetchProgressBar {
    constructor({
        expectedRequests,
        min=0,
        max=100
    }) {
        this.expectedRequests = expectedRequests;
        this.progress = {};
        this.min = min;
        this.max = max;
        this.el = document.querySelector(".progress-bar.is-finite");

        // Hide the progress bar when the page is first loaded.
        const wpFrame = document.querySelector("#wp");
        const hideProgressBar = () => {
            document.querySelector("body.is-loading")
                    .classList.remove("is-loading");
            wpFrame.removeEventListener("load", hideProgressBar);
        };
        wpFrame.addEventListener("load", hideProgressBar);
    }

    onDataChunk = ({ file, loaded, total }) => {
        if (Object.keys(this.progress).length === 0) {
            this.setFinite()
        }

        this.progress[file] = loaded / total;
        const progressSum = Object.entries(this.progress).reduce(
            (acc, [_, percentFinished]) => acc + percentFinished,
            0
        );
        const totalProgress = Math.min(1, progressSum / this.expectedRequests);
        const scaledProgressPercentage = this.min + (this.max - this.min) * totalProgress;

        this.setProgress(scaledProgressPercentage);
    }

    setProgress(percent) {
        this.el.style.width = `${percent}%`;
    }

    setFinite() {
        const classList = document.querySelector(
            ".progress-bar-wrapper.mode-infinite"
        ).classList;
        classList.remove("mode-infinite");
        classList.add("mode-finite");
    }
}

const wpFrame = document.querySelector("#wp");
async function main() {
    const preinstallPlugin = query.get('plugin');
    let progressBar;
    let pluginResponse;
    if(preinstallPlugin) {
        pluginResponse = await fetch('/plugin-proxy?plugin=' + preinstallPlugin);
        progressBar = new FetchProgressBar({
            expectedRequests: 3,
            max: 80
        });
    } else {
        progressBar = new FetchProgressBar({ expectedRequests: 2 });
    }

    const workerThread = await bootWordPress({
        onWasmDownloadProgress: progressBar.onDataChunk
    });
    if (appMode === 'browser') {
        setupAddressBar(workerThread);
    }

    if (preinstallPlugin) {
        // Download the plugin file
        const progressPluginResponse = cloneResponseMonitorProgress(
            pluginResponse,
            (progress) => progressBar.onDataChunk({ file: preinstallPlugin, ...progress })
        );
        const blob = await progressPluginResponse.blob();
        const pluginFile = new File([blob], preinstallPlugin);

        // We can't tell how long the operations below
        // will take. Let's slow down the CSS width transition
        // to at least give some impression of progress.
        progressBar.el.classList.add('indeterminate');
        // We're at 80 already, but it's a nice reminder.
        progressBar.setProgress(80);

        progressBar.setProgress(85);
        await login(workerThread, 'admin', 'password');

        progressBar.setProgress(100);
        await installPlugin(workerThread, pluginFile);
    }
    
    const initialUrl = query.get('url') || '/';
    wpFrame.src = workerThread.pathToInternalUrl(initialUrl);
}
main();
