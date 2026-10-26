// --------------------------------------------------------------
// Remix moves (PR D): the card deck's own ops. Pure, seeded, guarded like every chaos op.
// --------------------------------------------------------------
/*
	Each move works on the letter's anatomy, not on a fixed spot:
	- piece-rotate (a lean about the cut) / piece-shift / piece-scale / piece-mirror cut the letter in two along a
	  seeded line (through the ink, near its centre) and change one piece, then weld the two
	  back together with a union (a "cut and reglue").
	- kick sends a sharp spike off a terminal (the end of a stroke the seed picks: L's foot,
	  a serif corner) and welds it on.
	- gash cuts a kite slash through the biggest counter (O's hole, the bowl of B), or through
	  the ink's centre when the letter has none, with exclude (solid outside the ink).
	They are `deck: true`: the card deck (src/agent/remix/deck.js) and apply_chaos use them; the
	Chaos tab lists only the five tools of PR C.
*/
import { inkCentroid, mapPoints, orientByDepth, rasterize } from '../geometry.js';
import { kite } from './slash-cut.js';

const rad = (degrees) => (degrees * Math.PI) / 180;

const cutAngle = {
	key: 'angle',
	label: 'Angle',
	type: 'number',
	min: -80,
	max: 80,
	step: 1,
	default: 0,
	unit: '°',
};
const strength = (fallback) => ({
	key: 'strength',
	label: 'Strength',
	type: 'number',
	min: -100,
	max: 100,
	step: 5,
	default: fallback,
	unit: '%',
});
const width = {
	key: 'width',
	label: 'Width',
	type: 'number',
	min: 2,
	max: 20,
	step: 1,
	default: 7,
	unit: '% em',
};

/** A huge quad covering one side of the line through (x, y) at `angle` (the left side). */
export function halfPlane(x, y, angle, size) {
	const ux = Math.cos(angle);
	const uy = Math.sin(angle);
	const nx = -uy;
	const ny = ux;
	const pt = (along, across) => ({
		x: x + ux * along + nx * across,
		y: y + uy * along + ny * across,
		h1: null,
		h2: null,
	});
	// Clockwise in y-up (an outer contour): left side of the line.
	return { points: [pt(-size, 0), pt(-size, size), pt(size, size), pt(size, 0)] };
}

/**
 * The seeded cut: a line through the ink near its centre, `angle` degrees off horizontal plus
 * jitter, offset across the letter by up to a quarter of its height.
 */
function seededCut({ contours, box, rng, chaos, params }) {
	const centre = inkCentroid(contours, box);
	const angle = rad(params.angle + rng.signed() * (6 + chaos * 24));
	const offset = rng.signed() * (0.1 + chaos * 0.18) * box.height;
	return { x: centre.x, y: centre.y + offset, angle };
}

/** Splits the letter along the cut: piece (left of the line, usually the top) and the rest. */
async function split(contours, cut, { box, boolean }) {
	const size = Math.max(box.width, box.height) * 4 + 1000;
	const plane = halfPlane(cut.x, cut.y, cut.angle, size);
	const piece = orientByDepth(await boolean('intersect', contours, [plane]));
	const rest = orientByDepth(await boolean('subtract', contours, [plane]));
	return { piece, rest };
}

/** At least `min` of the full amount, signed by the param, scaled by chaos. */
function amount(rng, chaos, value, min = 0.35) {
	const sign = value < 0 ? -1 : 1;
	const magnitude = Math.abs(value) / 100;
	return sign * magnitude * (min + (1 - min) * chaos) * (0.75 + rng.next() * 0.5);
}

async function weld(pieces, boolean) {
	return boolean('union', pieces.flat());
}

