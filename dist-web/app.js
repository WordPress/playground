(() => {
  // src/shared/messaging.mjs
  function postMessageFactory(target) {
    let lastRequestId = 0;
    return function postMessage(data, timeout = 5e4) {
      return new Promise((resolve, reject) => {
        const requestId = ++lastRequestId;
        const responseHandler = (event) => {
          if (event.data.type === "response" && event.data.requestId === requestId) {
            target.removeEventListener("message", responseHandler);
            clearTimeout(failOntimeout);
            resolve(event.data.result);
          }
        };
        const failOntimeout = setTimeout(() => {
          reject("Request timed out");
          target.removeEventListener("message", responseHandler);
        }, timeout);
        target.addEventListener("message", responseHandler);
        target.postMessage({
          ...data,
          requestId
        });
      });
    };
  }
  function replyTo(event, result, target) {
    target.postMessage({
      type: "response",
      requestId: event.data.requestId,
      result
    }, event.origin);
  }

  // src/web/app.mjs
  if (!navigator.serviceWorker) {
    alert("Service workers are not supported by your browser");
  }
  var serviceWorkerReady = navigator.serviceWorker.register(`/service-worker.js`);
  var workerChannel = document.querySelector("iframe").contentWindow;
  var webWorkerReady = new Promise((resolve) => {
    const callback = (event) => {
      if (event.data.type === "ready") {
        resolve();
        workerChannel.removeEventListener("message", callback);
      }
    };
    workerChannel.addEventListener("message", callback);
  });
  async function init() {
    await serviceWorkerReady;
    await webWorkerReady;
    const postMessage = postMessageFactory(workerChannel);
    workerChannel.addEventListener("message", async (event) => {
      if (event.data.type === "goto") {
        document.querySelector("#wp").src = event.data.path;
      }
      console.log("[APP.js] Got a message", event);
      const response = await postMessage(event.data);
      console.log("[APP.js] Got a response", response);
      replyTo(event, response, parent);
    });
    document.querySelector("#wp").src = "/wp-login.php";
  }
  init();
})();
