// --------------------------------------------------------------
// Agent outline check (M6 #25): read-only diagnostics for one glyph
// --------------------------------------------------------------
/*
	Uses the existing path helpers: Path.findWinding (winding direction),
	Path.makePolySegment + PolySegment.findIntersections (built on
	findSegmentIntersections) for self-intersections, and Path.maxes for
	extents. Never mutates the glyph: every helper used here only reads.

	Issue codes:
	- TOO_FEW_POINTS     a contour with fewer than 3 points (cannot enclose area)
	- DUPLICATE_POINTS   consecutive on-curve points at the same place
	- SELF_INTERSECTION  a contour crosses itself
	- SPECK              a contour too small to see at text sizes
	- WINDING_SAME_AS_CONTAINER  a contour inside another one runs the same
	                     direction, so with nonzero fill a counter fills in
	- ABOVE_ASCENDER / BELOW_DESCENDER  outline extends past the font's
	                     ascent/descent plus overshoot
*/

/**
 * One short, actionable fix per issue code, sent with every issue so an agent does not have
 * to guess (bug 27). Tool names are the agent tools in tool-definitions.js.
 */
export const ISSUE_HINTS = Object.freeze({
	TOO_FEW_POINTS:
		'A contour needs at least 3 points. Remove it with delete_paths or redraw it with replace_paths.',
	DUPLICATE_POINTS:
		'Neighbouring points sit on the same spot. Redraw the contour with replace_paths without the repeated point.',
	SELF_INTERSECTION:
		'This contour crosses itself. boolean_paths union on it (withPathIndices null) untangles it; to cut it into the letter, boolean_paths subtract or exclude it from the letter instead.',
	SPECK:
		'This contour is too small to see. Remove it with delete_paths, or scale it up with transform_paths.',
	WINDING_SAME_AS_CONTAINER:
		"This contour sits inside another and runs the same direction, so it fills instead of cutting a hole. Reverse this contour's point order to cut it out (replace_paths with the points reversed), or use boolean_paths subtract (cut out) or union (merge).",
	ABOVE_ASCENDER:
		'The outline goes above the ascender. If that is not intended, move or scale it down with transform_paths.',
	BELOW_DESCENDER:
		'The outline goes below the descender. If that is not intended, move or scale it up with transform_paths.',
});

// The same code for a solid island inside a hole (shouldBe: 'solid'), e.g. after exclude.
const SOLID_ISLAND_HINT =
	"This contour is a solid island inside a hole but runs the same direction as the hole, so it does not fill. Reverse this contour's point order so it runs opposite to the hole (replace_paths with the points reversed), or redo the cut with boolean_paths, which winds islands correctly.";

const DUPLICATE_DISTANCE = 0.5;
const VERTEX_TOLERANCE = 1;
const MAX_INTERSECTION_SEGMENTS = 256;

/**
 * @param {Object} glyph - project Glyph (only Path shapes are checked)
 * @param {{upm: Number, ascent: Number, descent: Number, capHeight: Number,
 *   xHeight: Number, overshoot: Number}} metrics
 * @returns {{clean: Boolean, issues: Array<Object>, contours: Array<Object>, extents: Object | null}}
 */
