import path from 'path';
import { spawn } from 'child_process';
import yargs from 'yargs';

const presets = {
	6.1: {
		KEEP_THEME: 'twentytwentythree',
		WP_ZIP_URL: 'https://wordpress.org/wordpress-6.1.1.zip',
		OUT_FILENAME: 'wp-6.1',
	},
	'6.0': {
		KEEP_THEME: 'twentytwentytwo',
		WP_ZIP_URL: 'https://wordpress.org/wordpress-6.0.3.zip',
		OUT_FILENAME: 'wp-6.0',
	},
	5.9: {
		KEEP_THEME: 'twentytwentyone',
		WP_ZIP_URL: 'https://wordpress.org/wordpress-5.9.5.zip',
		OUT_FILENAME: 'wp-5.9',
	},
	nightly: {
		KEEP_THEME: 'twentytwentythree',
		WP_ZIP_URL: 'https://wordpress.org/nightly-builds/wordpress-latest.zip',
		OUT_FILENAME: 'wp-nightly',
	},
};

const parser = yargs(process.argv.slice(2))
	.usage('Usage: $0 [options]')
	.options({
		preset: {
			type: 'string',
			description: 'The preset to use',
			choices: Object.keys(presets),
		},
		WP_ZIP_URL: {
			type: 'string',
			description: 'URL to WordPress zip file',
		},
		OUT_FILENAME: {
			type: 'string',
			description: 'Name of the output file',
		},
		KEEP_THEME: {
			type: 'string',
			description: 'Name of the theme to keep',
		},
		['output-dir']: {
			type: 'string',
			description: 'The output directory',
			required: true,
		},
	});

const args = parser.argv;

const preset = presets[args.preset];
if (preset === 'undefined') {
	process.stdout.write(`WP version ${requestedVersion} is not supported\n`);
	process.stdout.write(await argParser.getHelp());
	process.exit(1);
}

function getArg(name) {
	if (preset?.[name]) {
		return preset?.[name];
	}
	return args[name];
}

const sourceDir = path.dirname(new URL(import.meta.url).pathname);
const outputDir = path.resolve(process.cwd(), args.outputDir);

// Build WordPress
await asyncSpawn(
	'docker',
	[
		'build',
		'.',
		'--tag=wordpress-playground',
		'--progress=plain',
		...(getArg('WP_ZIP_URL')
			? ['--build-arg', `WP_ZIP_URL=${getArg('WP_ZIP_URL')}`]
			: []),
		...(getArg('OUT_FILENAME')
			? ['--build-arg', `OUT_FILENAME=${getArg('OUT_FILENAME')}`]
			: []),
		...(getArg('KEEP_THEME')
			? ['--build-arg', `KEEP_THEME=${getArg('KEEP_THEME')}`]
			: []),
	],
	{ cwd: sourceDir, stdio: 'inherit' }
);

// Extract the built WordPress files
await asyncSpawn(
	'docker',
	[
		'run',
		'--name',
		'wordpress-playground-tmp',
		'--rm',
		'-v',
		`${outputDir}:/output`,
		'wordpress-playground',
		// Use sh -c because wildcards are a shell feature and
		// they don't work without running cp through shell.
		'sh',
		'-c',
		`cp -r /root/output/* /output/`,
	],
	{ cwd: sourceDir, stdio: 'inherit' }
);

function asyncSpawn(...args) {
	return new Promise((resolve, reject) => {
		const child = spawn(...args);

		child.on('close', (code) => {
			if (code === 0) resolve(code);
			else reject(new Error(`Process exited with code ${code}`));
		});
	});
}
