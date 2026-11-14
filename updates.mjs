// Starts a "Latest updates" draft from the app's What's new page: one slide per day since the
// last such post, each game a list item with its entries beneath. Shortening stays by hand.
// Usage: node updates.mjs [--since YYYY-MM-DD] [--app <app folder>] [--out <draft folder>]
//        → drafts/<today>-latest-updates/post.md, to be shortened, rendered and posted
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const APP = '../fantasy-city-warbands';
const WHATS_NEW = 'docs/whats-new.md';
const LINK = 'https://hennirocks.github.io/fantasy-city-warbands/docs/whats-new';
const MAX_SLIDES = 4;
const MAX_ENTRIES = 8;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GAME_TAGS = { 'Black Death City': 'BlackDeathCity', Necropolis: 'Necropolis', Wyrdcry: 'Wyrdcry' };
const OTHER_TAGS = ['Mordheim', 'Skirmish', 'TabletopGaming', 'Wargaming'];
const INSTAGRAM_TAGS = 5;

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const since = option('--since') ?? (await lastPostDate());
if (!since) fail('no earlier latest-updates post in posts/: pass --since YYYY-MM-DD');
const today = isoDate(new Date());
const dir = option('--out') ?? join('drafts', `${today}-latest-updates`);
if (existsSync(join(dir, 'post.md'))) fail(`${join(dir, 'post.md')} exists; not overwritten`);

const days = parse(await readFile(join(option('--app') ?? APP, WHATS_NEW), 'utf8')).filter((day) => day.date > since);
if (!days.length) fail(`nothing in What's new after ${since}`);
if (days.length > MAX_SLIDES) warn(`${days.length} days after ${since}, a post takes ${MAX_SLIDES} slides: merge the oldest by hand`);
for (const day of days) {
	const count = day.games.reduce((sum, game) => sum + game.entries.length, 0);
	if (count > MAX_ENTRIES) warn(`${day.heading}: ${count} entries, about ${MAX_ENTRIES} fit a slide: shorten or drop some`);
}

await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'post.md'), draft(days, today));
console.log(join(dir, 'post.md'));

/** The date of the newest posts/YYYY/YYYY-MM-DD-latest-updates folder, or undefined. */
async function lastPostDate() {
	if (!existsSync('posts')) return undefined;
	const found = [];
	for (const year of await readdir('posts')) {
		if (!existsSync(join('posts', year))) continue;
		for (const name of await readdir(join('posts', year))) {
			const match = name.match(/^(\d{4}-\d{2}-\d{2})-latest-updates$/);
			if (match) found.push(match[1]);
		}
	}
	return found.sort().at(-1);
}

/** "## 14 Nov 2026" sections, each with its games ("- **Game**") and their entries ("  - text"). */
function parse(markdown) {
	const days = [];
	for (const line of markdown.split('\n')) {
		const heading = line.match(/^## (\d{1,2}) (\w{3}) (\d{4})$/);
		if (heading) {
			const [, d, month, year] = heading;
			days.push({ heading: `${d} ${month} ${year}`, date: `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`, games: [] });
			continue;
		}
		const day = days.at(-1);
		const game = line.match(/^- \*\*(.+)\*\*$/);
		if (day && game) day.games.push({ name: game[1], entries: [] });
		else if (day?.games.length && /^  - /.test(line)) day.games.at(-1).entries.push(clean(line.slice(4)));
		else if (day && /^\s{4,}- /.test(line)) warn(`${day.heading}: a third level is left out: ${line.trim()}`);
	}
	for (const day of days) {
		for (const game of day.games) {
			// A link to the game's site is dropped unless it is all the game has that day.
			const rest = game.entries.filter((entry) => !/has a link to/.test(entry));
			if (rest.length) game.entries = rest;
		}
	}
	return days;
}

/** What the post writes differently: links as their text, typographic quotes, dashes and signs plain. */
function clean(text) {
	return text
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/–/g, '-')
		.replace(/×/g, 'x');
}

function draft(days, date) {
	const names = [...new Set(days.flatMap((day) => day.games.map((game) => game.name)))];
	const tags = [...new Set([...names.map((name) => GAME_TAGS[name]).filter(Boolean), ...OTHER_TAGS])];
	const sentence = `Latest updates to Fantasy City Warbands: ${list(names)}.`;
	const slides = days.map((day) => {
		const items = day.games.map((game) => `      - **${game.name}**\n${game.entries.map((entry) => `        - ${entry}`).join('\n')}`).join('\n');
		const alt = day.games.map((game) => `${game.name}: ${game.entries.map(stop).join(' ')}`).join(' ');
		return `  - text: |\n      # ${day.heading}\n\n${items}\n    alt: ${JSON.stringify(`Latest updates, ${day.heading}. ${alt}`)}`;
	});
	return `---
date: ${date}
template: base
title: "Latest updates"
url: ${LINK}
slides:
${slides.join('\n')}
hashtags:
  [${tags.join(', ')}]
---

## Mastodon

${sentence}

The full list is on What's new:
${LINK}

Unofficial fan project, early version.

## Instagram

${sentence} Link in bio.

Also on Mastodon: @hendrik_tabletop@mastodon.social

Unofficial fan project, early version.

${tags.slice(0, INSTAGRAM_TAGS).map((tag) => `#${tag}`).join(' ')}
`;
}

/** "A, B and C" */
function list(names) {
	return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

function stop(text) {
	return /[.!?]$/.test(text) ? text : `${text}.`;
}

function isoDate(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function warn(message) {
	console.warn(`warning: ${message}`);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