export function checkGlyphOutlines(glyph, metrics) {
	const issues = [];
	const contours = [];
	const paths = glyph.shapes
		.map((shape, index) => ({ shape, index }))
		.filter(({ shape }) => shape.objType === 'Path');
	const speckSize = Math.max(2, metrics.upm * 0.004);

	for (const { shape, index } of paths) {
		const points = shape.pathPoints;
		const maxes = shape.maxes;
		const winding = points.length > 2 ? shape.findWinding() : 0;
		const contour = {
			index,
			pointCount: points.length,
			winding: winding < 0 ? 'clockwise' : winding > 0 ? 'counterclockwise' : 'unknown',
			bounds: roundBounds(maxes),
		};
		contours.push(contour);

		if (points.length < 3) {
			issues.push({ code: 'TOO_FEW_POINTS', pathIndex: index, pointCount: points.length });
			continue;
		}

		const duplicates = [];
		points.forEach((point, pointIndex) => {
			const next = points[(pointIndex + 1) % points.length];
			if (Math.hypot(point.p.x - next.p.x, point.p.y - next.p.y) < DUPLICATE_DISTANCE) {
				duplicates.push(pointIndex);
			}
		});
		if (duplicates.length)
			issues.push({
				code: 'DUPLICATE_POINTS',
				pathIndex: index,
				pointIndices: duplicates.slice(0, 16),
			});

		const width = maxes.xMax - maxes.xMin;
		const height = maxes.yMax - maxes.yMin;
		if (width < speckSize || height < speckSize) {
			issues.push({ code: 'SPECK', pathIndex: index, width: round(width), height: round(height) });
		}

		if (points.length <= MAX_INTERSECTION_SEGMENTS) {
			const crossings = selfIntersections(shape);
			if (crossings.length)
				issues.push({ code: 'SELF_INTERSECTION', pathIndex: index, at: crossings.slice(0, 8) });
		} else {
			contour.intersectionsChecked = false;
		}
	}

	// Nested contours with the same direction: with nonzero fill the inner one adds nothing
	// (a hole that does not cut, or an island inside a hole that does not fill). Containment is
	// real: the inner contour's outline lies inside the container's actual outline (bounds alone
	// put an island in a counter inside the letter's outer contour). The container is the
	// smallest contour that holds it; depth counts every contour around it.
	const polygons = new Map(
		paths.map(({ shape, index }) => [index, shape.pathPoints.length > 2 ? flatten(shape) : null])
	);
	const holds = (outer, inner) => {
		const outerPolygon = polygons.get(outer.index);
		const innerPolygon = polygons.get(inner.index);
		if (!outerPolygon || !innerPolygon || !boundsContain(outer.bounds, inner.bounds)) return false;
		return innerPolygon.every((point) => pointInPolygon(point, outerPolygon));
	};
	for (const inner of contours) {
		if (inner.winding === 'unknown') continue;
		const around = contours.filter(
			(outer) => outer !== inner && outer.winding !== 'unknown' && holds(outer, inner)
		);
		const container = around.sort(
			(a, b) => polygonArea(polygons.get(a.index)) - polygonArea(polygons.get(b.index))
		)[0];
		if (container && container.winding === inner.winding) {
			// Even depth = solid, odd = hole: what this contour should be, from its nesting.
			const shouldBe = around.length % 2 ? 'hole' : 'solid';
			issues.push({
				code: 'WINDING_SAME_AS_CONTAINER',
				pathIndex: inner.index,
				containerIndex: container.index,
				shouldBe,
			});
		}
	}

	let extents = null;
	if (paths.length) {
		const yMax = Math.max(...contours.map((contour) => contour.bounds.yMax));
		const yMin = Math.min(...contours.map((contour) => contour.bounds.yMin));
		const xMax = Math.max(...contours.map((contour) => contour.bounds.xMax));
		const xMin = Math.min(...contours.map((contour) => contour.bounds.xMin));
		extents = {
			xMin,
			xMax,
			yMin,
			yMax,
			top: nearestGuide(yMax, metrics),
			bottom: nearestGuide(yMin, metrics),
		};
		const slack = Math.max(0, metrics.overshoot || 0);
		if (yMax > metrics.ascent + slack)
			issues.push({ code: 'ABOVE_ASCENDER', by: round(yMax - metrics.ascent) });
		if (yMin < metrics.descent - slack)
			issues.push({ code: 'BELOW_DESCENDER', by: round(metrics.descent - yMin) });
	}

	for (const issue of issues)
		issue.hint =
			issue.code === 'WINDING_SAME_AS_CONTAINER' && issue.shouldBe === 'solid'
				? SOLID_ISLAND_HINT
				: ISSUE_HINTS[issue.code];
	return { clean: issues.length === 0, issues, contours, extents };
}

/**
 * Marks each issue of `after` that the glyph already had in `before` (same code on the same
 * contour geometry, wherever its index moved to) as `preExisting: true`. Extents compare by
 * code only. Used by the glyph-job gate: the user's own outlines never block a job.
 * @param {Object} afterGlyph - the draft
 * @param {Array<Object>} afterIssues - checkGlyphOutlines(afterGlyph).issues
 * @param {Object | null} beforeGlyph - the glyph when the job began (null: a new glyph)
 * @param {Array<Object>} beforeIssues - checkGlyphOutlines(beforeGlyph).issues
 * @returns {Array<Object>} the after issues, each with preExisting
 */
export function markPreExisting(afterGlyph, afterIssues, beforeGlyph, beforeIssues) {
	const key = (glyph, issue) => {
		const shape = (index) =>
			Number.isInteger(index) ? contourFingerprint(glyph.shapes[index]) : '';
		if (issue.pathIndex === undefined) return issue.code;
		return `${issue.code}|${shape(issue.pathIndex)}|${shape(issue.containerIndex)}`;
	};
	// Counted, not a set: a copy of a contour that was already bad is a new problem.
	const before = new Map();
	for (const issue of beforeGlyph ? beforeIssues : []) {
		const k = key(beforeGlyph, issue);
		before.set(k, (before.get(k) || 0) + 1);
	}
	return afterIssues.map((issue) => {
		const k = key(afterGlyph, issue);
		const left = before.get(k) || 0;
		if (left) before.set(k, left - 1);
		return { ...issue, preExisting: left > 0 };
	});
}

