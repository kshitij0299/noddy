// Warp: arc / bulge / wave / twist envelopes. Every segment becomes cubic pieces first, and
// each handle moves with the local stretch of the warp (its Jacobian), so curves stay smooth.

export const WARP_TYPES = ['arc', 'bulge', 'wave', 'twist'];
const WARP_LABELS = { arc: 'Arc', bulge: 'Bulge', wave: 'Wave', twist: 'Twist' };

export default {
	id: 'warp',
	label: 'Warp',
	icon: 'waves',
	hint: 'Bend the letter: arc, bulge, wave or twist',
	params: [
		{
			key: 'warp',
			label: 'Type',
			type: 'enum',
			options: WARP_TYPES.map((value) => ({ value, label: WARP_LABELS[value] })),
			default: 'wave',
		},
		{
			key: 'strength',
			label: 'Strength',
			type: 'number',
			min: -100,
			max: 100,
			step: 5,
			default: 40,
			unit: '%',
		},
	],
	async run(contours, { rng, chaos, params, box, metrics, boolean }) {
		const strength = (params.strength / 100) * (0.5 + chaos) * (1 + rng.signed() * chaos * 0.3);
		const warp = makeWarp(params.warp, {
			strength,
			box,
			upm: metrics.upm,
			phase: rng.range(0, Math.PI * 2),
			frequency: 1 + rng.int(0, Math.round(chaos * 2)) * 0.5,
		});
		const step = metrics.upm * 0.2;
		const warped = contours.map((contour) => warpContour(contour, warp, step));
		// A strong warp can fold an outline over itself: untangle it with the nonzero fill.
		return boolean('union', warped);
	},
};

/**
 * @returns {(x: Number, y: Number) => {x: Number, y: Number}}
 */
export function makeWarp(type, { strength, box, upm, phase = 0, frequency = 1 }) {
	const cx = (box.xMin + box.xMax) / 2;
	const cy = (box.yMin + box.yMax) / 2;
	const halfW = Math.max(1, box.width / 2);
	const halfH = Math.max(1, box.height / 2);
	const clamp1 = (v) => Math.max(-1, Math.min(1, v));
	if (type === 'arc')
		return (x, y) => {
			const u = clamp1((x - cx) / halfW);
			return { x, y: y + strength * 0.3 * box.height * (1 - u * u) };
		};
	if (type === 'bulge')
		return (x, y) => {
			const v = clamp1((y - cy) / halfH);
			return { x: cx + (x - cx) * (1 + strength * 0.45 * (1 - v * v)), y };
		};
	if (type === 'twist') {
		const radius = Math.max(halfW, halfH) * 1.25;
		return (x, y) => {
			const dx = x - cx;
			const dy = y - cy;
			const r = Math.min(1, Math.hypot(dx, dy) / radius);
			const theta = strength * (Math.PI / 3) * (1 - r) * (1 - r);
			const cos = Math.cos(theta);
			const sin = Math.sin(theta);
			return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
		};
	}
	// wave
	return (x, y) => ({
		x:
			x +
			strength *
				0.09 *
				upm *
				Math.sin(Math.PI * 2 * frequency * ((y - box.yMin) / (box.height || 1)) + phase),
		y,
	});
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Splits one cubic (p0, c1, c2, p3) into n equal-t pieces. */
function splitCubic(p0, c1, c2, p3, n) {
	const pieces = [];
	let a = p0;
	let b = c1;
	let c = c2;
	const d = p3;
	for (let index = n; index > 1; index--) {
		const t = 1 / index;
		const ab = lerp(a, b, t);
		const bc = lerp(b, c, t);
		const cd = lerp(c, d, t);
		const abc = lerp(ab, bc, t);
		const bcd = lerp(bc, cd, t);
		const mid = lerp(abc, bcd, t);
		pieces.push([a, ab, abc, mid]);
		a = mid;
		b = bcd;
		c = cd;
	}
	pieces.push([a, b, c, d]);
	return pieces;
}

function warpContour(contour, warp, step) {
	const points = contour.points;
	const segments = [];
	points.forEach((point, index) => {
		const next = points[(index + 1) % points.length];
		// A straight segment is a cubic with handles on the line, so it can bend.
		const c1 = point.h2 || lerp(point, next, 1 / 3);
		const c2 = next.h1 || lerp(point, next, 2 / 3);
		const length = Math.hypot(next.x - point.x, next.y - point.y);
		const n = Math.max(2, Math.min(4, Math.ceil(length / step)));
		segments.push(...splitCubic(point, c1, c2, next, n));
	});
	// Each anchor with its handles, moved by the warp; handles follow the local Jacobian.
	const moved = (anchor, handle) => {
		const e = 0.5;
		const p = warp(anchor.x, anchor.y);
		const px = warp(anchor.x + e, anchor.y);
		const py = warp(anchor.x, anchor.y + e);
		const hx = handle.x - anchor.x;
		const hy = handle.y - anchor.y;
		return {
			x: p.x + ((px.x - p.x) / e) * hx + ((py.x - p.x) / e) * hy,
			y: p.y + ((px.y - p.y) / e) * hx + ((py.y - p.y) / e) * hy,
		};
	};
	const out = segments.map(([p0, c1], index) => {
		const previous = segments[(index - 1 + segments.length) % segments.length];
		const anchor = warp(p0.x, p0.y);
		return {
			x: anchor.x,
			y: anchor.y,
			h1: moved(p0, previous[2]),
			h2: moved(p0, c1),
		};
	});
	return { points: out };
}
