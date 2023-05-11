import fs from 'fs-extra';
import crypto from 'crypto';
import { NodePHP } from '@php-wasm/node';
import { SupportedPHPVersionsList } from '@php-wasm/universal';
import path from 'path';
import {
	SQLITE_FILENAME,
	SQLITE_PATH,
	WORDPRESS_VERSIONS_PATH,
	WP_NOW_PATH,
} from './constants';
import { downloadSqliteIntegrationPlugin, downloadWordPress } from './download';
import { portFinder } from './port-finder';
import { WPNowOptions, DEFAULT_OPTIONS, WPNowMode } from './config';
import {
	cp,
	defineSiteUrl,
	defineWpConfigConsts,
} from '@wp-playground/blueprints';
import {
	isPluginDirectory,
	isThemeDirectory,
	isWpContentDirectory,
	isWpCoreDirectory,
	isWpDevelopDirectory,
} from './wp-playground-wordpress';

async function getAbsoluteURL() {
	const port = await portFinder.getOpenPort();
	return `http://127.0.0.1:${port}`;
}

function seemsLikeAPHPFile(path) {
	return path.endsWith('.php') || path.includes('.php/');
}

export default class WPNow {
	php: NodePHP;
	options: WPNowOptions = DEFAULT_OPTIONS;

