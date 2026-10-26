// --------------------------------------------------------------
// Chaos tools: contour geometry (PR C). Pure: no DOM, no editor.
// --------------------------------------------------------------
/*
	A contour is the agent point format: { points: [{ x, y, h1, h2 }] }, font units, y up,
	absolute handles (null = straight), closed implicitly. Outer contours run clockwise
	(negative shoelace area in y-up), counters the other way, as Glyphr's findWinding expects.
*/
import { Glyph } from '../../project_data/glyph.js';

const CURVE_STEPS = 8;
const DUPLICATE_DISTANCE = 0.5;
const round2 = (value) => Math.round(value * 100) / 100;

/** Glyphr Paths (or their save() data) → contours. */
export function fromShapes(shapes = []) {
	return shapes
		.filter((shape) => (shape.objType ?? 'Path') === 'Path' && shape.pathPoints?.length)
		.map((shape) => ({
			points: shape.pathPoints.map((point) => {
				const p = point.p.coord ?? point.p;
				const handle = (h) => {
					if (!h?.use) return null;
					const c = h.coord ?? h;
					return { x: c.x, y: c.y };
				};
				return { x: p.x, y: p.y, h1: handle(point.h1), h2: handle(point.h2) };
			}),
		}));
}

/** Contours → Glyphr shape data (addOneShape / new Glyph({ shapes })). */
export function toShapeData(contours, name = 'Chaos') {
	return contours.map((contour, index) => ({
		name: `${name} ${index + 1}`,
		pathPoints: contour.points.map((point) => ({
			type: 'corner',
			p: { coord: { x: round2(point.x), y: round2(point.y) } },
			h1: {
				coord: point.h1
					? { x: round2(point.h1.x), y: round2(point.h1.y) }
					: { x: point.x, y: point.y },
				use: Boolean(point.h1),
			},
			h2: {
				coord: point.h2
					? { x: round2(point.h2.x), y: round2(point.h2.y) }
					: { x: point.x, y: point.y },
				use: Boolean(point.h2),
			},
		})),
	}));
}

/** A detached Glyph holding the contours (for check_outlines and rendering). */
export function toGlyph(contours, { id = 'glyph-0x0', advanceWidth = 0, name = 'Chaos' } = {}) {
	return new Glyph({ id, advanceWidth, shapes: toShapeData(contours, name) });
}

export function cloneContours(contours) {
	return contours.map((contour) => ({
		...(contour.depth !== undefined ? { depth: contour.depth } : {}),
		points: contour.points.map((point) => ({
			x: point.x,
			y: point.y,
			h1: point.h1 ? { ...point.h1 } : null,
			h2: point.h2 ? { ...point.h2 } : null,
		})),
	}));
}

/** The contour as a closed polygon: on-curve points plus samples along each cubic. */
export function flattenContour(contour, steps = CURVE_STEPS) {
	const points = contour.points;
	const polygon = [];
	points.forEach((point, index) => {
		const next = points[(index + 1) % points.length];
		polygon.push({ x: point.x, y: point.y });
		if (!point.h2 && !next.h1) return;
		const p1 = point.h2 || point;
		const p2 = next.h1 || next;
		for (let step = 1; step < steps; step++) {
			const t = step / steps;
			const u = 1 - t;
			polygon.push({
				x: u * u * u * point.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * next.x,
				y: u * u * u * point.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * next.y,
			});
		}
	});
	return polygon;
}

/** Shoelace area: positive = counter-clockwise in y-up. */
export function signedArea(polygon) {
	let sum = 0;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
		sum += polygon[j].x * polygon[i].y - polygon[i].x * polygon[j].y;
	return sum / 2;
}

export function contourArea(contour) {
	return signedArea(flattenContour(contour));
}

