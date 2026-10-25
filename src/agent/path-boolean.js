// --------------------------------------------------------------
// Agent boolean_paths: union / subtract / intersect / exclude on contours
// --------------------------------------------------------------
/*
	Uses paper.js (MIT, pinned in package.json) for Bézier booleans that keep curves. It is
	loaded with a dynamic import the first time a boolean runs, so it is a separate chunk and
	never part of the main bundle.

	Input contours are Glyphr Studio Paths (font units, y up). Each side is one compound path
	with the nonzero fill rule, which is how fonts render, so self-crossing or wrongly wound
	input is resolved first (paper's resolveCrossings + reorient inside every operation): what
	the agent sees in render_glyphs is what gets combined.

	Output: closed cubic contours in the agent's point format ({x, y, h1, h2}, absolute
	handles, null = straight) with their nesting depth (0 = outer, 1 = counter, ...). The caller
	sets each contour's direction from its depth.
*/

const DUPLICATE_DISTANCE = 0.5;
const MIN_AREA = 1;

let scopePromise;

/** The shared paper.js scope, imported on first use. */
export function loadPaper() {
	scopePromise ??= import('paper/dist/paper-core.js')
		.then((module) => {
			const paper = module.default ?? module;
			const scope = new paper.PaperScope();
			scope.setup(new scope.Size(1, 1));
			return scope;
		})
		.catch((error) => {
			scopePromise = undefined;
			throw error;
		});
	return scopePromise;
}

/**
 * @param {Object} options
 * @param {'union' | 'subtract' | 'intersect' | 'exclude'} options.operation
 * @param {Array<Object>} options.subject - Glyphr Paths (pathIndices)
 * @param {Array<Object>} options.clip - Glyphr Paths (withPathIndices); empty = untangle subject
 * @returns {Promise<Array<{points: Array<Object>, depth: Number}>>}
 */
export async function booleanContours({ operation, subject, clip }) {
	return booleanOf(operation, subject.map(shapePoints), clip.map(shapePoints));
}

/**
 * The same boolean on contours in the agent point format ({points: [{x, y, h1, h2}]}), for
 * the chaos tools (src/agent/chaos/).
 * @param {Object} options
 * @param {'union' | 'subtract' | 'intersect' | 'exclude'} options.operation
 * @param {Array<{points: Array<Object>}>} options.subject
 * @param {Array<{points: Array<Object>}>} [options.clip]
 * @returns {Promise<Array<{points: Array<Object>, depth: Number}>>}
 */
export async function booleanPointContours({ operation, subject, clip = [] }) {
	return booleanOf(
		operation,
		subject.map((contour) => contour.points),
		clip.map((contour) => contour.points)
	);
}

/** A Glyphr Path's points in the agent format. */
function shapePoints(shape) {
	return shape.pathPoints.map((point) => ({
		x: point.p.x,
		y: point.p.y,
		h1: point.h1.use ? { x: point.h1.x, y: point.h1.y } : null,
		h2: point.h2.use ? { x: point.h2.x, y: point.h2.y } : null,
	}));
}

async function booleanOf(operation, subject, clip) {
	const scope = await loadPaper();
	const a = toCompound(scope, subject);
	const b = clip.length ? toCompound(scope, clip) : new scope.Path({ insert: false });
	const method = {
		union: 'unite',
		subtract: 'subtract',
		intersect: 'intersect',
		exclude: 'exclude',
	}[operation];
	if (!method) throw new Error(`Unknown boolean operation: ${operation}`);
	const result = a[method](b, { insert: false });
	const children = (result.children ? [...result.children] : [result]).filter(
		(path) => path.closed !== false && path.segments.length >= 2 && Math.abs(path.area) >= MIN_AREA
	);
	const contours = children
		.map((path) => ({ path, points: toPoints(path) }))
		.filter(({ points }) => points.length >= 3);
	return contours.map(({ path, points }) => ({
		points,
		// Nesting depth: contours whose bounds hold this one and whose own area holds its
		// interior point (a hole's interior point may sit in the outer's own interior point).
		depth: contours.filter(
			(other) =>
				other.path !== path &&
				other.path.bounds.contains(path.bounds) &&
				Math.abs(other.path.area) > Math.abs(path.area) &&
				other.path.contains(path.interiorPoint)
		).length,
	}));
}

function toCompound(scope, contours) {
	return new scope.CompoundPath({
		children: contours.map((points) => toPath(scope, points)),
		fillRule: 'nonzero',
		insert: false,
	});
}

function toPath(scope, points) {
	const segments = points.map(
		({ x, y, h1, h2 }) =>
			new scope.Segment(
				new scope.Point(x, y),
				h1 ? new scope.Point(h1.x - x, h1.y - y) : null,
				h2 ? new scope.Point(h2.x - x, h2.y - y) : null
			)
	);
	return new scope.Path({ segments, closed: true, insert: false });
}

const round = (value) => Math.round(value * 100) / 100;

/** A paper path → agent points, merging points that land on the same spot. */
function toPoints(path) {
	const points = [];
	for (const segment of path.segments) {
		const x = round(segment.point.x);
		const y = round(segment.point.y);
		const handle = (vector) =>
			vector.isZero() ? null : { x: round(x + vector.x), y: round(y + vector.y) };
		const point = { x, y, h1: handle(segment.handleIn), h2: handle(segment.handleOut) };
		const previous = points.at(-1);
		if (previous && Math.hypot(previous.x - x, previous.y - y) < DUPLICATE_DISTANCE) {
			// Zero-length curve: keep the first point's incoming and this one's outgoing handle.
			previous.h2 = point.h2;
			continue;
		}
		points.push(point);
	}
	const first = points[0];
	const last = points.at(-1);
	if (points.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) < DUPLICATE_DISTANCE) {
		first.h1 = last.h1;
		points.pop();
	}
	return points;
}
