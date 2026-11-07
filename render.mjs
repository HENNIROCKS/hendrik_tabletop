// Renders post images in headless Chromium.
// Usage: node render.mjs <post folder>   → <folder>/1.jpg, 2.jpg, … (one per slide)
//        node render.mjs [template]      → out/<template>.jpg with the template's sample text
import { chromium } from 'playwright';
import sharp from 'sharp';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatDate, readPost } from './post-file.mjs';
import { circleQr } from './qr.mjs';

const WIDTH = 1080;
const HEIGHT = 1350;
// The Instagram API takes nothing but JPEG; at 85 mozjpeg stays well under Bluesky's 1 MB.
const JPEG_QUALITY = 85;
// Graphics never show wider than the post.
const GRAPHIC_WIDTH = 1080;
const GRAPHIC_QUALITY = 90;

const target = process.argv[2] ?? 'base';

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
	if (existsSync(join(target, 'post.md'))) await renderPost(page, target);
	else await renderPreview(page, target);
} finally {
	await browser.close();
}

async function renderPreview(page, template) {
	await openTemplate(page, template);
	const url = await page.$eval('[data-field="qr"]', (el) => el.dataset.url);
	await fill(page, { qr: circleQr(url) });
	const problems = await check(page);
	if (problems.length) return fail(`${template}: ${problems.join('; ')}`);
	await mkdir('out', { recursive: true });
	await write(page, resolve('out', `${template}.jpg`));
}

async function renderPost(page, dir) {
	const { data, errors } = await readPost(dir);
	if (errors.length) return fail(`${dir}/post.md:\n  ${errors.join('\n  ')}`);

	const graphics = {};
	for (const slide of data.slides) {
		if (!slide.graphic) continue;
		const graphic = await optimise(dir, slide.graphic);
		if (!graphic) return fail(`${dir}: graphic "${slide.graphic}" is neither in originals/ nor optimised`);
		graphics[slide.graphic] = graphic;
	}

	const total = data.slides.length;
	const images = [];
	for (const [i, slide] of data.slides.entries()) {
		await openTemplate(page, data.template);
		await fill(page, {
			date: formatDate(data.date),
			page: total > 1 ? `· ${i + 1}/${total}` : null,
			title: data.title,
			qr: circleQr(data.url),
			paragraphs: slide.text ? slide.text.trim().split(/\n\s*\n/) : [],
			graphic: slide.graphic ? pathToFileURL(resolve(graphics[slide.graphic])).href : null,
			frame: slide.frame ?? null,
			alt: slide.alt
		});
		const problems = await check(page);
		if (problems.length) return fail(`${dir}, slide ${i + 1}: ${problems.join('; ')}`);
		images.push(await jpeg(page));
	}

	// Only once every slide passed, so a failed run leaves the old images alone.
	for (const [i, image] of images.entries()) {
		const file = join(dir, `${i + 1}.jpg`);
		await writeFile(file, image);
		report(file);
	}

	const stale = (await readdir(dir)).filter((name) => /^\d+\.jpg$/.test(name) && parseInt(name) > total);
	if (stale.length) console.warn(`not part of the post any more: ${stale.join(', ')}`);
}

/**
 * originals/<name> → <name without extension>.webp beside post.md, skipped when
 * the WebP is newer. Without the original an existing WebP is used as it is.
 */
async function optimise(dir, name) {
	const original = join(dir, 'originals', name);
	const optimised = join(dir, `${basename(name, extname(name))}.webp`);
	if (!existsSync(original)) return existsSync(optimised) ? optimised : null;
	if (existsSync(optimised) && statSync(optimised).mtimeMs >= statSync(original).mtimeMs) return optimised;
	await sharp(original).resize({ width: GRAPHIC_WIDTH, withoutEnlargement: true }).webp({ quality: GRAPHIC_QUALITY }).toFile(optimised);
	report(optimised);
	return optimised;
}

async function openTemplate(page, template) {
	await page.goto(pathToFileURL(resolve('templates', template, 'index.html')).href);
}

/** Fills the template's [data-field] slots; a field left undefined keeps the sample. */
async function fill(page, fields) {
	await page.evaluate(async (fields) => {
		const slot = (name) => document.querySelector(`[data-field="${name}"]`);
		if (fields.date !== undefined) slot('date').textContent = fields.date;
		if (fields.page === null) slot('page')?.remove();
		else if (fields.page !== undefined) slot('page').textContent = fields.page;
		if (fields.title !== undefined) slot('title').textContent = fields.title;
		if (fields.qr !== undefined) slot('qr').innerHTML = fields.qr;
		if (fields.paragraphs !== undefined) {
			slot('text').replaceChildren(
				...fields.paragraphs.map((text) => Object.assign(document.createElement('p'), { textContent: text.trim() }))
			);
		}
		if (fields.graphic) {
			const img = Object.assign(document.createElement('img'), { src: fields.graphic, alt: fields.alt ?? '' });
			let graphic = img;
			if (fields.frame) {
				// <div class="phone"><div class="phone-frame"><img></div></div>
				graphic = Object.assign(document.createElement('div'), { className: fields.frame });
				graphic.append(Object.assign(document.createElement('div'), { className: `${fields.frame}-frame` }));
				graphic.firstChild.append(img);
			}
			slot('graphic').replaceChildren(graphic);
			await img.decode();
		}
		await document.fonts.ready;
	}, fields);
}

/** What keeps the slide from being posted: a second headline line, or content below the edge. */
async function check(page) {
	return page.evaluate(() => {
		const found = [];
		const title = document.querySelector('[data-field="title"]');
		const head = title.parentElement;
		const room = head.clientWidth - parseFloat(getComputedStyle(head).paddingRight);
		if (title.scrollWidth > room) found.push(`headline is ${title.scrollWidth - room} px too wide for one line`);
		const post = document.querySelector('.post');
		if (post.scrollHeight > post.clientHeight) found.push(`content is ${post.scrollHeight - post.clientHeight} px too tall`);
		return found;
	});
}

async function jpeg(page) {
	const png = await page.screenshot({ type: 'png' });
	return sharp(png).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
}

async function write(page, file) {
	await writeFile(file, await jpeg(page));
	report(file);
}

function report(file) {
	console.log(`${file}  ${Math.round(statSync(file).size / 1024)} KB`);
}

function fail(message) {
	console.error(message);
	process.exitCode = 1;
}
