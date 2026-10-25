// Slash cut: sharp kite-shaped slashes cut into the letter with exclude: where a slash
// overlaps the ink it cuts, outside the letter it stays solid (the owner's graffiti A).
import { findStems, inkCentroid } from '../geometry.js';

const rad = (degrees) => (degrees * Math.PI) / 180;

export default {
	id: 'slash-cut',
	label: 'Slash cut',
	icon: 'content_cut',
	hint: 'Sharp slashes cut through the ink, solid outside it',
	params: [
		{ key: 'count', label: 'Slashes', type: 'int', min: 1, max: 4, default: 1 },
		{
			key: 'angle',
			label: 'Angle',
			type: 'number',
			min: -80,
			max: 80,
			step: 1,
			default: 35,
			unit: '°',
		},
		{
			key: 'width',
			label: 'Width',
			type: 'number',
			min: 2,
			max: 20,
			step: 1,
			default: 7,
			unit: '% em',
		},
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
		const centroid = inkCentroid(contours, box);
		const stems = findStems(contours, box);
		const slashes = [];
		for (let index = 0; index < params.count; index++) {
			// Anatomy: the first slash goes through the ink's centre, the others through stems
			// (or spread across the letter when it has none), each with seeded jitter.
			let anchor = centroid;
			if (index > 0) {
				const stem = stems.length ? stems[(index - 1) % stems.length] : null;
				const spread = (index % 2 ? 1 : -1) * Math.ceil(index / 2) * 0.24;
				anchor = {
					x: stem ?? centroid.x + spread * box.width,
					y: centroid.y + spread * box.height * 0.8,
				};
			}
			const jitter = 0.05 + chaos * 0.2;
			const cx = anchor.x + rng.signed() * jitter * box.width;
			const cy = anchor.y + rng.signed() * jitter * box.height;
			const angle = rad(params.angle + rng.signed() * chaos * 22 + (index ? rng.signed() * 12 : 0));
			// Long enough to cross the letter's box along this angle, plus the overshoot.
			const chord =
				2 *
				Math.min(
					Math.abs(Math.cos(angle)) > 1e-3 ? box.width / 2 / Math.abs(Math.cos(angle)) : Infinity,
					Math.abs(Math.sin(angle)) > 1e-3 ? box.height / 2 / Math.abs(Math.sin(angle)) : Infinity
				);
			const length = chord * (1 + params.overshoot / 100) * (0.9 + rng.next() * 0.2);
			const width = (params.width / 100) * metrics.upm * (1 + rng.signed() * chaos * 0.45);
			slashes.push(kite({ cx, cy, angle, length, width, rng, chaos }));
		}
		const marks = slashes.length > 1 ? await boolean('union', slashes) : slashes;
		return boolean('exclude', contours, marks);
	},
};

/** A long thin kite: two sharp tips and two shoulders, the widest point off-centre. */
function kite({ cx, cy, angle, length, width, rng, chaos }) {
	const ux = Math.cos(angle);
	const uy = Math.sin(angle);
	const nx = -uy;
	const ny = ux;
	const at = (t, side) => ({
		x: cx + ux * (t - 0.5) * length + nx * side,
		y: cy + uy * (t - 0.5) * length + ny * side,
		h1: null,
		h2: null,
	});
	// Shoulders at different points along the slash: a sheared, hand-cut look.
	const shoulderA = 0.5 + rng.signed() * (0.08 + chaos * 0.22);
	const shoulderB = 0.5 + rng.signed() * (0.08 + chaos * 0.22);
	return {
		points: [at(0, 0), at(shoulderA, width / 2), at(1, 0), at(shoulderB, -width / 2)],
	};
}
