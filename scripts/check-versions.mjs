import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * CI version check: package.json:version must equal src/app/app_config.json:version.
 * src/app/app_config.json:version is the single source of truth at runtime.
 * Exits non-zero on mismatch so CI fails.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const configVersion = JSON.parse(
	readFileSync(resolve(root, 'src/app/app_config.json'), 'utf8')
).version;

if (packageVersion !== configVersion) {
	console.error(
		`Version mismatch: package.json version (${packageVersion}) !== src/app/app_config.json version (${configVersion}).`
	);
	process.exit(1);
}

console.log(`Versions match: ${packageVersion}`);
