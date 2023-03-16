/**
 * Due to the way vite works, php.wasm files are resolved by
 * rollup even in modules that do not import them but only
 * import `@wp-playground/playground-client` that has a dependency
 * on `@wp-playground/php-wasm-web`. This leads to the following error:
 *
 *     Could not load /php-8.2.wasm
 *
 * This plugin turns .wasm files into noop imports to fix the bundling of
 * dependent packages.
 */
export default () => ({
	name: 'ignore-wasm-imports',

	load(id: string): any {
		if (id?.endsWith('.wasm')) {
			return {
				code: 'export default {}',
				map: null,
			};
		}
	},
});
