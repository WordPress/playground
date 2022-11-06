# Run PHP in the browser

Uses [php-wasm](../php-wasm/) and [php-wasm-browser](../php-wasm-browser/) to run WordPress fully in the browser without any PHP server.

The documentation for both is quite comprehensive, but this README file is still a work in progress. Fortunately, this package is rather thin and mostly uses the APIs provided by the other two. Please read the other two documents and then refer directly to the code in the [php-wasm](./src/) directory to learn more.

## Customizing the WordPress installation

You can customize the WordPress installation by adjusting the [Dockerfile](./wordpress/Dockerfile) that generates the `wp.data` Data Dependency bundle.

Once you're finished, rebuild WordPress by running:

```bash
npm run build:wp
```

## Other notes

* WordPress is configured to use SQLite instead of MySQL. This is possible thanks to https://github.com/aaemnnosttv/wp-sqlite-db.
* The static files (.js, .css, etc.) are served directly from the server filesystem, not from the WebAssembly bundle.
* PHP cannot communicate with the WordPress.org API yet, so the plugin directory etc does not work.
* The sqlite database lives in the memory and the changes only live as long as the loaded page.
