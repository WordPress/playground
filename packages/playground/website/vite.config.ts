/// <reference types="vitest" />
import { defineConfig } from 'vite';
import type { ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { viteTsConfigPaths } from '../../vite-ts-config-paths';
// eslint-disable-next-line @nx/enforce-module-boundaries
import ignoreWasmImports from '../ignore-wasm-imports';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
	websiteDevServerHost,
	websiteDevServerPort,
	remoteDevServerHost,
	remoteDevServerPort,
} from '../build-config';
// eslint-disable-next-line @nx/enforce-module-boundaries
import virtualModule from '../vite-virtual-module';
import { oAuthMiddleware } from './vite.oauth';
import { fileURLToPath } from 'node:url';

const proxy = {
	'^/plugin-proxy': {
		target: 'https://playground.wordpress.net',
		changeOrigin: true,
		secure: true,
	},
};

let buildVersion: string;
try {
	buildVersion = execSync('git rev-parse HEAD').toString().trim();
} catch (e) {
	buildVersion = (new Date().getTime() / 1000).toFixed(0);
}

export default defineConfig(({ command, mode }) => {
	return {
		// Split traffic from this server on dev so that the iframe content and outer
		// content can be served from the same origin. In production it's already
		// the same host, but dev builds run two separate servers.
		// See proxy config above.
		base: mode === 'production' ? '/' : '/website-server/',

		cacheDir: '../../../node_modules/.vite/packages-playground-website',

		css: {
			modules: {
				localsConvention: 'camelCaseOnly',
			},
		},

		preview: {
			port: websiteDevServerPort,
			host: websiteDevServerHost,
			proxy,
		},

		server: {
			port: websiteDevServerPort,
			host: websiteDevServerHost,
			proxy: {
				...proxy,
				// Proxy requests to the remote content through this server for dev builds.
				// See base config below.
				'^[/]((?!website-server).)': {
					target: `http://${remoteDevServerHost}:${remoteDevServerPort}`,
				},
			},
			fs: {
				strict: false, // Serve files from the other project directories.
			},
		},

		plugins: [
			react({
				jsxRuntime: 'classic',
			}),
			viteTsConfigPaths({
				root: '../../../',
			}),
			ignoreWasmImports(),
			virtualModule({
				name: 'website-config',
				content: `
				export const buildVersion = ${JSON.stringify(buildVersion)};`,
			}),
			// GitHub OAuth flow
			{
				name: 'configure-server',
				configureServer(server: ViteDevServer) {
					server.middlewares.use(oAuthMiddleware);
				},
			},
		],

		// Configuration for building your library.
		// See: https://vitejs.dev/guide/build.html#library-mode
		build: {
			rollupOptions: {
				input: {
					index: fileURLToPath(
						new URL('./index.html', import.meta.url)
					),
					'sync.html': fileURLToPath(
						new URL('./demos/sync.html', import.meta.url)
					),
					'peer.html': fileURLToPath(
						new URL('./demos/peer.html', import.meta.url)
					),
					'time-traveling.html': fileURLToPath(
						new URL('./demos/time-traveling.html', import.meta.url)
					),
				},
				// output: {
				// 	entryFileNames: (assetInfo) => {
				// 		const isHTML = assetInfo?.facadeModuleId?.endsWith('.html');
				// 		if (isHTML) {
				// 			return '[name].html';
				// 		}
				// 		return '[name]-[hash].js';
				// 	},
				// },
				external: [],
			},
		},

		test: {
			globals: true,
			cache: {
				dir: '../../../node_modules/.vitest',
			},
			environment: 'jsdom',
			include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		},
	};
});