	static async create(options: WPNowOptions = {}): Promise<WPNow> {
		this.#validateOptions(options);
		const instance = new WPNow();
		const absoluteUrl = await getAbsoluteURL();
		const projectPath = options.projectPath || process.cwd();
		const wpContentPath = this.#getWpContentHomePath(projectPath);
		const mode = this.#inferMode(projectPath);
		await instance.#setup({
			absoluteUrl,
			projectPath,
			wpContentPath,
			mode,
			...options,
		});
		return instance;
	}

	updateFile = (path, callback) => {
		this.php.writeFile(path, callback(this.php.readFileAsText(path)));
	};

	async #setup(options: WPNowOptions = {}) {
		this.options = {
			...this.options,
			...options,
		};
		const { phpVersion, documentRoot, absoluteUrl } = this.options;
		this.php = await NodePHP.load(phpVersion, {
			requestHandler: {
				documentRoot,
				absoluteUrl,
				isStaticFilePath: (path) => {
					try {
						const fullPath = this.options.documentRoot + path;
						return (
							this.php.fileExists(fullPath) &&
							!this.php.isDir(fullPath) &&
							!seemsLikeAPHPFile(fullPath)
						);
					} catch (e) {
						console.error(e);
						return false;
					}
				},
			},
		});
		this.php.mkdirTree(documentRoot);
		this.php.chdir(documentRoot);
		this.php.writeFile(
			`${documentRoot}/index.php`,
			`<?php echo 'Hello wp-now!';`
		);
	}

	async mountWordpress() {
		const { wordPressVersion, documentRoot, mode, projectPath } =
			this.options;

		const root =
			mode === WPNowMode.CORE
				? projectPath
				: mode === WPNowMode.CORE_DEVELOP
				? projectPath + '/build'
				: path.join(WORDPRESS_VERSIONS_PATH, wordPressVersion);
		this.php.mount(root, documentRoot);
		this.php.writeFile(
			`${documentRoot}/wp-config.php`,
			this.php.readFileAsText(`${documentRoot}/wp-config-sample.php`)
		);
		await defineSiteUrl(this.php, { siteUrl: this.options.absoluteUrl });
		if (![WPNowMode.CORE, WPNowMode.CORE_DEVELOP].includes(mode)) {
			await defineWpConfigConsts(this.php, {
				consts: {
					WP_AUTO_UPDATE_CORE:
						this.options.wordPressVersion === 'latest',
				},
			});
			this.php.mkdirTree(`${documentRoot}/wp-content/mu-plugins`);
			this.php.writeFile(
				`${documentRoot}/wp-content/mu-plugins/0-allow-wp-org.php`,
				`<?php
		// Needed because gethostbyname( 'wordpress.org' ) returns
		// a private network IP address for some reason.
		add_filter( 'allowed_redirect_hosts', function( $deprecated = '' ) {
			return array(
				'wordpress.org',
				'api.wordpress.org',
				'downloads.wordpress.org',
			);
		} );`
			);
		}
	}

	async runCode(code) {
		const result = await this.php.run({
			code,
		});
		console.log(result.text);
		return result;
	}

	mountSqlite() {
		const { documentRoot } = this.options;
		const sqlitePluginPath = `${this.options.documentRoot}/wp-content/plugins/${SQLITE_FILENAME}`;
		if (!this.php.fileExists(sqlitePluginPath)) {
			this.php.mkdirTree(sqlitePluginPath);
		}
		if (this.php.listFiles(sqlitePluginPath).length === 0) {
			this.php.mount(SQLITE_PATH, sqlitePluginPath);
		}
		cp(this.php, {
			fromPath: `${sqlitePluginPath}/db.copy`,
			toPath: `${documentRoot}/wp-content/db.php`,
		});
	}

	copySqlite(localWordPressPath) {
		const targetPath = `${localWordPressPath}/wp-content/plugins/${SQLITE_FILENAME}`;
		if (!fs.existsSync(targetPath)) {
			fs.copySync(SQLITE_PATH, targetPath);
		}
		fs.copySync(
			`${SQLITE_PATH}/db.copy`,
			`${localWordPressPath}/wp-content/db.php`
		);
	}

	static #getWpContentHomePath(projectPath: string) {
		const basename = path.basename(projectPath);
		const directoryHash = crypto
			.createHash('sha1')
			.update(projectPath)
			.digest('hex');
		return path.join(
			WP_NOW_PATH,
			'wp-content',
			`${basename}-${directoryHash}`
		);
	}

	static #inferMode(projectPath: string): Exclude<WPNowMode, WPNowMode.AUTO> {
		if (isWpDevelopDirectory(projectPath)) {
			return WPNowMode.CORE_DEVELOP;
		} else if (isWpCoreDirectory(projectPath)) {
			return WPNowMode.CORE;
		} else if (isWpContentDirectory(projectPath)) {
			return WPNowMode.WP_CONTENT;
		} else if (isPluginDirectory(projectPath)) {
			return WPNowMode.PLUGIN;
		} else if (isThemeDirectory(projectPath)) {
			return WPNowMode.THEME;
		}
		return WPNowMode.INDEX;
	}

	static #validateOptions(options: WPNowOptions) {
		// Check the php version
		if (
			options.phpVersion &&
			!SupportedPHPVersionsList.includes(options.phpVersion)
		) {
			throw new Error(
				`Unsupported PHP version: ${
					options.phpVersion
				}. Supported versions: ${SupportedPHPVersionsList.join(', ')}`
			);
		}
	}

	async mount() {
		const { mode, wordPressVersion } = this.options;
		if (mode === WPNowMode.INDEX) {
			this.php.mount(this.options.projectPath, this.options.documentRoot);
			return;
		}
		// Mount wordpress in all modes except index
		await this.mountWordpress();
		const { wpContentPath } = this.options;
		fs.ensureDirSync(wpContentPath);

		// Mode: wp-content - mount the wp-content folder as is
		if (mode === WPNowMode.WP_CONTENT) {
			this.php.mount(
				this.options.projectPath,
				`${this.options.documentRoot}/wp-content`
			);
		}

		// Mode: plugin or theme
		if (mode === WPNowMode.PLUGIN || mode === WPNowMode.THEME) {
			fs.copySync(
				path.join(
					WORDPRESS_VERSIONS_PATH,
					wordPressVersion,
					'wp-content'
				),
				wpContentPath
			);
			this.php.mount(
				wpContentPath,
				`${this.options.documentRoot}/wp-content`
			);

			const folderName = path.basename(this.options.projectPath);
			const partialPath =
				mode === WPNowMode.PLUGIN ? 'plugins' : 'themes';
			fs.ensureDirSync(path.join(wpContentPath, partialPath, folderName));
			this.php.mount(
				this.options.projectPath,
				`${this.options.documentRoot}/wp-content/${partialPath}/${folderName}`
			);
			this.mountSqlite();
		} else if (mode === WPNowMode.CORE) {
			this.copySqlite(this.options.projectPath);
		} else if (mode === WPNowMode.CORE_DEVELOP) {
			this.copySqlite(`${this.options.projectPath}/build`);
		}
	}

	async registerUser() {
		return this.php.request({
			url: '/wp-admin/install.php?step=2',
			method: 'POST',
			formData: {
				language: 'en',
				prefix: 'wp_',
				weblog_title: 'My WordPress Website',
				user_name: 'admin',
				admin_password: 'password',
				admin_password2: 'password',
				Submit: 'Install WordPress',
				pw_weak: '1',
				admin_email: 'admin@localhost.com',
			},
		});
	}

	async autoLogin() {
		await this.php.request({
			url: '/wp-login.php',
		});

		await this.php.request({
			url: '/wp-login.php',
			method: 'POST',
			formData: {
				log: 'admin',
				pwd: 'password',
				rememberme: 'forever',
			},
		});
	}

	async start() {
		console.log(`Project directory: ${this.options.projectPath}`);
		console.log(`mode: ${this.options.mode}`);
		console.log(`php: ${this.options.phpVersion}`);
		console.log(`wp: ${this.options.wordPressVersion}`);
		if (this.options.mode === WPNowMode.INDEX) {
			await this.mount();
			return;
		}
		await downloadWordPress(this.options.wordPressVersion);
		await downloadSqliteIntegrationPlugin();
		await this.mount();
		await this.registerUser();
		await this.autoLogin();
	}
}
