import { dirname, joinPaths } from '@php-wasm/util';
import { UniversalPHP } from './universal-php';

export interface WriteFilesOptions {
	/**
	 * Whether to wipe out the contents of the
	 * root directory before writing the new files.
	 */
	rmRoot?: boolean;
}

/**
 * Writes multiple files to a specified directory in the Playground
 * filesystem.
 *
 * @example ```ts
 * await writeFiles(php, '/test', {
 * 	'file.txt': 'file',
 * 	'sub/file.txt': 'file',
 * 	'sub1/sub2/file.txt': 'file',
 * });
 * ```
 *
 * @param php
 * @param root
 * @param newFiles
 * @param options
 */
export async function writeFiles(
	php: UniversalPHP,
	root: string,
	newFiles: Record<string, Uint8Array | string>,
	{ rmRoot = false }: WriteFilesOptions = {}
) {
	if (rmRoot) {
		if (await php.isDir(root)) {
			await php.rmdir(root, { recursive: true });
		}
	}
	for (const [relativePath, content] of Object.entries(newFiles)) {
		const filePath = joinPaths(root, relativePath);
		if (!(await php.fileExists(dirname(filePath)))) {
			await php.mkdir(dirname(filePath));
		}
		await php.writeFile(filePath, content);
	}
}
