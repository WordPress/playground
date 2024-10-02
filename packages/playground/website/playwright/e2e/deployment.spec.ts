/* eslint-disable no-loop-func */
import path from 'path';
import { test, expect } from '../playground-fixtures.ts';
import { startVersionSwitchingServer as startServer } from '../version-switching-server.ts';

const port = 7999;
const url = `http://localhost:${port}`;

const maxDiffPixels = 4000;

let server: Awaited<ReturnType<typeof startServer>> | null = null;

test.beforeEach(async () => {
	server = await startServer({
		port,
		oldVersionDirectory: path.join(
			__dirname,
			'../../../../../dist/packages/playground/wasm-wordpress-net-old'
		),
		newVersionDirectory: path.join(
			__dirname,
			'../../../../../dist/packages/playground/wasm-wordpress-net-new'
		),
	});
	server.switchToOldVersion();
	server.setHttpCacheEnabled(true);
});

test.afterEach(async () => {
	if (server) {
		server.kill();
	}
});

for (const cachingEnabled of [true, false]) {
	test(`When a new website version is deployed, it should be loaded upon a regular page refresh (with HTTP caching ${
		cachingEnabled ? 'enabled' : 'disabled'
	})`, async ({ website, page }) => {
		server!.setHttpCacheEnabled(cachingEnabled);

		await page.goto(url);
		await website.waitForNestedIframes();
		await expect(page).toHaveScreenshot('website-old.png', {
			maxDiffPixels,
		});

		server!.switchToNewVersion();
		await page.goto(url);
		await website.waitForNestedIframes();
		await expect(page).toHaveScreenshot('website-new.png', {
			maxDiffPixels,
		});
	});
}

test(
	'When a new website version is deployed while the old version is still opened in two browser tabs, ' +
		'both tabs should be upgraded to the new app version upon a regular page refresh',
	async ({ website, page, browser, browserName }) => {
		test.skip(
			browserName === 'webkit',
			`Playwright creates separate ephemeral browser contexts for each Safari page, ` +
				`which means they don't actually share the service worker and the first tab won't` +
				`be refreshed when the second tab updates its service worker registration.`
		);
		await page.goto(url);
		await website.waitForNestedIframes();
		await expect(page).toHaveScreenshot('website-old.png', {
			maxDiffPixels,
		});

		const page2 = await browser.newPage();
		await page2.goto(url);
		await website.waitForNestedIframes(page2);
		await expect(page2).toHaveScreenshot('website-old.png', {
			maxDiffPixels,
		});

		server!.switchToNewVersion();
		await page.goto(url);
		await website.waitForNestedIframes(page);

		await expect(page).toHaveScreenshot('website-new.png', {
			maxDiffPixels,
		});

		await website.waitForNestedIframes(page2);
		await expect(page2).toHaveScreenshot('website-new.png', {
			maxDiffPixels,
		});
	}
);

test('offline mode – the app should load even when the server goes offline', async ({
	website,
	page,
	browserName,
}) => {
	test.skip(
		browserName === 'webkit',
		`Playwright creates ephemeral browser contexts for each test, which causes the ` +
			`test to fail in Safari. Tl;dr Safari only allows OPFS access in regular, non-incognito ` +
			`browser tabs. See https://github.com/microsoft/playwright/issues/18235`
	);
	test.skip(
		browserName === 'firefox',
		`Playground's offline mode doesn't work in Firefox yet. ` +
			`See https://github.com/WordPress/wordpress-playground/issues/1645`
	);

	server!.switchToNewVersion();

	await page.goto(`${url}`);
	await website.waitForNestedIframes();
	// @TODO a better check – screenshot comparisons will be annoying to maintain
	await expect(page).toHaveScreenshot('website-online.png', {
		maxDiffPixels,
	});

	server!.kill();
	await page.reload();
	await website.waitForNestedIframes();
	await expect(page).toHaveScreenshot('website-online.png', {
		maxDiffPixels,
	});
});
