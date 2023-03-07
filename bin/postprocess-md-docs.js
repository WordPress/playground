const fs = require('fs');
const path = require('path');

const DOCS_ABSOLUTE_URL =
	'https://github.com/WordPress/wordpress-playground/tree/trunk/docs/';

const REPO_ROOT_PATH = path.dirname(__dirname);
const TARGET_DIR = path.join(REPO_ROOT_PATH, 'docs');

/**
 * Loop through all the markdown files given as the CLI argument.
 */
const mdFiles = {
	'./docs/index.md': 'index.md',
	'./docs/using-php-in-javascript.md': 'using-php-in-javascript.md',
	'./docs/using-php-in-the-browser.md': 'using-php-in-the-browser.md',
	'./docs/bundling-wordpress-for-the-browser.md':
		'bundling-wordpress-for-the-browser.md',
	'./docs/running-wordpress-in-the-browser.md':
		'running-wordpress-in-the-browser.md',
	'./docs/embedding-wordpress-playground-on-other-websites.md':
		'embedding-wordpress-playground-on-other-websites.md',
	'./docs/wordpress-plugin-ide.md': 'wordpress-plugin-ide.md',
};
console.log(`Building the markdown files...`);

Object.entries(mdFiles).forEach(([sourcePath, targetFileName]) => {
	console.log(`${sourcePath}...`);
	if (sourcePath.startsWith('/')) {
		sourcePath = path.join(__dirname, '..', sourcePath);
	}
	const targetFilePath = `${TARGET_DIR}/${targetFileName}`;
	fs.copyFileSync(sourcePath, targetFilePath);
	let content = fs.readFileSync(targetFilePath, 'utf8');
	content = handleIncludes(targetFilePath, content);
	content = absoluteUrlsToRelativeUrls(targetFilePath, content);
	fs.writeFileSync(targetFilePath, content);
});

function absoluteUrlsToRelativeUrls(filePath, content) {
	const relativePath = path.relative(path.dirname(filePath), TARGET_DIR);
	return content.replace(
		new RegExp(
			'(\\]\\()' + escapeRegExp(DOCS_ABSOLUTE_URL) + '([^\\)]+\\.md)',
			'g'
		),
		`$1${relativePath}$2`
	);
}

/**
 * Find all "include statements" in a markdown file. An "include statement" has an opener
 * and an ender as follows:
 *
 * ```
 * <!-- include path/to/file.md#section -->
 *    ... arbitrary contents ...
 * <!-- /include path/to/file.md#section -->
 * ```
 *
 * Then, replace the contents inside of the include statement with the contents
 * of the specific header from the requested file.
 *
 * @param {string} filePath
 * @param {string} content
 */
function handleIncludes(filePath, content) {
	const regex = /<!-- include (.*?) -->(.*)<!-- \/include \1 -->/gms;
	return content.replace(regex, (match, includeRef) => {
		const [includePath, headerText] = includeRef.split('#');
		const relativeIncludePath = path.relative(
			TARGET_DIR,
			includePath.startsWith('/')
				? REPO_ROOT_PATH + includePath
				: includePath
		);
		const fileContents = fs.readFileSync(
			path.join(TARGET_DIR, relativeIncludePath),
			'utf8'
		);
		const sectionContents = getMarkdownSectionContents(
			fileContents,
			headerText
		).replace(/\]\(([^)]+)\)/g, (_, link) => {
			if (link.startsWith('https://')) {
				return `](${link})`;
			}
			return `](${relativeIncludePath})`;
		});
		if (!sectionContents) {
			throw new Error(
				`Section "${headerText}" not found in the file ${includePath} (included in ${includePath})`
			);
		}

		return `<!-- include ${includeRef} -->\n\n${sectionContents}\n\n<!-- /include ${includeRef} -->`;
	});
}

/**
 * Finds a specified header in a markdown file, and returns
 * all the content belonging to that header.
 *
 * @param {string} content
 * @param {string} header
 */
function getMarkdownSectionContents(content, header) {
	const regex = new RegExp(
		`^(#+)\\s*${escapeRegExp(header)}\\s*\\n(.*)(^\\1|$)`,
		'ms'
	);
	const match = content.match(regex);
	if (match) {
		return match[2].trim();
	}
	return '';
}

function escapeRegExp(text) {
	return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
