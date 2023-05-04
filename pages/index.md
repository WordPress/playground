# WordPress Playground

WordPress Playground is a WordPress running in the browser without a PHP server.

## Getting started

[Try the demo](https://developer.wordpress.org/playground/demo/) to experiment with an anonymous WordPress website where you can test-drive plugins and themes.

### Embedding the WordPress Playground demo

You can embed WordPress Playground using an iframe. **Note this is an experimental feature that may break or change without a warning.**

```html
<iframe
	style="width: 800px; height: 500px;"
	src="https://playground.wordpress.net/?mode=seamless"
></iframe>
```

Learn more about the configuration options and JavaScript API at [embedding WordPress Playground on other websites](./embedding-wordpress-playground-on-other-websites.html).

### Setting up your local development environment

To customize WordPress Playground and build on top of it, you will need to work directly with the GitHub repository. Don't worry, **you don't need to know WebAssembly.** Most of the meaningful work happens in the JavaScript and PHP land.

Start by creating a local development environment:

```js
# Install Yarn if you don't have it:
npm install -g yarn

# Now you're ready to run Playground:
git clone https://github.com/WordPress/wordpress-playground
cd wordpress-playground
yarn install
yarn run dev
```

A browser should open and take you to your very own WordPress Playground at `http://127.0.0.1:5400/`!

Any changes you make to `.ts` files will be live-reloaded. Changes to `Dockerfile` require a full rebuild.

## Architecture overview

Here's a high-level breakdown of how WordPress Playground works:

-   `index.html` from Playground website connects to `remote.html` via an `<iframe src="/remote.html">`
-   `remote.html` starts a Worker Thread and a ServiceWorker and sends back the download progress information
-   The Worker Thread starts PHP and populates the filesystem with a WordPress patched to run on SQLite
-   The ServiceWorker starts intercepting all HTTP requests and forwarding them to the Worker Thread
-   `remote.html` creates an `<iframe src="/index.php">` where the WordPress homepage is rendered

Visually, it looks like this:

![Architecture overview](https://raw.githubusercontent.com/wordpress/wordpress-playground/trunk/pages/architecture-overview.png)

## Next steps

Dig into the specific parts of the project:

-   [Compiling PHP to WebAssembly and using it in JavaScript](./using-php-in-javascript.html)
-   [Running PHP apps in the browser with ServiceWorkers and Worker Threads](./using-php-in-the-browser.html)
-   [Bundling WordPress for the browser](./bundling-wordpress-for-the-browser.html)
-   [Running WordPress in the browser](./running-wordpress-in-the-browser.html)
-   [Embedding WordPress Playground on other websites](./embedding-wordpress-playground-on-other-websites.html)
-   [Implementing a live WordPress code editor](./wordpress-plugin-ide.html)
