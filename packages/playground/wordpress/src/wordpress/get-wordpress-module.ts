import { getWordPressModuleDetails } from './get-wordpress-module-details';

export async function getWordPressModule(
	wpVersion: string = '6.4'
): Promise<File> {
	const url = getWordPressModuleDetails(wpVersion).url;
	let data = null;
	if (url.startsWith('/')) {
		let path = url;
		if (path.startsWith('/@fs/')) {
			path = path.slice(4);
		}

		const { readFile } = await import('node:fs/promises');
		data = await readFile(path);
	} else {
		const response = await fetch(url);
		data = await response.blob();
	}
	return new File([data], `${wpVersion}.zip`, {
		type: 'application/zip',
	});
}