export const pieceRotate = {
	id: 'piece-rotate',
	label: 'Rotate a piece',
	icon: 'rotate_right',
	hint: 'Cut the letter in two and lean one piece over',
	deck: true,
	params: [cutAngle, strength(50)],
	async run(contours, ctx) {
		const cut = seededCut({ contours, ...ctx });
		const { piece, rest } = await split(contours, cut, ctx);
		if (!piece.length || !rest.length) return contours;
		// The piece turns about the cut line itself (a shear along it, up to ±35°): its cut edge
		// stays where it was, so the piece stays joined and counters stay closed.
		const lean = Math.tan(rad(35 * amount(ctx.rng, ctx.chaos, ctx.params.strength)));
		const ux = Math.cos(cut.angle);
		const uy = Math.sin(cut.angle);
		const leaned = mapPoints(piece, (p) => {
			const across = -(p.x - cut.x) * uy + (p.y - cut.y) * ux;
			return { x: p.x + ux * lean * across, y: p.y + uy * lean * across };
		});
		return weld([leaned, rest], ctx.boolean);
	},
};

export const pieceShift = {
	id: 'piece-shift',
	label: 'Shift a stroke',
	icon: 'swap_horiz',
	hint: 'Cut the letter in two and slide one piece along the cut',
	deck: true,
	params: [cutAngle, strength(50)],
	async run(contours, ctx) {
		const cut = seededCut({ contours, ...ctx });
		const { piece, rest } = await split(contours, cut, ctx);
		if (!piece.length || !rest.length) return contours;
		// Up to 15% of the em along the cut.
		const slide = 0.15 * ctx.metrics.upm * amount(ctx.rng, ctx.chaos, ctx.params.strength);
		const moved = mapPoints(piece, (p) => ({
			x: p.x + Math.cos(cut.angle) * slide,
			y: p.y + Math.sin(cut.angle) * slide,
		}));
		return weld([moved, rest], ctx.boolean);
	},
};

export const pieceScale = {
	id: 'piece-scale',
	label: 'Scale a part',
	icon: 'open_in_full',
	hint: 'Cut the letter in two and grow or shrink one piece',
	deck: true,
	params: [cutAngle, strength(50)],
	async run(contours, ctx) {
		const cut = seededCut({ contours, ...ctx });
		const { piece, rest } = await split(contours, cut, ctx);
		if (!piece.length || !rest.length) return contours;
		// ×0.65–1.35 about the cut point, so the piece stays joined at the cut.
		const factor = 1 + 0.35 * amount(ctx.rng, ctx.chaos, ctx.params.strength);
		const scaled = mapPoints(piece, (p) => ({
			x: cut.x + (p.x - cut.x) * factor,
			y: cut.y + (p.y - cut.y) * factor,
		}));
		return weld([orientByDepth(scaled), rest], ctx.boolean);
	},
};

export const pieceMirror = {
	id: 'piece-mirror',
	label: 'Mirror a part',
	icon: 'flip',
	hint: 'Cut the letter in two and flip one piece left to right',
	deck: true,
	params: [cutAngle],
	async run(contours, ctx) {
		const cut = seededCut({ contours, ...ctx });
		const { piece, rest } = await split(contours, cut, ctx);
		if (!piece.length || !rest.length) return contours;
		let xMin = Infinity;
		let xMax = -Infinity;
		for (const contour of piece)
			for (const p of contour.points) {
				xMin = Math.min(xMin, p.x);
				xMax = Math.max(xMax, p.x);
			}
		const axis = (xMin + xMax) / 2;
		const flipped = orientByDepth(mapPoints(piece, (p) => ({ x: 2 * axis - p.x, y: p.y })));
		return weld([flipped, rest], ctx.boolean);
	},
};

/** The ink's extreme point towards `direction` (radians): a stroke end. */
function terminal(contours, direction) {
	const dx = Math.cos(direction);
	const dy = Math.sin(direction);
	let best = null;
	let score = -Infinity;
	for (const contour of contours)
		for (const p of contour.points) {
			const value = p.x * dx + p.y * dy;
			if (value > score) {
				score = value;
				best = p;
			}
		}
	return best;
}

