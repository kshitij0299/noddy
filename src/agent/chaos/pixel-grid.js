// --------------------------------------------------------------
// Chaos tools: the font's own pixel grid (Pixel Life). Pure.
// --------------------------------------------------------------
/*
	detectCellGrid finds the cell size and phase a dot / pixel font is drawn on, from its
	outlines: straight segments only, vertex coordinates that line up, and cells that are
	either full or empty when the outline is sampled on that grid. A drawn (curvy) font fails
	the test, and Pixel Life is switched off for it with a note.

	traceCells turns filled cells back into square contours: outer contours clockwise, holes
	counter-clockwise, corners only, diagonal neighbours kept as separate contours that touch.
*/
import { boundsOf, inkTester } from './geometry.js';

const PURE_LOW = 0.25;
const PURE_HIGH = 0.75;
export const MIN_PURITY = 0.85;

/** Circular mean of values modulo `period`. */
function phaseOf(values, period) {
	let sx = 0;
	let sy = 0;
	for (const value of values) {
		const angle = (((value % period) + period) % period) * ((Math.PI * 2) / period);
		sx += Math.cos(angle);
		sy += Math.sin(angle);
	}
	const angle = Math.atan2(sy, sx);
	return ((((angle / (Math.PI * 2)) * period) % period) + period) % period;
}

/** Share of values within 15% of a grid line, and their mean distance to it (in font units). */
function alignment(values, period, phase) {
	if (!values.length) return { hits: 0, residual: Infinity };
	const tolerance = period * 0.15;
	let hits = 0;
	let residual = 0;
	for (const value of values) {
		const offset = (((value - phase) % period) + period) % period;
		const distance = Math.min(offset, period - offset);
		if (distance <= tolerance) hits++;
		residual += distance;
	}
	return { hits: hits / values.length, residual: residual / values.length };
}

/**
 * Fraction of cells (over the ink's bounds) that are clearly full or clearly empty.
 * @returns {{purity: Number, cells: Number}}
 */
function purityOf(contours, pitch, ox, oy, samples = 3) {
	const box = boundsOf(contours);
	if (!box) return { purity: 0, cells: 0 };
	const inside = inkTester(contours);
	const i0 = Math.floor((box.xMin - ox) / pitch);
	const i1 = Math.ceil((box.xMax - ox) / pitch);
	const j0 = Math.floor((box.yMin - oy) / pitch);
	const j1 = Math.ceil((box.yMax - oy) / pitch);
	let pure = 0;
	let total = 0;
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			let hits = 0;
			for (let sy = 0; sy < samples; sy++)
				for (let sx = 0; sx < samples; sx++)
					if (
						inside(ox + (i + (sx + 0.5) / samples) * pitch, oy + (j + (sy + 0.5) / samples) * pitch)
					)
						hits++;
			const coverage = hits / (samples * samples);
			total++;
			if (coverage <= PURE_LOW || coverage >= PURE_HIGH) pure++;
		}
	}
	return { purity: total ? pure / total : 0, cells: total };
}

/**
 * @param {Array<Array<Object>>} contourSets - contours of a few glyphs of the font
 * @param {{upm: Number}} metrics
 * @returns {{pitch: Number, ox: Number, oy: Number, purity: Number} | null}
 */
export function detectCellGrid(contourSets, metrics) {
	const sets = contourSets.filter((set) => set?.length);
	if (!sets.length) return null;
	const all = sets.flat();
	const points = all.flatMap((contour) => contour.points);
	if (!points.length) return null;
	const curved = points.filter((point) => point.h1 || point.h2).length;
	if (curved / points.length > 0.1) return null;
	// Coordinates of horizontal and vertical edges only: diagonals (a slash) say nothing.
	const xs = [];
	const ys = [];
	for (const contour of all) {
		contour.points.forEach((point, index) => {
			const next = contour.points[(index + 1) % contour.points.length];
			if (Math.abs(point.x - next.x) < 0.5) xs.push(point.x);
			if (Math.abs(point.y - next.y) < 0.5) ys.push(point.y);
		});
	}
	if (xs.length < 4 || ys.length < 4) return null;
	const upm = metrics.upm || 1000;
	const candidates = [];
	for (let pitch = upm / 30; pitch <= upm / 8; pitch += upm / 2000) {
		const ox = phaseOf(xs, pitch);
		const oy = phaseOf(ys, pitch);
		const ax = alignment(xs, pitch, ox);
		const ay = alignment(ys, pitch, oy);
		candidates.push({
			pitch,
			ox,
			oy,
			score: (ax.hits + ay.hits) / 2,
			residual: ax.residual + ay.residual,
		});
	}
	// The best-aligned pitches, then the largest one whose cells are clean.
	const shortlist = candidates
		.filter((candidate) => candidate.score >= 0.5)
		.sort((a, b) => b.score - a.score || a.residual - b.residual)
		.slice(0, 16)
		.sort((a, b) => b.pitch - a.pitch);
	const passing = [];
	for (const candidate of shortlist) {
		let pure = 0;
		let cells = 0;
		for (const set of sets) {
			const result = purityOf(set, candidate.pitch, candidate.ox, candidate.oy);
			pure += result.purity * result.cells;
			cells += result.cells;
		}
		const purity = cells ? pure / cells : 0;
		const tall = Math.max(...sets.map((set) => boundsOf(set)?.height || 0)) / candidate.pitch;
		if (purity >= MIN_PURITY && tall >= 5) passing.push({ ...candidate, purity });
	}
	if (!passing.length) return null;
	// The cleanest grid; near-ties go to the larger pitch (half the true pitch is clean too).
	const purest = Math.max(...passing.map((candidate) => candidate.purity));
	const clean = passing.filter((candidate) => candidate.purity >= purest - 0.03);
	const largest = Math.max(...clean.map((candidate) => candidate.pitch));
	// Then, near that pitch, the one whose lines the vertices sit closest to.
	const best = clean
		.filter((candidate) => candidate.pitch >= largest * 0.9)
		.sort((a, b) => a.residual - b.residual)[0];
	return {
		pitch: round3(best.pitch),
		ox: round3(best.ox),
		oy: round3(best.oy),
		purity: round3(best.purity),
	};
}

