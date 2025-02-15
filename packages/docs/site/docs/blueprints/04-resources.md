---
slug: /blueprints/steps/resources
---

# Resources References

"Resource References" allow you use external files in Blueprints

:::info
Blueprints steps such as [`installPlugin`](/blueprints/steps#InstallPluginStep) or [`installTheme`](/blueprints/steps#InstallThemeStep) require a location of the plugin or theme to be installed.

That location can be defined as [a `URL` resource](#urlreference) of the `.zip` file containing the theme or plugin. It can also be defined as a [`wordpress.org/plugins`](#corepluginreference) or [`wordpress.org/themes`](#corethemereference) resource for those plugins/themes published in the official WordPress directories.
:::

The following resource references are available:

import TOCInline from '@theme/TOCInline';

<TOCInline toc={toc} />

### URLReference

The `URLReference` resource is used to reference files that are stored on a remote server. The `URLReference` resource is defined as follows:

```typescript
type URLReference = {
	resource: 'url';
	url: string;
};
```

To use the `URLReference` resource, you need to provide the URL of the file. For example, to reference a file named "index.html" that is stored on a remote server, you can create a `URLReference` as follows:

```json
{
	"resource": "url",
	"url": "https://example.com/index.html"
}
```

The resource `url` type works really in combination with blueprint steps such as [`installPlugin`](/blueprints/steps#InstallPluginStep) or
[`installTheme`](http://localhost:3000/wordpress-playground/blueprints/steps#InstallThemeStep).
These steps require a `ResourceType` to define the location of the plugin or the theme to install.

With a `"resource": "url"` we can define the location of a `.zip` containing the plugin/theme via a URL that can point directly to a GitHub repo.

:::tip
The Playground project provides a [GitHub Proxy](https://playground.wordpress.net/proxy) that allows you to generate a `.zip` from a repository (or even a folder inside a repo) containing your plugin or theme. This tool is very useful for avoiding CORS issues, among others.
:::

### CoreThemeReference

The _CoreThemeReference_ resource is used to reference WordPress core themes. The _CoreThemeReference_ resource is defined as follows:

```typescript
type CoreThemeReference = {
	resource: 'wordpress.org/themes';
	slug: string;
	version?: string;
};
```

To use the _CoreThemeReference_ resource, you need to provide the slug of the theme. For example, to reference the "Twenty Twenty-One" theme, you can create a _CoreThemeReference_ as follows:

```json
{
	"resource": "wordpress.org/themes",
	"slug": "twentytwentyone"
}
```

### CorePluginReference

The _CorePluginReference_ resource is used to reference WordPress core plugins. The _CorePluginReference_ resource is defined as follows:

```typescript
type CorePluginReference = {
	resource: 'wordpress.org/plugins';
	slug: string;
	version?: string;
};
```

To use the _CorePluginReference_ resource, you need to provide the slug of the plugin. For example, to reference the "Akismet" plugin, you can create a _CorePluginReference_ as follows:

```json
{
	"resource": "wordpress.org/plugins",
	"slug": "akismet"
}
```

### VFSReference

The _VFSReference_ resource is used to reference files that are stored in a virtual file system (VFS). The VFS is a file system that is stored in memory and can be used to store files that are not part of the file system of the operating system. The _VFSReference_ resource is defined as follows:

```typescript
type VFSReference = {
	resource: 'vfs';
	path: string;
};
```

To use the _VFSReference_ resource, you need to provide the path to the file in the VFS. For example, to reference a file named "index.html" that is stored in the root of the VFS, you can create a _VFSReference_ as follows:

```json
{
	"resource": "vfs",
	"path": "/index.html"
}
```

### LiteralReference

The _LiteralReference_ resource is used to reference files that are stored as literals in the code. The _LiteralReference_ resource is defined as follows:

```typescript
type LiteralReference = {
	resource: 'literal';
	name: string;
	contents: string | Uint8Array;
};
```

To use the _LiteralReference_ resource, you need to provide the name of the file and its contents. For example, to reference a file named "index.html" that contains the text "Hello, World!", you can create a _LiteralReference_ as follows:

```json
{
	"resource": "literal",
	"name": "index.html",
	"contents": "Hello, World!"
}
```
