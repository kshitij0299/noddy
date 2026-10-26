// Glitch bands: slice the letter into horizontal bands and shift each by a seeded offset.
import { orientByDepth, rectContour, translate } from '../geometry.js';

export default {
	id: 'glitch-bands',
	label: 'Glitch bands',
	icon: 'view_day',
	hint: 'Horizontal slices knocked sideways',
	params: [
		{ key: 'bands', label: 'Bands', type: 'int', min: 2, max: 12, default: 5 },
		{
			key: 'shift',
			label: 'Max shift',
			type: 'number',
			min: 1,
			max: 30,
			step: 1,
			default: 8,
			unit: '% em',
		},
	],
	async run(contours, { rng, chaos, params, box, metrics, boolean }) {
		const count = params.bands;
		const bandHeight = box.height / count;
		// Band edges with seeded jitter, kept in order and apart.
		const edges = [box.yMin - 1];
		for (let index = 1; index < count; index++)
			edges.push(box.yMin + bandHeight * (index + rng.signed() * chaos * 0.35));
		edges.push(box.yMax + 1);
		const maxShift = (params.shift / 100) * metrics.upm * (0.4 + chaos * 1.2);
		const shiftChance = 0.35 + chaos * 0.55;
		const groups = [];
		for (let index = 0; index < count; index++) {
			const band = rectContour(
				box.xMin - metrics.upm,
				edges[index],
				box.xMax + metrics.upm,
				edges[index + 1]
			);
			const slice = await boolean('intersect', contours, [band]);
			if (!slice.length) continue;
			const dx = rng.chance(shiftChance) ? rng.signed() * maxShift : 0;
			groups.push({ slice: orientByDepth(slice), dx });
		}
		// At least one band moves, or nothing glitched.
		if (groups.length && groups.every((group) => Math.abs(group.dx) < 1)) {
			const group = groups[rng.int(0, groups.length - 1)];
			group.dx = maxShift * (rng.chance(0.5) ? 1 : -1);
		}
		const pieces = groups.flatMap(({ slice, dx }) => translate(slice, dx, 0));
		return boolean('union', pieces);
	},
};
