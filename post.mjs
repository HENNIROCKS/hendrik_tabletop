// Posts a rendered post folder to Mastodon; Bluesky gets it through the Bridgy Fed mirror.
// Usage: node --env-file=.env post.mjs <post folder> [--dry-run]
//        → <folder>/published.json with the status and media URLs
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPost } from './post-file.mjs';

// Mastodon counts every link as 23 characters, whatever its length.
const MAX_CHARS = 500;
const LINK_CHARS = 23;
const MEDIA_POLL_MS = 1000;
const MEDIA_POLL_TRIES = 30;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dir = args.find((arg) => !arg.startsWith('--'));

if (!dir) fail('usage: npm run post -- <post folder> [--dry-run]');
else await post(dir);

async function post(dir) {
	if (!existsSync(join(dir, 'post.md'))) return fail(`${dir}: no post.md`);
	const { data, channels, errors } = await readPost(dir);
	if (errors.length) return fail(`${dir}/post.md:\n  ${errors.join('\n  ')}`);

	const publishedFile = join(dir, 'published.json');
	const published = existsSync(publishedFile) ? JSON.parse(await readFile(publishedFile, 'utf8')) : {};
	if (published.mastodon) return fail(`${dir}: already on Mastodon, ${published.mastodon.url}`);

	const problems = [];
	const postTime = statSync(join(dir, 'post.md')).mtimeMs;
	const images = data.slides.map((slide, i) => ({ file: join(dir, `${i + 1}.jpg`), alt: slide.alt }));
	for (const { file } of images) {
		if (!existsSync(file)) problems.push(`${file} is missing`);
		else if (statSync(file).mtimeMs < postTime) problems.push(`${file} is older than post.md`);
	}
	if (problems.length) return fail(`${dir}:\n  ${problems.join('\n  ')}\n  run npm run render -- ${dir} first`);

	if (!channels.mastodon) return fail(`${dir}/post.md has no "## Mastodon" section`);
	const hashtags = (data.hashtags ?? []).map((tag) => `#${tag}`).join(' ');
	const status = hashtags ? `${channels.mastodon}\n\n${hashtags}` : channels.mastodon;
	const length = [...status.replace(/https?:\/\/\S+/g, 'x'.repeat(LINK_CHARS))].length;
	if (length > MAX_CHARS) return fail(`${dir}: Mastodon text is ${length - MAX_CHARS} characters too long`);

	if (dryRun) {
		console.log(`${status}\n\n${length}/${MAX_CHARS} characters`);
		for (const { file, alt } of images) console.log(`${file}  alt: ${alt}`);
		return;
	}

	const { MASTODON_INSTANCE: instance, MASTODON_TOKEN: token } = process.env;
	if (!instance || !token) return fail('MASTODON_INSTANCE and MASTODON_TOKEN must be set in .env');
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
	await writeFile(publishedFile, `${JSON.stringify(published, null, '\t')}\n`);
	console.log(`${result.url}\n${publishedFile}`);
}

/** The response body, or an error naming the step and Mastodon's message. */
async function json(response, step) {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(`${step}: ${response.status} ${body.error ?? response.statusText}`);
	return body;
}

function fail(message) {
	console.error(message);
	process.exitCode = 1;
}