// Where kicks go, in order of how natural they look: feet first, then the top corners.
const KICK_DIRECTIONS = [-30, -150, -60, -120, 30, 150, 0, 180];

export const kick = {
	id: 'kick',
	label: 'Kick off a terminal',
	icon: 'call_made',
	hint: 'A sharp spike off the end of a stroke',
	deck: true,
	params: [
		{ ...cutAngle, label: 'Turn', default: 0 },
		{ ...width, default: 8 },
		strength(60),
	],
	async run(contours, { rng, chaos, params, metrics, boolean }) {
		const direction = rad(rng.pick(KICK_DIRECTIONS) + params.angle + rng.signed() * 20);
		const tip = terminal(contours, direction);
		if (!tip) return contours;
		const length =
			metrics.upm * (0.12 + 0.22 * Math.abs(amount(rng, chaos, params.strength || 1, 0.3)));
		const spike = kite({
			// Start a third inside the ink so the spike welds on.
			cx: tip.x + Math.cos(direction) * length * 0.2,
			cy: tip.y + Math.sin(direction) * length * 0.2,
			angle: direction,
			length,
			width: (params.width / 100) * metrics.upm * (0.8 + rng.next() * 0.4),
			rng,
			chaos,
		});
		return boolean('union', [...contours, spike]);
	},
};

/** Centres of the enclosed empty regions (counters), biggest first. */
export function counterCentres(contours, box, resolution = 48) {
	const { cols, rows, cells } = rasterize(contours, box, resolution, resolution);
	const seen = new Uint8Array(cells.length);
	const found = [];
	for (let start = 0; start < cells.length; start++) {
		if (cells[start] || seen[start]) continue;
		const stack = [start];
		seen[start] = 1;
		let edge = false;
		let sx = 0;
		let sy = 0;
		let n = 0;
		while (stack.length) {
			const index = stack.pop();
			const col = index % cols;
			const row = (index - col) / cols;
			sx += col + 0.5;
			sy += row + 0.5;
			n++;
			if (!col || !row || col === cols - 1 || row === rows - 1) edge = true;
			for (const [c, r] of [
				[col + 1, row],
				[col - 1, row],
				[col, row + 1],
				[col, row - 1],
			]) {
				if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
				const next = r * cols + c;
				if (!cells[next] && !seen[next]) {
					seen[next] = 1;
					stack.push(next);
				}
			}
		}
		if (!edge && n >= 3)
			found.push({
				size: n,
				x: box.xMin + (sx / n / cols) * box.width,
				y: box.yMin + (sy / n / rows) * box.height,
			});
	}
	return found.sort((a, b) => b.size - a.size);
}

export const gash = {
	id: 'gash',
	label: 'Gash a counter',
	icon: 'bolt',
	hint: 'A slash through the counter (the hole), solid outside the ink',
	deck: true,
	params: [
		{ ...cutAngle, default: 35 },
		width,
		{
			key: 'overshoot',
			label: 'Overshoot',
			type: 'number',
			min: 0,
			max: 80,
			step: 5,
			default: 20,
			unit: '%',
		},
	],
	async run(contours, { rng, chaos, params, box, metrics, boolean }) {
		const counters = counterCentres(contours, box);
		const anchor = counters[0] ?? inkCentroid(contours, box);
		const angle = rad(params.angle + rng.signed() * chaos * 25);
		const reach = Math.hypot(box.width, box.height) * 0.55;
		const mark = kite({
			cx: anchor.x + rng.signed() * 0.04 * box.width,
			cy: anchor.y + rng.signed() * 0.04 * box.height,
			angle,
			length: reach * (1 + params.overshoot / 100) * (0.85 + rng.next() * 0.3),
			width: (params.width / 100) * metrics.upm * (1 + rng.signed() * chaos * 0.4),
			rng,
			chaos,
		});
		return boolean('exclude', contours, [mark]);
	},
};

export const MOVE_OPS = [pieceRotate, pieceShift, pieceScale, pieceMirror, kick, gash];
