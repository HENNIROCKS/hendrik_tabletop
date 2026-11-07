// Inline icons for post text, and the browser bars drawn onto a phone.
// Icons are Material Symbols (Apache 2.0), one SVG per name in assets/icons/.
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const ICON_DIR = 'assets/icons';

/** ":name:" in a slide's text. */
export const ICON_PATTERN = /:([a-z0-9_]+):/g;

/** { name: '<svg …>' } for every icon in assets/icons/. */
export async function loadIcons() {
	const icons = {};
	for (const file of (await readdir(ICON_DIR)).filter((name) => name.endsWith('.svg'))) {
		icons[basename(file, '.svg')] = await readFile(join(ICON_DIR, file), 'utf8');
	}
	return icons;
}

/**
 * HTML for a browser bar: `outside` goes into the graphic slot over the phone,
 * `inside` into the phone's screen above the screenshot. Chrome's address bar
 * shows the host of `url`.
 */
export function toolbar(kind, icons, url) {
	const button = (name, extra = '') => `<span class="bar-button ${extra}">${icons[name]}</span>`;
	if (kind === 'safari') {
		return {
			outside: `<div class="safari-bar">${button('arrow_back_ios_new')}${button('arrow_forward_ios', 'is-off')}${button('ios_share')}${button('menu_book')}${button('filter_none')}</div>`,
			inside: ''
		};
	}
	const row = (name, label, extra = '') => `<li class="${extra}">${icons[name]}<span>${label}</span></li>`;
	return {
		outside: '',
		inside: `<div class="chrome-bar">${button('home')}<span class="chrome-url">${new URL(url).host}</span><span class="chrome-tabs">1</span>${button('more_vert')}</div>
			<div class="chrome-menu">
				<div class="chrome-menu-top">${button('arrow_forward_ios')}${button('star')}${button('download')}${button('info')}${button('refresh')}</div>
				<ul>${row('add', 'New tab')}${row('history', 'History')}${row('install_mobile', 'Install app', 'is-hit')}</ul>
			</div>`
	};
}
