// Pixel Life: for dot / pixel fonts. The letter becomes cells on the font's own grid, a few
// Game-of-Life-style generations run (stems protected), and the cells are rebuilt as squares.
import { cellsOf, traceCells } from '../pixel-grid.js';

/** Birth / survival neighbour counts per rule. */
export const LIFE_RULES = {
	mould: { label: 'Mould (grows)', birth: [3, 6], survive: [1, 2, 3, 4, 5, 6, 7, 8] },
	life: { label: 'Life (B3/S23)', birth: [3], survive: [2, 3] },
	coral: { label: 'Coral', birth: [3], survive: [4, 5, 6, 7, 8] },
	erode: { label: 'Erode', birth: [], survive: [2, 3, 4, 5, 6, 7, 8] },
};

export const NOT_GRID_NOTE =
	"This font isn't drawn on a pixel grid, so Pixel Life is off. It works on dot and pixel fonts.";

export default {
	id: 'pixel-life',
	label: 'Pixel Life',
	icon: 'grain',
	hint: 'Dots breed and die on the font’s own grid',
	params: [
		{ key: 'generations', label: 'Generations', type: 'int', min: 1, max: 6, default: 2 },
		{
			key: 'rule',
			label: 'Rule',
			type: 'enum',
			options: Object.entries(LIFE_RULES).map(([value, rule]) => ({ value, label: rule.label })),
			default: 'mould',
		},
		{ key: 'protectStems', label: 'Protect stems', type: 'boolean', default: true },
	],
	needsGrid: true,
	// Growing ink is the point of mould and coral.
	guard: { maxInk: 2.4 },
	unavailable: ({ grid }) => (grid ? null : NOT_GRID_NOTE),
	async run(contours, { rng, chaos, params, grid }) {
		if (!grid) throw Object.assign(new Error(NOT_GRID_NOTE), { code: 'NOT_PIXEL_FONT' });
		const raster = cellsOf(contours, grid, 1);
		const { cols, rows } = raster;
		let cells = raster.cells;
		const rule = LIFE_RULES[params.rule] || LIFE_RULES.mould;
		const protectedCells = params.protectStems
			? stemCells(cells, cols, rows)
			: new Uint8Array(cells.length);
		// Each cell follows the rule with this probability: low chaos = a gentle nudge.
		const p = 0.35 + chaos * 0.65;
		for (let generation = 0; generation < params.generations; generation++) {
			const next = new Uint8Array(cells.length);
			for (let row = 0; row < rows; row++)
				for (let col = 0; col < cols; col++) {
					const index = row * cols + col;
					let n = 0;
					for (let dy = -1; dy <= 1; dy++)
						for (let dx = -1; dx <= 1; dx++) {
							if (!dx && !dy) continue;
							const c = col + dx;
							const r = row + dy;
							if (c >= 0 && r >= 0 && c < cols && r < rows && cells[r * cols + c]) n++;
						}
					const alive = cells[index] === 1;
					const ruled = alive ? rule.survive.includes(n) : rule.birth.includes(n);
					let value = rng.chance(p) ? ruled : alive;
					if (protectedCells[index]) value = true;
					next[index] = value ? 1 : 0;
				}
			cells = next;
		}
		return traceCells({ ...raster, cells }, grid);
	},
};

/** Cells in vertical runs at least half the letter's height (and 3 cells) tall. */
function stemCells(cells, cols, rows) {
	let inkRows = 0;
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++)
			if (cells[row * cols + col]) {
				inkRows++;
				break;
			}
	}
	const minRun = Math.max(3, Math.ceil(inkRows * 0.5));
	const result = new Uint8Array(cells.length);
	for (let col = 0; col < cols; col++) {
		let start = -1;
		for (let row = 0; row <= rows; row++) {
			const on = row < rows && cells[row * cols + col];
			if (on && start < 0) start = row;
			if (!on && start >= 0) {
				if (row - start >= minRun) for (let r = start; r < row; r++) result[r * cols + col] = 1;
				start = -1;
			}
		}
	}
	return result;
}
