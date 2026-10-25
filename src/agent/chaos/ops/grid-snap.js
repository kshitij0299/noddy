// Grid snap: every on-curve point jumps to the nearest node of a seeded, optionally rotated
// lattice (a 1967 machine's idea of the letter). Curves become straight; points that land on
// the same node merge, and the result is untangled into clean contours.
import { cleanContours } from '../geometry.js';

const rad = (degrees) => (degrees * Math.PI) / 180;

export default {
	id: 'grid-snap',
	label: 'Grid snap',
	icon: 'grid_4x4',
	hint: 'Snap the outline to a coarse lattice',
	// Snapping is meant to move the shape: a looser overlap rule.
	guard: { minOverlap: 0.3 },
	params: [
		{ key: 'cols', label: 'Columns', type: 'int', min: 3, max: 12, default: 7 },
		{ key: 'rows', label: 'Rows', type: 'int', min: 3, max: 16, default: 9 },
		{
			key: 'angleStep',
			label: 'Angle step',
			type: 'number',
			min: 0,
			max: 45,
			step: 5,
			default: 0,
			unit: '°',
		},
	],
	async run(contours, { rng, chaos, params, box }) {
		const cellW = box.width / Math.max(1, params.cols - 1);
		const cellH = box.height / Math.max(1, params.rows - 1);
		// Rotation: a seeded number of angle steps, more of them with more chaos.
		const steps = Math.round(chaos * 2);
		const angle = params.angleStep ? rad(params.angleStep * rng.int(-steps, steps)) : 0;
		// The lattice's phase drifts with chaos.
		const phaseX = rng.signed() * chaos * 0.5 * cellW;
		const phaseY = rng.signed() * chaos * 0.5 * cellH;
		const cx = (box.xMin + box.xMax) / 2;
		const cy = (box.yMin + box.yMax) / 2;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const snap = (point) => {
			// Into the lattice frame, round to a node, and back.
			const dx = point.x - cx;
			const dy = point.y - cy;
			const lx = dx * cos + dy * sin;
			const ly = -dx * sin + dy * cos;
			const ox = box.xMin - cx + phaseX;
			const oy = box.yMin - cy + phaseY;
			const sx = ox + Math.round((lx - ox) / cellW) * cellW;
			const sy = oy + Math.round((ly - oy) / cellH) * cellH;
			return { x: cx + sx * cos - sy * sin, y: cy + sx * sin + sy * cos, h1: null, h2: null };
		};
		const minArea = cellW * cellH * 0.05;
		// Snapping folds outlines onto themselves (a run that goes out and back along one lattice
		// line, a loop pinched at one node). Split each contour at repeated nodes and drop the
		// zero-area pieces, without a boolean: overlapping collinear edges are exactly what
		// boolean engines choke on.
		const loops = contours.flatMap((contour) => splitAtRepeats(contour.points.map(snap)));
		return cleanContours(
			cleanContours(
				loops.map((points) => ({ points })),
				{ minArea }
			),
			{
				minArea,
			}
		);
	},
};

const nodeKey = (point) => `${Math.round(point.x * 10)},${Math.round(point.y * 10)}`;

/** One closed run of points → simple loops, split wherever it comes back to a node. */
export function splitAtRepeats(points) {
	const loops = [];
	const stack = [];
	const at = new Map();
	for (const point of points) {
		const key = nodeKey(point);
		if (at.has(key)) {
			const start = at.get(key);
			const loop = stack.splice(start + 1);
			for (const item of loop) at.delete(nodeKey(item));
			if (loop.length >= 2) loops.push([stack[start], ...loop]);
			continue;
		}
		at.set(key, stack.length);
		stack.push(point);
	}
	if (stack.length >= 3) loops.push(stack);
	return loops;
}
