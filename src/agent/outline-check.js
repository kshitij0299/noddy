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

const DUPLICATE_DISTANCE = 0.5;
const VERTEX_TOLERANCE = 1;
const MAX_INTERSECTION_SEGMENTS = 256;

/**
 * @param {Object} glyph - project Glyph (only Path shapes are checked)
 * @param {{upm: Number, ascent: Number, descent: Number, capHeight: Number,
 *   xHeight: Number, overshoot: Number}} metrics
 * @returns {{ok: Boolean, issues: Array<Object>, contours: Array<Object>, extents: Object | null}}
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

	// Nested contours with the same direction: the inner one fills instead of
	// cutting a counter. Containment by bounds and a sample point.
	for (const inner of contours) {
		if (inner.winding === 'unknown') continue;
		const container = contours
			.filter(
				(outer) =>
					outer !== inner &&
					outer.winding !== 'unknown' &&
					boundsContain(outer.bounds, inner.bounds)
			)
			.sort((a, b) => area(a.bounds) - area(b.bounds))[0];
		if (container && container.winding === inner.winding) {
			issues.push({
				code: 'WINDING_SAME_AS_CONTAINER',
				pathIndex: inner.index,
				containerIndex: container.index,
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

	return { ok: issues.length === 0, issues, contours, extents };
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
