// Posts a rendered post folder to Mastodon and Pixelfed with the Mastodon text;
// Bluesky gets it through the Bridgy Fed mirror of the Mastodon account.
// Usage: node --env-file=.env post.mjs <post folder> [--dry-run]
//        → <folder>/published.json with the status and media URLs per channel
// publish.mjs uses prepare(), preview() and send() for its picked posts.
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPost } from './post-file.mjs';

// Mastodon counts every link as 23 characters, whatever its length.
const MAX_CHARS = 500;
const LINK_CHARS = 23;
const MEDIA_POLL_MS = 1000;
const MEDIA_POLL_TRIES = 30;
/** Where a post goes, in this order; `key` names its entry in published.json and its variables in .env. */
const CHANNELS = [
	{ key: 'mastodon', name: 'Mastodon' },
	{ key: 'pixelfed', name: 'Pixelfed' }
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2);
	const dir = args.find((arg) => !arg.startsWith('--'));
	if (!dir) fail('usage: npm run post -- <post folder> [--dry-run]');
	else await post(dir, args.includes('--dry-run'));
}

async function post(dir, dryRun) {
	const prepared = await prepare(dir);
	if (prepared.problems.length) return fail(prepared.problems.join('\n'));
	if (dryRun) return console.log(preview(prepared));
	const urls = await send(prepared);
	console.log(`${urls.join('\n')}\n${join(dir, 'published.json')}`);
}

/**
 * Everything a post needs before it goes out: its data, the Mastodon text and
 * the images with their alt text. `problems` lists what keeps it from going
 * out; `published` is the folder's published.json, or {}; `targets` are the
 * channels it is not on yet.
 */
export async function prepare(dir) {
	const prepared = { dir, data: null, status: '', length: 0, images: [], published: {}, targets: CHANNELS, problems: [] };
	if (!existsSync(join(dir, 'post.md'))) return refuse(prepared, `${dir}: no post.md`);
	const { data, channels, errors } = await readPost(dir);
	if (errors.length) return refuse(prepared, `${dir}/post.md:\n  ${errors.join('\n  ')}`);
	prepared.data = data;

	const publishedFile = join(dir, 'published.json');
	if (existsSync(publishedFile)) prepared.published = JSON.parse(await readFile(publishedFile, 'utf8'));
	prepared.targets = CHANNELS.filter(({ key }) => !prepared.published[key]);
	if (!prepared.targets.length) return refuse(prepared, `${dir}: already on ${CHANNELS.map(({ name }) => name).join(' and ')}`);

	const problems = [];
	const postTime = statSync(join(dir, 'post.md')).mtimeMs;
	prepared.images = data.slides.map((slide, i) => ({ file: join(dir, `${i + 1}.jpg`), alt: slide.alt }));
	for (const { file } of prepared.images) {
		if (!existsSync(file)) problems.push(`${file} is missing`);
		else if (statSync(file).mtimeMs < postTime) problems.push(`${file} is older than post.md`);
	}
	if (problems.length) return refuse(prepared, `${dir}:\n  ${problems.join('\n  ')}\n  run npm run render -- ${dir} first`);

	if (!channels.mastodon) return refuse(prepared, `${dir}/post.md has no "## Mastodon" section`);
	const hashtags = (data.hashtags ?? []).map((tag) => `#${tag}`).join(' ');
	prepared.status = hashtags ? `${channels.mastodon}\n\n${hashtags}` : channels.mastodon;
	prepared.length = [...prepared.status.replace(/https?:\/\/\S+/g, 'x'.repeat(LINK_CHARS))].length;
	if (prepared.length > MAX_CHARS) return refuse(prepared, `${dir}: Mastodon text is ${prepared.length - MAX_CHARS} characters too long`);
	return prepared;
}

/** What --dry-run prints: the channels, the Mastodon text, its length and the images with their alt text. */
export function preview({ status, length, images, targets }) {
	const lines = [`to: ${targets.map(({ name }) => name).join(', ')}`, '', status, '', `${length}/${MAX_CHARS} characters`];
	for (const { file, alt } of images) lines.push(`${file}  alt: ${alt}`);
	return lines.join('\n');
}

/**
 * Posts to each channel in `targets` in turn and writes published.json after
 * each one, so a failed channel leaves the others recorded; returns the status URLs.
 */
export async function send({ dir, status, images, published, targets }) {
	const missing = targets
		.flatMap(({ key }) => [`${key.toUpperCase()}_INSTANCE`, `${key.toUpperCase()}_TOKEN`])
		.filter((variable) => !process.env[variable]);
	if (missing.length) throw new Error(`${missing.join(' and ')} must be set in .env`);

	const urls = [];
	for (const channel of targets) {
		try {
			published[channel.key] = await sendTo(channel, { dir, status, images });
		} catch (error) {
			const out = urls.length ? `\n  already out: ${urls.join(', ')}; run again for the rest` : '';
			throw new Error(`${channel.name}: ${error.message}${out}`);
		}
		await writeFile(join(dir, 'published.json'), `${JSON.stringify(published, null, '\t')}\n`);
		urls.push(published[channel.key].url);
	}
	return urls;
}

/** Uploads the images to one channel and posts publicly; returns its published.json entry. */
async function sendTo({ key, name }, { dir, status, images }) {
	const instance = process.env[`${key.toUpperCase()}_INSTANCE`];
	const token = process.env[`${key.toUpperCase()}_TOKEN`];
	const api = (path, options = {}) =>
		fetch(`${instance}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });

	const media = [];
	for (const { file, alt } of images) {
		const form = new FormData();
		form.append('file', new Blob([await readFile(file)], { type: 'image/jpeg' }), file.split('/').pop());
		form.append('description', alt);
		let attachment = await json(await api('/api/v2/media', { method: 'POST', body: form }), `upload ${file}`);
		// 202 means still processing: the URL is null until GET answers 200.
		for (let tries = 0; !attachment.url; tries++) {
			if (tries === MEDIA_POLL_TRIES) throw new Error(`${file}: ${name} is still processing it`);
			await new Promise((done) => setTimeout(done, MEDIA_POLL_MS));
			const response = await api(`/api/v1/media/${attachment.id}`);
			if (response.status === 200) attachment = await response.json();
			else if (response.status !== 206) await json(response, `check ${file}`);
		}
		console.log(`${file}  ${attachment.url}`);
		media.push(attachment);
	}

	// The same folder and text give the same key, so a retry within the hour does not post twice
	// on a server that honours it; published.json keeps a later run from posting twice anywhere.
	const idempotencyKey = createHash('sha256').update(`${dir}\n${status}`).digest('hex');
	const result = await json(
		await api('/api/v1/statuses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
			body: JSON.stringify({ status, media_ids: media.map((m) => m.id), visibility: 'public', language: 'en' })
		}),
		'post status'
	);
	return { id: result.id, url: result.url, media: media.map((m) => m.url) };
}

/** The response body, or an error naming the step and the server's message. */
async function json(response, step) {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(`${step}: ${response.status} ${body.error ?? response.statusText}`);
	return body;
}

/** Adds a problem that keeps the post from going out. */
function refuse(prepared, problem) {
	prepared.problems.push(problem);
	return prepared;
}

function fail(message) {
	console.error(message);
	process.exitCode = 1;
}