const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * The glyph as cells on the grid, with a margin of empty cells around it to grow into.
 * @returns {{cols: Number, rows: Number, i0: Number, j0: Number, cells: Uint8Array}}
 */
export function cellsOf(contours, grid, margin = 1) {
	const box = boundsOf(contours);
	const inside = inkTester(contours);
	const { pitch, ox, oy } = grid;
	const i0 = Math.round((box.xMin - ox) / pitch) - margin;
	const i1 = Math.round((box.xMax - ox) / pitch) + margin;
	const j0 = Math.round((box.yMin - oy) / pitch) - margin;
	const j1 = Math.round((box.yMax - oy) / pitch) + margin;
	const cols = i1 - i0;
	const rows = j1 - j0;
	const cells = new Uint8Array(cols * rows);
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			// Majority of a 3×3 sample, so a bevelled dot still counts as one cell.
			let hits = 0;
			for (let sy = 0; sy < 3; sy++)
				for (let sx = 0; sx < 3; sx++)
					if (
						inside(
							ox + (i0 + col + (sx + 0.5) / 3) * pitch,
							oy + (j0 + row + (sy + 0.5) / 3) * pitch
						)
					)
						hits++;
			if (hits >= 5) cells[row * cols + col] = 1;
		}
	return { cols, rows, i0, j0, cells };
}

/**
 * Filled cells → square contours in font units.
 * @param {{cols: Number, rows: Number, i0: Number, j0: Number, cells: Uint8Array}} raster
 * @param {{pitch: Number, ox: Number, oy: Number}} grid
 */
export function traceCells({ cols, rows, i0, j0, cells }, grid) {
	const filled = (col, row) =>
		col >= 0 && row >= 0 && col < cols && row < rows && cells[row * cols + col] === 1;
	// Directed boundary edges with the ink on the right (clockwise around ink, y up).
	/** @type {Map<String, Array<{from: Array<Number>, to: Array<Number>}>>} */
	const outgoing = new Map();
	const key = (x, y) => `${x},${y}`;
	const add = (from, to) => {
		const k = key(...from);
		if (!outgoing.has(k)) outgoing.set(k, []);
		outgoing.get(k).push({ from, to, used: false });
	};
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			if (!filled(col, row)) continue;
			if (!filled(col, row + 1)) add([col, row + 1], [col + 1, row + 1]); // top, east
			if (!filled(col + 1, row)) add([col + 1, row + 1], [col + 1, row]); // right, south
			if (!filled(col, row - 1)) add([col + 1, row], [col, row]); // bottom, west
			if (!filled(col - 1, row)) add([col, row], [col, row + 1]); // left, north
		}
	const contours = [];
	for (const edges of outgoing.values()) {
		for (const start of edges) {
			if (start.used) continue;
			const loop = [];
			let edge = start;
			while (edge && !edge.used) {
				edge.used = true;
				loop.push(edge.from);
				const options = (outgoing.get(key(...edge.to)) || []).filter((next) => !next.used);
				if (options.length <= 1) edge = options[0];
				else {
					// A pinch (diagonal neighbours): turn right, so each region keeps its own contour.
					const dir = [edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]];
					const right = [dir[1], -dir[0]];
					edge =
						options.find(
							(next) =>
								next.to[0] - next.from[0] === right[0] && next.to[1] - next.from[1] === right[1]
						) || options[0];
				}
			}
			// Corners only: drop vertices in the middle of a straight run.
			const corners = loop.filter((point, index) => {
				const a = loop[(index - 1 + loop.length) % loop.length];
				const b = loop[(index + 1) % loop.length];
				return !(
					(a[0] === point[0] && point[0] === b[0]) ||
					(a[1] === point[1] && point[1] === b[1])
				);
			});
			if (corners.length < 4) continue;
			contours.push({
				points: corners.map(([col, row]) => ({
					x: round3(grid.ox + (i0 + col) * grid.pitch),
					y: round3(grid.oy + (j0 + row) * grid.pitch),
					h1: null,
					h2: null,
				})),
			});
		}
	}
	return contours;
}
