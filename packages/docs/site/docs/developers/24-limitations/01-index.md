---
slug: /developers/limitations
---

# Limitations

WordPress Playground is under active development and has some limitations you should keep in mind when running it and developing with it.

You can track the status of these issues on the [Playground Project board](https://github.com/orgs/WordPress/projects/180).

## In the browser

### Access the Plugins, Themes, Blocks, or Patterns directories

Playground [disables network connections](/blueprints/data-format#features) by default, blocking access to wp.org assets (themes, plugins, blocks, or patterns) in `wp-admin`. You can still upload zipped plugin and theme files from your device or enable the option via the [Query API](/developers/apis/query-api#available-options) or [Blueprints API](/blueprints/troubleshoot-and-debug#review-common-gotchas).

### Temporary by design

As Playground [streams rather than serves](/about#streamed-not-served) WordPress, all database changes and uploads will be gone when you refresh the page. To avoid losing your work, either [export your work](/quick-start-guide#save-your-site) before or enable storage in the browser/device via the "Save" button found in the "Open Site Manager" menu on the top left of the site.

<details>  
  <summary>Click for a screenshot</summary>    
  <div>    
	 <img width="406" alt="Open Site Manager" src="https://github.com/user-attachments/assets/f66e4116-069c-4764-9305-3cec03eb72d5" />
  </div>
	<br>
	<div>
<img width="408" alt="Save Button" src="https://github.com/user-attachments/assets/a677fbff-2346-4579-9543-56e33e8e42b9" />

  </div>    
</details>

## When developing with Playground

### Iframe quirks

Playground renders WordPress in an `iframe` so clicking links with `target="_top"` will reload the page you’re working on.
Also, JavaScript popups originating in the `iframe` may not always display.

### Run WordPress PHP functions

Playground supports running PHP code in Blueprints using the [`runPHP` step](blueprints/steps#RunPHPStep). To run WordPress-specific PHP functions, you’d need to first require [wp-load.php](https://github.com/WordPress/WordPress/blob/master/wp-load.php):

```json
{
  "step": "runPHP",
  "code": "<?php require_once('wordpress/wp-load.php'); OTHER_CODE ?>"
}
```

### Using WP-CLI

You can execute `wp-cli` commands via the Blueprints [`wp-cli`](/blueprints/steps#WPCLIStep) step. However, since Playground runs in the browser, it doesn't support the [full array](https://developer.wordpress.org/cli/commands/) of available commands. While there is no definite list of supported commands, experimenting in [the online demo](https://playground.wordpress.net/demos/wp-cli.html) will help you assess what's possible.
