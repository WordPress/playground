export function normalizeRollupFilename(name) {
	if (name.startsWith('rollup://localhost/')) {
		name = name.substring('rollup://localhost/'.length);
	}
	if (name.startsWith('_virtual/')) {
		name = name.substring('_virtual/'.length);
	}
	if (name.startsWith('./')) {
		name = name.substring('./'.length);
	}
	return name;
}

export type { MemFile } from '../fs-utils';

export {
	extname,
	pathJoin,
	resolve,
	isAbsolute,
	normalizePath,
} from '../fs-utils';
