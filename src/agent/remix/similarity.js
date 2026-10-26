// --------------------------------------------------------------
// Remix mode: novelty pressure (PR D). Pure: no DOM, no canvas.
// --------------------------------------------------------------
/*
	Two letters never look alike pixel for pixel (B is not C), so comparing whole renders says
	nothing about copy-paste. What the agent added is what must not repeat: the *change mask* is
	the 64 × 64 render of the take XOR the render of the glyph before the take, framed by the
	glyph's own bounds (padded, so overshoot outside the letter counts). The same slash pasted on
	B and on C gives two nearly equal masks; a gash through O and a kick off L's foot do not.
*/
import { boundsOf, rasterize } from '../chaos/geometry.js';

export const MASK_RESOLUTION = 64;
/** Masks this alike (0–1) are "the same move again": submit_glyph rejects TOO_SIMILAR. */
export const NOVELTY_LIMIT = 0.72;
/** Fewer changed cells than this (of 64 × 64) is no change worth comparing. */
const MIN_CHANGE = 6;

/**
 * @param {Array<Object>} before - contours at the start of the take
 * @param {Array<Object>} after - contours of the take
 * @returns {{cols: Number, rows: Number, cells: Uint8Array, count: Number}}
 */
export function changeMask(before, after, resolution = MASK_RESOLUTION) {
	const frame = boundsOf(before) || boundsOf(after);
	const cells = new Uint8Array(resolution * resolution);
	if (!frame) return { cols: resolution, rows: resolution, cells, count: 0 };
	const padX = frame.width * 0.25 + 1;
	const padY = frame.height * 0.25 + 1;
	const box = {
		xMin: frame.xMin - padX,
		xMax: frame.xMax + padX,
		yMin: frame.yMin - padY,
		yMax: frame.yMax + padY,
	};
	const a = rasterize(before, box, resolution, resolution);
	const b = rasterize(after, box, resolution, resolution);
	let count = 0;
	for (let index = 0; index < cells.length; index++) {
		cells[index] = a.cells[index] ^ b.cells[index];
		count += cells[index];
	}
	return { cols: resolution, rows: resolution, cells, count };
}

/** Cells of `mask` that have a set cell of `other` within one cell (a small shift is alike). */
function nearHits(mask, other) {
	const { cols, rows, cells } = mask;
	let hits = 0;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			if (!cells[row * cols + col]) continue;
			let near = false;
			for (let dr = -1; dr <= 1 && !near; dr++)
				for (let dc = -1; dc <= 1 && !near; dc++) {
					const r = row + dr;
					const c = col + dc;
					if (r >= 0 && c >= 0 && r < rows && c < cols && other.cells[r * cols + c]) near = true;
				}
			if (near) hits++;
		}
	return hits;
}

/**
 * How alike two change masks are, 0 (nothing in common) to 1 (the same move). Symmetric,
 * tolerant of a one-cell shift. Two takes that changed (almost) nothing count as alike.
 */
export function maskSimilarity(a, b) {
	const small = (mask) => mask.count < MIN_CHANGE;
	if (small(a) && small(b)) return 1;
	if (small(a) || small(b)) return 0;
	return (nearHits(a, b) + nearHits(b, a)) / (a.count + b.count);
}

/**
 * The most alike sibling of a take.
 * @param {{cells: Uint8Array, count: Number}} mask
 * @param {Array<{glyphId: String, mask: Object}>} siblings
 * @returns {{glyphId: String, similarity: Number} | null}
 */
export function closestSibling(mask, siblings) {
	let best = null;
	for (const sibling of siblings) {
		if (!sibling?.mask) continue;
		const similarity = maskSimilarity(mask, sibling.mask);
		if (!best || similarity > best.similarity)
			best = { glyphId: sibling.glyphId, similarity: Math.round(similarity * 100) / 100 };
	}
	return best;
}