/** Bounds of the outline (curves sampled). null for no contours. */
export function boundsOf(contours) {
	let xMin = Infinity;
	let xMax = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;
	for (const contour of contours) {
		for (const point of flattenContour(contour)) {
			xMin = Math.min(xMin, point.x);
			xMax = Math.max(xMax, point.x);
			yMin = Math.min(yMin, point.y);
			yMax = Math.max(yMax, point.y);
		}
	}
	if (!Number.isFinite(xMin)) return null;
	return { xMin, xMax, yMin, yMax, width: xMax - xMin, height: yMax - yMin };
}

/** Nonzero winding number of (x, y) against flattened polygons. */
export function windingAt(x, y, polygons) {
	let winding = 0;
	for (const polygon of polygons) {
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			const a = polygon[j];
			const b = polygon[i];
			if (a.y <= y) {
				if (b.y > y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) > 0) winding++;
			} else if (b.y <= y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) < 0) winding--;
		}
	}
	return winding;
}

/** A point-in-ink test for the contours (nonzero fill, like fonts render). */
export function inkTester(contours) {
	const polygons = contours.map((contour) => flattenContour(contour));
	return (x, y) => windingAt(x, y, polygons) !== 0;
}

/**
 * Samples the ink on a cols × rows grid of cell centres over box.
 * @returns {{cols: Number, rows: Number, cells: Uint8Array, box: Object}}
 */
export function rasterize(contours, box, cols, rows) {
	const inside = inkTester(contours);
	const cells = new Uint8Array(cols * rows);
	const cw = (box.xMax - box.xMin) / cols;
	const ch = (box.yMax - box.yMin) / rows;
	for (let row = 0; row < rows; row++) {
		const y = box.yMin + (row + 0.5) * ch;
		for (let col = 0; col < cols; col++) {
			if (inside(box.xMin + (col + 0.5) * cw, y)) cells[row * cols + col] = 1;
		}
	}
	return { cols, rows, cells, box };
}

/** Reverses a contour's direction (handles swap sides). */
export function reverseContour(contour) {
	const points = [...contour.points].reverse().map((point) => ({
		x: point.x,
		y: point.y,
		h1: point.h2 ? { ...point.h2 } : null,
		h2: point.h1 ? { ...point.h1 } : null,
	}));
	return { ...contour, points };
}

/**
 * Sets each contour's direction from its nesting depth (0 = outer: clockwise, 1 = counter, …).
 * Contours without a depth get one from containment.
 */
export function orientByDepth(contours) {
	const polygons = contours.map((contour) => flattenContour(contour));
	return contours.map((contour, index) => {
		let depth = contour.depth;
		if (depth === undefined) {
			const probe = interiorProbe(polygons[index]);
			depth = polygons.filter(
				(polygon, other) =>
					other !== index &&
					Math.abs(signedArea(polygon)) > Math.abs(signedArea(polygons[index])) &&
					windingAt(probe.x, probe.y, [polygon]) !== 0
			).length;
		}
		const area = signedArea(polygons[index]);
		const outer = depth % 2 === 0;
		const fixed = (outer && area > 0) || (!outer && area < 0) ? reverseContour(contour) : contour;
		return { points: fixed.points };
	});
}

/** A point just inside the polygon, next to its first edge. */
function interiorProbe(polygon) {
	const a = polygon[0];
	const b = polygon[1] || polygon[0];
	const mx = (a.x + b.x) / 2;
	const my = (a.y + b.y) / 2;
	const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
	// Left normal for counter-clockwise polygons points inwards; pick the side that is inside.
	const nx = -(b.y - a.y) / length;
	const ny = (b.x - a.x) / length;
	const sign = signedArea(polygon) >= 0 ? 1 : -1;
	return { x: mx + nx * 0.25 * sign, y: my + ny * 0.25 * sign };
}

/**
 * Merges points on the same spot, drops straight points that sit on a straight line between
 * their neighbours, and drops contours that cannot enclose area.
 * @param {Array<Object>} contours
 * @param {{minArea?: Number}} [options]
 */
