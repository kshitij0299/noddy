// --------------------------------------------------------------
// Chaos tools: the legibility guard (PR C). Pure.
// --------------------------------------------------------------
/*
	Two layers:
	1. The gate, always on: the result must pass check_outlines the way submit_glyph does (new
	   structural issues reject). "Break rules" never turns this off: a broken outline would
	   not land anyway.
	2. Legibility, on by default ("Break rules" in Wild mode turns it off): the letter keeps its
	   counters, and its ink and bounds do not drift too far from the original, so it still
	   reads as itself.
*/
import { BLOCKING_ISSUES, checkGlyphOutlines, markPreExisting } from '../outline-check.js';
import { boundsOf, rasterize, toGlyph } from './geometry.js';

export const GUARD_LIMITS = Object.freeze({
	/** Ink area after / before. */
	minInk: 0.5,
	maxInk: 1.8,
	/** Overlap of the ink after with the ink before (intersection over union). */
	minOverlap: 0.35,
	/** Bounds width and height, after / before. */
	minSize: 0.65,
	maxSize: 1.7,
	/** Centre of the bounds may move this much of the em. */
	maxCentreShift: 0.22,
});

const RESOLUTION = 64;

/**
 * @param {Array<Object>} before - contours of the glyph before the op
 * @param {Array<Object>} after - contours the op produced
 * @param {Object} options
 * @param {Object} options.metrics - fontMetrics()
 * @param {Boolean} [options.legibility] - false = "Break rules"
 * @param {Object} [options.limits] - an op's own overrides of GUARD_LIMITS
 * @returns {{ok: Boolean, reasons: Array<{code: String, message: String}>, issues: Array<Object>}}
 */
export function guardResult(before, after, { metrics, legibility = true, limits = {} }) {
	const reasons = [];
	if (!after.length) {
		reasons.push({ code: 'EMPTY', message: 'Nothing of the letter was left.' });
		return { ok: false, reasons, issues: [] };
	}
	const issues = gateIssues(before, after, metrics);
	if (issues.length)
		reasons.push({
			code: 'OUTLINES',
			message: `The outline would not pass the check (${[
				...new Set(issues.map((i) => i.code)),
			].join(', ')}).`,
		});
	if (legibility) reasons.push(...legibilityReasons(before, after, metrics, limits));
	return { ok: reasons.length === 0, reasons, issues };
}

/** New blocking check_outlines issues, as submit_glyph counts them. */
export function gateIssues(before, after, metrics) {
	const beforeGlyph = before.length ? toGlyph(before) : null;
	const afterGlyph = toGlyph(after);
	const check = checkGlyphOutlines(afterGlyph, metrics);
	const marked = markPreExisting(
		afterGlyph,
		check.issues,
		beforeGlyph,
		beforeGlyph ? checkGlyphOutlines(beforeGlyph, metrics).issues : []
	);
	return marked.filter((issue) => BLOCKING_ISSUES.includes(issue.code) && !issue.preExisting);
}

/** Measures for the legibility rules (exported for tests and the result notes). */
export function measure(before, after) {
	const a = boundsOf(before);
	const b = boundsOf(after);
	if (!a || !b) return null;
	const pad = Math.max(a.width, a.height, b.width, b.height) * 0.02 + 1;
	const box = {
		xMin: Math.min(a.xMin, b.xMin) - pad,
		xMax: Math.max(a.xMax, b.xMax) + pad,
		yMin: Math.min(a.yMin, b.yMin) - pad,
		yMax: Math.max(a.yMax, b.yMax) + pad,
	};
	const ra = rasterize(before, box, RESOLUTION, RESOLUTION);
	const rb = rasterize(after, box, RESOLUTION, RESOLUTION);
	let inkA = 0;
	let inkB = 0;
	let both = 0;
	for (let index = 0; index < ra.cells.length; index++) {
		inkA += ra.cells[index];
		inkB += rb.cells[index];
		both += ra.cells[index] & rb.cells[index];
	}
	return {
		ink: inkA ? inkB / inkA : 1,
		overlap: inkA + inkB - both ? both / (inkA + inkB - both) : 1,
		width: a.width ? b.width / a.width : 1,
		height: a.height ? b.height / a.height : 1,
		centreShift: Math.hypot(
			(b.xMin + b.xMax - a.xMin - a.xMax) / 2,
			(b.yMin + b.yMax - a.yMin - a.yMax) / 2
		),
		countersBefore: countCounters(ra),
		countersAfter: countCounters(rb),
	};
}

function legibilityReasons(before, after, metrics, overrides = {}) {
	const m = measure(before, after);
	if (!m) return [];
	const limits = { ...GUARD_LIMITS, ...overrides };
	const reasons = [];
	if (m.countersAfter < m.countersBefore)
		reasons.push({ code: 'LOST_COUNTER', message: 'A counter closed up or broke open.' });
	if (m.ink < limits.minInk || m.ink > limits.maxInk)
		reasons.push({ code: 'INK_DRIFT', message: 'Too much ink was lost or added.' });
	if (m.overlap < limits.minOverlap)
		reasons.push({ code: 'SHAPE_DRIFT', message: 'The letter moved too far from its shape.' });
	if (
		m.width < limits.minSize ||
		m.width > limits.maxSize ||
		m.height < limits.minSize ||
		m.height > limits.maxSize ||
		m.centreShift > limits.maxCentreShift * metrics.upm
	)
		reasons.push({ code: 'BOUNDS_DRIFT', message: 'The letter grew, shrank or moved too much.' });
	return reasons;
}

/** Enclosed empty regions (4-connected) that do not touch the raster's edge. */
export function countCounters({ cols, rows, cells }) {
	const seen = new Uint8Array(cells.length);
	let counters = 0;
	const stack = [];
	for (let start = 0; start < cells.length; start++) {
		if (cells[start] || seen[start]) continue;
		let touchesEdge = false;
		let size = 0;
		stack.push(start);
		seen[start] = 1;
		while (stack.length) {
			const index = stack.pop();
			size++;
			const col = index % cols;
			const row = (index - col) / cols;
			if (col === 0 || row === 0 || col === cols - 1 || row === rows - 1) touchesEdge = true;
			for (const [dc, dr] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			]) {
				const c = col + dc;
				const r = row + dr;
				if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
				const next = r * cols + c;
				if (!cells[next] && !seen[next]) {
					seen[next] = 1;
					stack.push(next);
				}
			}
		}
		// A pinhole of a cell or two is noise, not a counter.
		if (!touchesEdge && size >= 3) counters++;
	}
	return counters;
}
