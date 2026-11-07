// Posts a rendered post folder to Mastodon; Bluesky gets it through the Bridgy Fed mirror.
// Usage: node --env-file=.env post.mjs <post folder> [--dry-run]
//        → <folder>/published.json with the status and media URLs
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
	const url = await send(prepared);
	console.log(`${url}\n${join(dir, 'published.json')}`);
}

/**
 * Everything a post needs before it goes out: its data, the Mastodon text and
 * the images with their alt text. `problems` lists what keeps it from going
 * out; `published` is the folder's published.json, or {}.
 */
export async function prepare(dir) {
	const prepared = { dir, data: null, status: '', length: 0, images: [], published: {}, problems: [] };
	if (!existsSync(join(dir, 'post.md'))) return refuse(prepared, `${dir}: no post.md`);
	const { data, channels, errors } = await readPost(dir);
	if (errors.length) return refuse(prepared, `${dir}/post.md:\n  ${errors.join('\n  ')}`);
	prepared.data = data;

	const publishedFile = join(dir, 'published.json');
	if (existsSync(publishedFile)) prepared.published = JSON.parse(await readFile(publishedFile, 'utf8'));
	if (prepared.published.mastodon) return refuse(prepared, `${dir}: already on Mastodon, ${prepared.published.mastodon.url}`);

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

/** What --dry-run prints: the Mastodon text, its length and the images with their alt text. */
export function preview({ status, length, images }) {
	const lines = [status, '', `${length}/${MAX_CHARS} characters`];
	for (const { file, alt } of images) lines.push(`${file}  alt: ${alt}`);
	return lines.join('\n');
}

/** Uploads the images, posts publicly and writes published.json; returns the status URL. */
export async function send({ dir, status, images, published }) {
	const { MASTODON_INSTANCE: instance, MASTODON_TOKEN: token } = process.env;
	if (!instance || !token) throw new Error('MASTODON_INSTANCE and MASTODON_TOKEN must be set in .env');
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
			if (tries === MEDIA_POLL_TRIES) throw new Error(`${file}: Mastodon is still processing it`);
			await new Promise((done) => setTimeout(done, MEDIA_POLL_MS));
			const response = await api(`/api/v1/media/${attachment.id}`);
			if (response.status === 200) attachment = await response.json();
			else if (response.status !== 206) await json(response, `check ${file}`);
		}
		console.log(`${file}  ${attachment.url}`);
		media.push(attachment);
	}

	// The same folder and text give the same key, so a retry within the hour does not post twice.
	const key = createHash('sha256').update(`${dir}\n${status}`).digest('hex');
	const result = await json(
		await api('/api/v1/statuses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
			body: JSON.stringify({ status, media_ids: media.map((m) => m.id), visibility: 'public', language: 'en' })
		}),
		'post status'
	);

	published.mastodon = { id: result.id, url: result.url, media: media.map((m) => m.url) };
	await writeFile(join(dir, 'published.json'), `${JSON.stringify(published, null, '\t')}\n`);
	return result.url;
}

/** The response body, or an error naming the step and Mastodon's message. */
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
