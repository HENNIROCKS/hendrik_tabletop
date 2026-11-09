// Reads a post folder's post.md: YAML frontmatter for the images, one
// "## <Channel>" section per channel for the texts.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

/** What a slide's graphic can be drawn into; the class of the same name is in the template CSS. */
const FRAMES = ['phone'];
/** Browser bars drawn onto a phone; chrome.mjs draws them. */
const TOOLBARS = ['safari', 'chrome'];

/** Returns { data, channels, errors }; errors lists every problem at once. */
export async function readPost(dir) {
	const source = await readFile(join(dir, 'post.md'), 'utf8');
	const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { data: null, channels: {}, errors: ['post.md has no frontmatter between --- lines'] };

	const data = parse(match[1]) ?? {};
	const channels = {};
	for (const [, name, text] of match[2].matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
		channels[name.trim().toLowerCase()] = text.trim();
	}

	const errors = [];
	if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? '')) errors.push('date must be YYYY-MM-DD');
	for (const field of ['template', 'title', 'url']) {
		if (!data[field]) errors.push(`${field} is missing`);
	}
	if (data.template && !existsSync(join('templates', data.template, 'index.html'))) {
		errors.push(`template "${data.template}" does not exist`);
	}
	if (!Array.isArray(data.slides) || data.slides.length === 0) {
		errors.push('slides needs at least one slide');
	} else {
		data.slides.forEach((slide, i) => {
			const n = i + 1;
			if (!slide?.alt) errors.push(`slide ${n}: alt is missing`);
			if (!slide?.text && !slide?.graphic) errors.push(`slide ${n}: needs text or a graphic`);
			if (slide?.frame && !FRAMES.includes(slide.frame)) errors.push(`slide ${n}: frame must be one of ${FRAMES.join(', ')}`);
			if (slide?.toolbar && !TOOLBARS.includes(slide.toolbar)) errors.push(`slide ${n}: toolbar must be one of ${TOOLBARS.join(', ')}`);
			if (slide?.toolbar && slide.frame !== 'phone') errors.push(`slide ${n}: toolbar needs frame: phone`);
			if (slide?.frame && !slide.graphic) errors.push(`slide ${n}: frame needs a graphic`);
			if (slide?.card && slide.frame !== 'phone') errors.push(`slide ${n}: card needs frame: phone`);
			if (slide?.card && slide.toolbar) errors.push(`slide ${n}: card and toolbar do not go together`);
			if (slide?.width !== undefined && !(Number.isInteger(slide.width) && slide.width > 0)) errors.push(`slide ${n}: width must be a whole number of pixels`);
			if (slide?.width !== undefined && slide.frame !== 'phone') errors.push(`slide ${n}: width needs frame: phone`);
			if (slide?.width !== undefined && (slide.toolbar || slide.card)) errors.push(`slide ${n}: width does not go with toolbar or card, which set their own`);
			if (slide?.side !== undefined && typeof slide.side !== 'string') errors.push(`slide ${n}: side must be text`);
			if (slide?.side !== undefined && (slide.frame !== 'phone' || slide.width === undefined)) errors.push(`slide ${n}: side needs frame: phone and a width`);
		});
	}
	return { data, channels, errors };
}

/** "2026-11-04" → "Nov 4, 2026" */
export function formatDate(date) {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
