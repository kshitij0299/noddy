// Small fonts for the chaos tests: a pixel font drawn on a 60-unit grid and a drawn (curvy) one.
import { traceCells } from '../pixel-grid.js';

export const METRICS = Object.freeze({
	upm: 1000,
	ascent: 800,
	descent: -200,
	capHeight: 700,
	xHeight: 500,
	overshoot: 10,
});

export const PITCH = 60;
export const GRID = { pitch: PITCH, ox: 0, oy: 0 };

/** Rows of '#' (ink) and '.', top row first, as square contours on the 60-unit grid. */
export function pixelGlyph(rows) {
	const cols = rows[0].length;
	const height = rows.length;
	const cells = new Uint8Array(cols * height);
	rows.forEach((line, index) => {
		const row = height - 1 - index;
		[...line].forEach((char, col) => {
			if (char === '#') cells[row * cols + col] = 1;
		});
	});
	return traceCells({ cols, rows: height, i0: 0, j0: 0, cells }, GRID);
}

export const PIXEL_H = pixelGlyph([
	'##...##',
	'##...##',
	'##...##',
	'##...##',
	'#######',
	'#######',
	'##...##',
	'##...##',
	'##...##',
	'##...##',
	'##...##',
]);

export const PIXEL_O = pixelGlyph([
	'.#####.',
	'##...##',
	'##...##',
	'##...##',
	'##...##',
	'##...##',
	'##...##',
	'##...##',
	'##...##',
	'##...##',
	'.#####.',
]);

const pt = (x, y, h1 = null, h2 = null) => ({ x, y, h1, h2 });

/** A closed ellipse of 4 cubic arcs; clockwise = outer (y up). */
export function ellipse(cx, cy, rx, ry, clockwise = true) {
	const k = 0.5523;
	const points = [
		pt(cx, cy + ry, { x: cx - rx * k, y: cy + ry }, { x: cx + rx * k, y: cy + ry }),
		pt(cx + rx, cy, { x: cx + rx, y: cy + ry * k }, { x: cx + rx, y: cy - ry * k }),
		pt(cx, cy - ry, { x: cx + rx * k, y: cy - ry }, { x: cx - rx * k, y: cy - ry }),
		pt(cx - rx, cy, { x: cx - rx, y: cy - ry * k }, { x: cx - rx, y: cy + ry * k }),
	];
	if (clockwise) return { points };
	return {
		points: [...points].reverse().map((p) => ({ x: p.x, y: p.y, h1: p.h2, h2: p.h1 })),
	};
}

/** A drawn O: outer ellipse and a counter running the other way. */
export const CURVY_O = [ellipse(300, 350, 260, 360), ellipse(300, 350, 150, 250, false)];

/** A sans-style H: one clockwise outline. */
export const SANS_H = [
	{
		points: [
			pt(60, 0),
			pt(60, 700),
			pt(160, 700),
			pt(160, 400),
			pt(440, 400),
			pt(440, 700),
			pt(540, 700),
			pt(540, 0),
			pt(440, 0),
			pt(440, 300),
			pt(160, 300),
			pt(160, 0),
		],
	},
];
