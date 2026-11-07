// Fetches Material Symbols into assets/icons/, where a slide's text finds them as :name:.
// Usage: node icons.mjs <name> [<name> …]   (names as on fonts.google.com/icons, e.g. ios_share)
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'assets/icons';
const SOURCE = 'https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web';

const names = process.argv.slice(2);
if (!names.length) {
	console.error('usage: node icons.mjs <name> [<name> …]');
	process.exitCode = 1;
}

for (const name of names) {
	const file = join(DIR, `${name}.svg`);
	if (existsSync(file)) {
		console.log(`${file}  already there`);
		continue;
	}
	const response = await fetch(`${SOURCE}/${name}/materialsymbolsoutlined/${name}_24px.svg`);
	if (!response.ok) {
		console.error(`${name}: no such Material Symbol (${response.status})`);
		process.exitCode = 1;
		continue;
	}
	await writeFile(file, await response.text());
	console.log(file);
}
