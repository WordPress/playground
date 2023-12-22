/**
 * Used by the export step to exclude the Playground-specific files
 * from the zip file. Keep it in sync with the list of files created
 * by WordPressPatcher.
 */
export const wpContentFilesExcludedFromExport = [
	'db.php',
	'plugins/akismet',
	'plugins/hello.php',
	'plugins/wordpress-importer',
	'plugins/sqlite-database-integration',
	'mu-plugins/playground-includes',
	'mu-plugins/export-wxz.php',
	'mu-plugins/0-playground.php',

	/*
	 * Listing core themes like that here isn't ideal, especially since
	 * developers may actually want to use one of them.
	 * @TODO Let's give the user a choice whether or not to include them.
	 */
	'themes/twentytwenty',
	'themes/twentytwentyone',
	'themes/twentytwentytwo',
	'themes/twentytwentythree',
	'themes/twentytwentyfour',
	'themes/twentytwentyfive',
	'themes/twentytwentysix',
];
