// Picks drafts to post and asks twice before anything goes out.
// Usage: node --env-file=.env publish.mjs   (in a terminal: it reads the answers from the keyboard)
// Lists every folder in drafts/ that is not on Mastodon yet, shows the picked
// ones as --dry-run does and can open their images, asks for y and then for
// the number of posts, posts them one after the other and moves each into
// posts/YYYY/. A draft already on Mastodon moves there when the run starts.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline';
import { basename, join } from 'node:path';
import { prepare, preview, send } from './post.mjs';

const DRAFTS = 'drafts';
const POSTS = 'posts';

const rl = createInterface({ input, output });
// Lines typed ahead wait here. The end of input (Ctrl-D) answers null, which every
// question takes as no – also those whose default is yes.
const lines = [];
const waiting = [];
let ended = false;
rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
rl.on('close', () => {
	ended = true;
	while (waiting.length) waiting.shift()(null);
});
const ask = (question) => {
	output.write(question);
	if (lines.length) return Promise.resolve(lines.shift());
	if (ended) return Promise.resolve(null);
	return new Promise((answer) => waiting.push(answer));
};
/** y or n, Enter for the default; no answer at all (null) is no. */
const yes = (answer, byDefault) => {
	if (answer === null) return false;
	const word = answer.trim().toLowerCase();
	return word ? word === 'y' : byDefault;
};

try {
	await publish();
} finally {
	rl.close();
}

async function publish() {
	const today = new Date().toLocaleDateString('sv');
	const folders = (await readdir(DRAFTS, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory() && existsSync(join(DRAFTS, entry.name, 'post.md')))
		.map((entry) => join(DRAFTS, entry.name))
		.sort();
	const drafts = [];
	for (const dir of folders) {
		const prepared = await prepare(dir);
		// Already out, by npm run post or a run that stopped: filed, not offered again.
		if (prepared.published.mastodon) await file(prepared);
		else drafts.push(prepared);
	}
	if (!drafts.length) return console.log('Nothing in drafts/ is waiting to be posted.');

	console.log('Not on Mastodon yet:\n');
	drafts.forEach((draft, i) => {
		const { data, problems } = draft;
		const head = data ? `${data.date}  ${data.title}  (${data.slides.length} ${data.slides.length === 1 ? 'slide' : 'slides'})` : draft.dir;
		console.log(`${String(i + 1).padStart(2)}  ${head}`);
		if (problems.length) console.log(`    cannot be posted: ${problems.join('; ').replace(/\n\s*/g, ' ')}`);
		else if (data.date !== today) console.log(`    the images say ${data.date}, today is ${today}`);
	});

	const numbers = ((await ask('\nNumbers to post, separated by spaces (Enter to stop): ')) ?? '').trim().split(/[\s,]+/).filter(Boolean);
	if (!numbers.length) return console.log('Nothing posted.');
	// A set of drafts, not of numbers: 1 and 01 pick the same post once.
	const picked = new Set();
	for (const number of numbers) {
		const draft = drafts[Number(number) - 1];
		if (!/^\d+$/.test(number) || !draft) return console.log(`No post numbered ${number}. Nothing posted.`);
		if (draft.problems.length) return console.log(`${draft.dir} cannot be posted. Nothing posted.`);
		picked.add(draft);
	}

	for (const draft of picked) console.log(`\n── ${draft.dir}\n\n${preview(draft)}`);
	if (yes(await ask('\nOpen the images? [Y/n] '), true)) {
		spawn('open', [...picked].flatMap((draft) => draft.images.map((image) => image.file)), { stdio: 'ignore' });
	}

	if (!yes(await ask(`\nPost ${picked.size === 1 ? 'this' : 'these'} to Mastodon? [y/N] `), false)) {
		return console.log('Nothing posted.');
	}
	const count = String(picked.size);
	const posts = picked.size === 1 ? 'post' : 'posts';
	if ((await ask(`Public on Mastodon and Bluesky at once. Type ${count} to post ${count} ${posts}: `))?.trim() !== count) {
		return console.log('Nothing posted.');
	}

	const sent = [];
	for (const draft of picked) {
		try {
			const url = await send(draft);
			console.log(`${draft.dir}  ${url}`);
			sent.push(draft);
		} catch (error) {
			console.error(`\n${draft.dir}: ${error.message}`);
			const rest = [...picked].slice(sent.length + 1).map((d) => d.dir);
			console.error(`Posted: ${sent.map((d) => d.dir).join(', ') || 'none'}. Not tried: ${rest.join(', ') || 'none'}.`);
			process.exitCode = 1;
			break;
		}
	}

	for (const draft of sent) await file(draft);
}

/** Moves a posted draft to posts/YYYY/; a folder already there is left alone. */
async function file(draft) {
	const year = join(POSTS, draft.data.date.slice(0, 4));
	const target = join(year, basename(draft.dir));
	if (existsSync(target)) return console.log(`${target} exists already; ${draft.dir} stays where it is.`);
	await mkdir(year, { recursive: true });
	await rename(draft.dir, target);
	console.log(`${draft.dir} moved to ${target}`);
}
