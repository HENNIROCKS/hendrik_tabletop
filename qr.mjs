// A QR code in a circle, as an SVG string. The code itself stays square with
// round finder patterns; the rest of the circle is filled with decorative
// modules, kept QUIET modules away from the code so scanners still find it.
import QRCode from 'qrcode';

const QUIET = 2;
const FINDER = 7;

/** Deterministic noise in [0, 1) for a module, so the same URL draws the same circle. */
function noise(x, y, seed) {
	let h = (x * 374761393 + y * 668265263 + seed) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

function hash(text) {
	let h = 0;
	for (const c of text) h = (Math.imul(h, 31) + c.codePointAt(0)) | 0;
	return h;
}

/** Top left, top right or bottom left 7 × 7 corner – drawn as circles instead. */
function inFinder(row, col, n) {
	const top = row < FINDER;
	const left = col < FINDER;
	return (top && left) || (top && col >= n - FINDER) || (row >= n - FINDER && left);
}

export function circleQr(url) {
	const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
	const n = modules.size;
	const centre = n / 2;
	// Radius that clears the code's corners, plus the quiet ring.
	const radius = centre * Math.SQRT2 + 1;
	const plate = radius + 1.5;
	const seed = hash(url);
	const reach = Math.ceil(radius - centre);

	let path = '';
	const square = (x, y) => (path += `M${x} ${y}h1v1h-1z`);

	for (let row = 0; row < n; row++) {
		for (let col = 0; col < n; col++) {
			if (modules.get(row, col) && !inFinder(row, col, n)) square(col, row);
		}
	}

	for (let y = -reach; y < n + reach; y++) {
		for (let x = -reach; x < n + reach; x++) {
			const outside = x < -QUIET || x >= n + QUIET || y < -QUIET || y >= n + QUIET;
			const inCircle = Math.hypot(x + 0.5 - centre, y + 0.5 - centre) <= radius - 0.5;
			if (outside && inCircle && noise(x, y, seed) < 0.5) square(x, y);
		}
	}

	const finders = [
		[0, 0],
		[n - FINDER, 0],
		[0, n - FINDER]
	]
		.map(([x, y]) => {
			const cx = x + FINDER / 2;
			const cy = y + FINDER / 2;
			return `<circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="#000" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="1.5"/>`;
		})
		.join('');

	const min = centre - plate;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${min} ${min} ${plate * 2} ${plate * 2}" role="img" aria-label="QR code: ${url}">` +
		`<circle cx="${centre}" cy="${centre}" r="${plate - 0.15}" fill="#fff" stroke="#000" stroke-width="0.3"/>` +
		`<path d="${path}"/>${finders}</svg>`
	);
}