export function cleanContours(contours, { minArea = 4 } = {}) {
	const result = [];
	for (const contour of contours) {
		let points = [];
		for (const point of contour.points) {
			const previous = points.at(-1);
			if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < DUPLICATE_DISTANCE) {
				previous.h2 = point.h2;
				continue;
			}
			points.push({ ...point });
		}
		while (
			points.length > 1 &&
			Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < DUPLICATE_DISTANCE
		) {
			points[0].h1 = points.at(-1).h1;
			points.pop();
		}
		// Collinear straight corners (no handles on either side) add nothing.
		let changed = true;
		while (changed && points.length > 3) {
			changed = false;
			for (let index = 0; index < points.length; index++) {
				const a = points[(index - 1 + points.length) % points.length];
				const b = points[index];
				const c = points[(index + 1) % points.length];
				if (b.h1 || b.h2 || a.h2 || c.h1) continue;
				const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
				const span = Math.hypot(c.x - a.x, c.y - a.y) || 1;
				if (Math.abs(cross) / span < 0.05) {
					points.splice(index, 1);
					changed = true;
					break;
				}
			}
		}
		if (points.length < 3) continue;
		const next = { ...contour, points };
		if (Math.abs(contourArea(next)) < minArea) continue;
		result.push(next);
	}
	return result;
}

/** Applies (x, y) → {x, y} to every point and handle. */
export function mapPoints(contours, fn) {
	return contours.map((contour) => ({
		...contour,
		points: contour.points.map((point) => ({
			...fn(point),
			h1: point.h1 ? fn(point.h1) : null,
			h2: point.h2 ? fn(point.h2) : null,
		})),
	}));
}

export const translate = (contours, dx, dy) =>
	mapPoints(contours, (p) => ({ x: p.x + dx, y: p.y + dy }));

export function pointCount(contours) {
	return contours.reduce((sum, contour) => sum + contour.points.length, 0);
}

/** Axis-aligned rectangle as an outer (clockwise) contour. */
export function rectContour(x1, y1, x2, y2) {
	const pt = (x, y) => ({ x, y, h1: null, h2: null });
	return { points: [pt(x1, y1), pt(x1, y2), pt(x2, y2), pt(x2, y1)] };
}

/** Area-weighted centroid of the ink (from a raster). */
export function inkCentroid(contours, box, resolution = 32) {
	const { cols, rows, cells } = rasterize(contours, box, resolution, resolution);
	let sx = 0;
	let sy = 0;
	let n = 0;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++)
			if (cells[row * cols + col]) {
				sx += col + 0.5;
				sy += row + 0.5;
				n++;
			}
	if (!n) return { x: (box.xMin + box.xMax) / 2, y: (box.yMin + box.yMax) / 2 };
	return {
		x: box.xMin + (sx / n / cols) * (box.xMax - box.xMin),
		y: box.yMin + (sy / n / rows) * (box.yMax - box.yMin),
	};
}

/**
 * Vertical stems: x positions (font units) of columns where the ink runs at least
 * `minRun` of the glyph height without a break.
 */
export function findStems(contours, box, { resolution = 32, minRun = 0.55 } = {}) {
	const { cols, rows, cells } = rasterize(contours, box, resolution, resolution);
	const stems = [];
	for (let col = 0; col < cols; col++) {
		let run = 0;
		let best = 0;
		for (let row = 0; row < rows; row++) {
			run = cells[row * cols + col] ? run + 1 : 0;
			best = Math.max(best, run);
		}
		if (best >= rows * minRun) stems.push(box.xMin + ((col + 0.5) / cols) * box.width);
	}
	// Neighbouring columns are one stem: keep their middle.
	const merged = [];
	for (const x of stems) {
		const last = merged.at(-1);
		if (last && x - last.to <= (box.width / resolution) * 1.5) last.to = x;
		else merged.push({ from: x, to: x });
	}
	return merged.map((stem) => (stem.from + stem.to) / 2);
}
