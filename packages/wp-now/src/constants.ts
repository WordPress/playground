import os from 'os';
import path from 'path';

/**
 * The hidden folder name for storing WP Now related files.
 */
export const WP_NOW_HIDDEN_FOLDER = '.wp-now';

/**
 * The file name for the SQLite plugin name.
 */
export const SQLITE_FILENAME = 'sqlite-database-integration';

/**
 * The URL for downloading the "SQLite database integration" WordPress Plugin.
 */
export const SQLITE_URL =
	'https://github.com/WordPress/sqlite-database-integration/archive/refs/heads/main.zip';

/**
 * The default starting port for running the WP Now server.
 */
export const DEFAULT_PORT = 8881;

/**
 * The default PHP version to use when running the WP Now server.
 */
export const DEFAULT_PHP_VERSION = '8.0';

/**
 * The default WordPress version to use when running the WP Now server.
 */
export const DEFAULT_WORDPRESS_VERSION = 'latest';
