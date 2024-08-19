import type { MountDevice } from '@php-wasm/web';

export async function directoryHandleFromMountDevice(
	device: MountDevice
): Promise<FileSystemDirectoryHandle> {
	if (device.type === 'local-fs') {
		return device.handle;
	}

	return opfsPathToDirectoryHandle(device.path);
}

export async function opfsPathToDirectoryHandle(
	opfsPath: string
): Promise<FileSystemDirectoryHandle> {
	const parts = opfsPath.split('/').filter((p) => p.length > 0);
	let handle = await navigator.storage.getDirectory();
	for (const part of parts) {
		handle = await handle.getDirectoryHandle(part);
	}
	return handle;
}

export async function directoryHandleToOpfsPath(
	directoryHandle: FileSystemDirectoryHandle
): Promise<string> {
	const root = await navigator.storage.getDirectory();
	const pathParts = await root.resolve(directoryHandle);
	if (pathParts === null) {
		throw new DOMException(
			'Unable to resolve path of OPFS directory handle.',
			'NotFoundError'
		);
	}
	return '/' + pathParts.join('/');
}

export async function clearContentsFromMountDevice(mountDevice: MountDevice) {
	const parentHandle = await directoryHandleFromMountDevice(mountDevice);
	for await (const name of parentHandle.keys()) {
		await parentHandle.removeEntry(name, {
			recursive: true,
		});
	}
}