/** Geometry of one contour as a string (rounded), independent of its index or name. */
export function contourFingerprint(shape) {
	if (!shape?.pathPoints) return '';
	const r = (value) => Math.round(value * 100) / 100;
	return shape.pathPoints
		.map((point) =>
			[
				point.p.x,
				point.p.y,
				point.h1.use ? `${r(point.h1.x)},${r(point.h1.y)}` : '-',
				point.h2.use ? `${r(point.h2.x)},${r(point.h2.y)}` : '-',
			]
				.map((v) => (typeof v === 'number' ? r(v) : v))
				.join(',')
		)
		.join(';');
}

function selfIntersections(path) {
	let found;
	try {
		found = path.makePolySegment().findIntersections();
	} catch {
		return [];
	}
	const vertices = path.pathPoints.map((point) => point.p);
	const result = [];
	for (const ix of found) {
		const [x, y] = String(ix).split('/').map(Number);
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		// Neighbouring segments always meet at their shared point; only
		// crossings away from on-curve points count.
		if (vertices.some((v) => Math.hypot(v.x - x, v.y - y) <= VERTEX_TOLERANCE)) continue;
		if (result.some((r) => Math.hypot(r.x - x, r.y - y) <= VERTEX_TOLERANCE)) continue;
		result.push({ x: round(x), y: round(y) });
	}
	return result;
}

function nearestGuide(value, metrics) {
	const guides = {
		ascender: metrics.ascent,
		capHeight: metrics.capHeight,
		xHeight: metrics.xHeight,
		baseline: 0,
		descender: metrics.descent,
	};
	let best = null;
	for (const [guide, at] of Object.entries(guides)) {
		const delta = round(value - at);
		if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { guide, delta };
	}
	return best;
}

const CURVE_STEPS = 8;

/** The contour as a closed polygon: on-curve points plus samples along each cubic. */
function flatten(shape) {
	const points = shape.pathPoints;
	const polygon = [];
	points.forEach((point, index) => {
		const next = points[(index + 1) % points.length];
		const p0 = { x: point.p.x, y: point.p.y };
		const p3 = { x: next.p.x, y: next.p.y };
		const p1 = point.h2.use ? { x: point.h2.x, y: point.h2.y } : p0;
		const p2 = next.h1.use ? { x: next.h1.x, y: next.h1.y } : p3;
		polygon.push(p0);
		if (p1 === p0 && p2 === p3) return;
		for (let step = 1; step < CURVE_STEPS; step++) {
			const t = step / CURVE_STEPS;
			const u = 1 - t;
			const a = u * u * u;
			const b = 3 * u * u * t;
			const c = 3 * u * t * t;
			const d = t * t * t;
			polygon.push({
				x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
				y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
			});
		}
	});
	return polygon;
}

/** Even-odd ray test; a point on the outline counts as inside (touching contours nest). */
function pointInPolygon(point, polygon) {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		if (onSegment(point, a, b)) return true;
		if (a.y > point.y !== b.y > point.y) {
			const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
			if (point.x < x) inside = !inside;
		}
	}
	return inside;
}

function onSegment(p, a, b) {
	const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
	if (Math.abs(cross) > 0.01 * Math.hypot(b.x - a.x, b.y - a.y)) return false;
	return (
		Math.min(a.x, b.x) - 0.01 <= p.x &&
		p.x <= Math.max(a.x, b.x) + 0.01 &&
		Math.min(a.y, b.y) - 0.01 <= p.y &&
		p.y <= Math.max(a.y, b.y) + 0.01
	);
}

function polygonArea(polygon) {
	if (!polygon) return Infinity;
	let sum = 0;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
		sum += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
	return Math.abs(sum / 2);
}

function boundsContain(outer, inner) {
	return (
		outer.xMin <= inner.xMin &&
		outer.xMax >= inner.xMax &&
		outer.yMin <= inner.yMin &&
		outer.yMax >= inner.yMax &&
		area(outer) > area(inner)
	);
}

function area(bounds) {
	return (bounds.xMax - bounds.xMin) * (bounds.yMax - bounds.yMin);
}

function roundBounds(maxes) {
	return {
		xMin: round(maxes.xMin),
		xMax: round(maxes.xMax),
		yMin: round(maxes.yMin),
		yMax: round(maxes.yMax),
	};
}

function round(value) {
	return Math.round(value * 100) / 100;
}
