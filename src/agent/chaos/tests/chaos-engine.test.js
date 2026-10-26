// PR C: the chaos op engine. Deterministic per seed, valid closed contours, the gate and the
// legibility guard, re-rolls, and Pixel Life's grid.
import { describe, expect, it } from 'vitest';
import { CHAOS_OP_NAMES } from '../../tool-definitions.js';
import {
	CHAOS_OPS,
	CHAOS_OP_IDS,
	defaultParams,
	getChaosOp,
	resolveParams,
	runChaos,
} from '../engine.js';
import { contourArea, flattenContour, rectContour as rect, signedArea } from '../geometry.js';
import { countCounters, gateIssues, guardResult, measure } from '../guard.js';
import { cellsOf, detectCellGrid, traceCells } from '../pixel-grid.js';
import { mulberry32, rngFor } from '../rng.js';
import { splitAtRepeats } from '../ops/grid-snap.js';
import {
	CURVY_O,
	GRID,
	METRICS,
	PIXEL_H,
	PIXEL_O,
	SANS_H,
	ellipse,
	pixelGlyph,
} from './fixtures.js';

const run = (op, contours, extra = {}) =>
	runChaos({
		op,
		contours,
		glyphId: 'glyph-0x48',
		seed: 42,
		chaos: 50,
		metrics: METRICS,
		...extra,
	});

function expectValidContours(contours) {
	expect(contours.length).toBeGreaterThan(0);
	for (const contour of contours) {
		expect(contour.points.length).toBeGreaterThanOrEqual(3);
		for (const point of contour.points) {
			for (const value of [point.x, point.y, point.h1?.x ?? 0, point.h1?.y ?? 0]) {
				expect(Number.isFinite(value)).toBe(true);
			}
		}
		expect(Math.abs(contourArea(contour))).toBeGreaterThan(1);
	}
}

describe('seeded randomness', () => {
	it('reproduces per (seed, glyph, op) and differs across glyphs and seeds', () => {
		const take = (seed, glyph, op) => {
			const rng = rngFor(seed, glyph, op);
			return [rng.next(), rng.next(), rng.next()];
		};
		expect(take(7, 'glyph-0x41', 'warp')).toEqual(take(7, 'glyph-0x41', 'warp'));
		expect(take(7, 'glyph-0x41', 'warp')).not.toEqual(take(7, 'glyph-0x42', 'warp'));
		expect(take(7, 'glyph-0x41', 'warp')).not.toEqual(take(8, 'glyph-0x41', 'warp'));
		const next = mulberry32(1);
		for (let i = 0; i < 100; i++) {
			const value = next();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});
});

describe('the op registry', () => {
	it('matches the apply_chaos enum and has params with defaults inside their ranges', () => {
		expect(CHAOS_OP_IDS).toEqual(CHAOS_OP_NAMES);
		for (const op of CHAOS_OPS) {
			expect(typeof op.run).toBe('function');
			expect(op.label).toBeTruthy();
			for (const param of op.params) {
				if (param.type === 'int' || param.type === 'number') {
					expect(param.default).toBeGreaterThanOrEqual(param.min);
					expect(param.default).toBeLessThanOrEqual(param.max);
				}
			}
		}
	});

	it('clamps, defaults and drops params', () => {
		const slash = getChaosOp('slash-cut');
		expect(resolveParams(slash, { count: 99, angle: null, bogus: 1 })).toEqual({
			...defaultParams(slash),
			count: 4,
		});
		expect(resolveParams(getChaosOp('warp'), { warp: 'nope' }).warp).toBe('wave');
	});
});

describe.each([
	['slash-cut', SANS_H, {}],
	['slash-cut', CURVY_O, { count: 2 }],
	['glitch-bands', SANS_H, {}],
	['glitch-bands', CURVY_O, {}],
	['warp', SANS_H, { warp: 'arc' }],
	['warp', CURVY_O, { warp: 'bulge' }],
	['warp', SANS_H, { warp: 'twist' }],
	['warp', SANS_H, { warp: 'wave' }],
	['grid-snap', SANS_H, {}],
	['grid-snap', PIXEL_O, { angleStep: 15 }],
	// Remix moves (PR D, the card deck's ops).
	['piece-rotate', SANS_H, {}],
	['piece-rotate', CURVY_O, { strength: -60 }],
	['piece-shift', SANS_H, {}],
	['piece-shift', PIXEL_O, { angle: 20 }],
	['piece-scale', SANS_H, {}],
	['piece-scale', CURVY_O, { strength: -50 }],
	['piece-mirror', SANS_H, {}],
	['kick', SANS_H, {}],
	['kick', PIXEL_O, { width: 10 }],
	['gash', CURVY_O, {}],
	['gash', SANS_H, { angle: -40 }],
])('%s on %#', (op, contours, params) => {
	it('is deterministic, valid, passes the gate and changes the letter', async () => {
		const first = await run(op, contours, { params });
		const second = await run(op, contours, { params });
		expect(first.ok).toBe(true);
		expect(second.contours).toEqual(first.contours);
		expectValidContours(first.contours);
		expect(gateIssues(contours, first.contours, METRICS)).toEqual([]);
		expect(guardResult(contours, first.contours, { metrics: METRICS }).ok).toBe(true);
		expect(first.contours).not.toEqual(contours);
		// Outer contours clockwise (negative shoelace), counters the other way.
		expect(Math.min(...first.contours.map((c) => signedArea(flattenContour(c))))).toBeLessThan(0);
	});

	it('gives another take for another seed', async () => {
		const a = await run(op, contours, { params });
		const b = await run(op, contours, { params, seed: 4242 });
		expect(b.ok).toBe(true);
		expect(b.contours).not.toEqual(a.contours);
	});
});

describe('slash cut', () => {
	it('cuts with exclude: ink is removed under the slash and added outside the letter', async () => {
		const result = await run('slash-cut', SANS_H, { params: { width: 10, overshoot: 40 } });
		const m = measure(SANS_H, result.contours);
		// Some of the original ink is gone (the cut), and there is ink outside it (the slash).
		expect(m.overlap).toBeLessThan(0.98);
		expect(m.width).toBeGreaterThan(1);
	});
});

describe('the legibility guard', () => {
	it('rejects a closed counter, an empty result, and a self-crossing outline', () => {
		const filled = [CURVY_O[0]];
		expect(guardResult(CURVY_O, filled, { metrics: METRICS }).reasons.map((r) => r.code)).toContain(
			'LOST_COUNTER'
		);
		expect(guardResult(CURVY_O, [], { metrics: METRICS }).reasons[0].code).toBe('EMPTY');
		const bowtie = [
			{
				points: [
					{ x: 0, y: 0, h1: null, h2: null },
					{ x: 600, y: 700, h1: null, h2: null },
					{ x: 600, y: 0, h1: null, h2: null },
					{ x: 0, y: 700, h1: null, h2: null },
				],
			},
		];
		expect(guardResult(SANS_H, bowtie, { metrics: METRICS }).reasons.map((r) => r.code)).toContain(
			'OUTLINES'
		);
	});

	it('finds a self-crossing made by a curve (the fast flattened check)', () => {
		const p = (x, y, h1 = null, h2 = null) => ({ x, y, h1, h2 });
		// An S-curve from (0, 300) to (600, 300), closed by the straight line back: it crosses
		// that line in the middle, away from both points.
		const loop = [
			{
				points: [
					p(0, 300, { x: 0, y: 300 }, { x: 200, y: 900 }),
					p(600, 300, { x: 400, y: -300 }, { x: 600, y: 300 }),
					p(300, 0),
				],
			},
		];
		const issues = gateIssues([], loop, METRICS).map((issue) => issue.code);
		expect(issues).toContain('SELF_INTERSECTION');
		expect(gateIssues([], SANS_H, METRICS)).toEqual([]);
		expect(gateIssues([], CURVY_O, METRICS)).toEqual([]);
	});

	it('rejects drift in ink and bounds', () => {
		const tiny = [ellipse(300, 350, 40, 40)];
		const codes = guardResult(SANS_H, tiny, { metrics: METRICS }).reasons.map((r) => r.code);
		expect(codes).toEqual(expect.arrayContaining(['INK_DRIFT', 'BOUNDS_DRIFT']));
	});

	it('rejects a lost part: an H without its crossbar', () => {
		const stems = [rect(60, 0, 160, 700), rect(440, 0, 540, 700)];
		const codes = guardResult(SANS_H, stems, { metrics: METRICS }).reasons.map((r) => r.code);
		expect(codes).toContain('PART_LOST');
		expect(measure(SANS_H, SANS_H).partKept).toBe(1);
	});

	it('Break rules turns the legibility rules off but never the gate', () => {
		expect(guardResult(CURVY_O, [CURVY_O[0]], { metrics: METRICS, legibility: false }).ok).toBe(
			true
		);
		const bowtie = [
			{
				points: [
					{ x: 0, y: 0, h1: null, h2: null },
					{ x: 600, y: 700, h1: null, h2: null },
					{ x: 600, y: 0, h1: null, h2: null },
					{ x: 0, y: 700, h1: null, h2: null },
				],
			},
		];
		expect(guardResult(SANS_H, bowtie, { metrics: METRICS, legibility: false }).ok).toBe(false);
	});

	it('counts counters on a raster', () => {
		const ring = { cols: 5, rows: 5, cells: new Uint8Array(25) };
		for (let i = 0; i < 25; i++) {
			const c = i % 5;
			const r = (i - c) / 5;
			if (c >= 1 && c <= 3 && r >= 1 && r <= 3 && !(c === 2 && r === 2)) ring.cells[i] = 1;
		}
		// A one-cell hole is a pinhole, not a counter.
		expect(countCounters(ring)).toBe(0);
	});

	it('re-rolls a rejected take (seed+1, then lower chaos) and reports what landed', async () => {
		// A 3×3 lattice closes the O's counter on most takes.
		const result = await run('grid-snap', CURVY_O, { params: { cols: 3, rows: 3 }, chaos: 100 });
		expect(result.attempts).toBeGreaterThan(1);
		expect(result.rejected.length).toBe(result.attempts - (result.ok ? 1 : 0));
		expect(result.rejected[0].reasons.map((r) => r.code)).toContain('LOST_COUNTER');
		if (result.ok) {
			expect(result.rerolled).toBe(true);
			expect(guardResult(CURVY_O, result.contours, { metrics: METRICS }).ok).toBe(true);
			// The reported seed and chaos reproduce the result in one take.
			const again = await run('grid-snap', CURVY_O, {
				params: { cols: 3, rows: 3 },
				seed: result.seed,
				chaos: result.chaos,
			});
			expect(again.attempts).toBe(1);
			expect(again.contours).toEqual(result.contours);
		} else {
			expect(result.error.code).toBe('GUARD_REJECTED');
		}
	});

	it('with Break rules the first take lands', async () => {
		const result = await run('grid-snap', CURVY_O, {
			params: { cols: 3, rows: 3 },
			chaos: 100,
			breakRules: true,
		});
		if (result.ok) expect(result.attempts).toBeLessThanOrEqual(2);
		expect(result.rejected.every((r) => r.reasons.every((x) => x.code === 'OUTLINES'))).toBe(true);
	});
});

describe('Pixel Life and the pixel grid', () => {
	it('finds the cell size of a pixel font and refuses a drawn one', () => {
		const grid = detectCellGrid([PIXEL_H, PIXEL_O], METRICS);
		expect(grid).not.toBeNull();
		expect(grid.pitch).toBeCloseTo(60, 0);
		expect(detectCellGrid([CURVY_O], METRICS)).toBeNull();
		expect(detectCellGrid([SANS_H, CURVY_O], METRICS)).toBeNull();
	});

	it('is off with a clear note on a font that is not grid-based', async () => {
		const result = await run('pixel-life', CURVY_O, { grid: null });
		expect(result.ok).toBe(false);
		expect(result.error.code).toBe('NOT_PIXEL_FONT');
		expect(result.error.message).toMatch(/pixel grid/);
	});

	it('runs generations on the grid, deterministic, square contours on grid lines', async () => {
		const grid = detectCellGrid([PIXEL_H, PIXEL_O], METRICS);
		const a = await run('pixel-life', PIXEL_H, { grid, params: { rule: 'life', generations: 2 } });
		const b = await run('pixel-life', PIXEL_H, { grid, params: { rule: 'life', generations: 2 } });
		expect(a.ok).toBe(true);
		expect(b.contours).toEqual(a.contours);
		expectValidContours(a.contours);
		for (const contour of a.contours)
			for (const point of contour.points) {
				expect(point.h1).toBeNull();
				const cells = (point.x - grid.ox) / grid.pitch;
				expect(Math.abs(cells - Math.round(cells))).toBeLessThan(0.02);
			}
		expect(gateIssues(PIXEL_H, a.contours, METRICS)).toEqual([]);
	});

	it('protects stems: erode never eats them', async () => {
		const grid = { pitch: 60, ox: 0, oy: 0 };
		const result = await run('pixel-life', PIXEL_H, {
			grid,
			chaos: 100,
			breakRules: true,
			params: { rule: 'erode', generations: 6, protectStems: true },
		});
		expect(result.ok).toBe(true);
		const cells = cellsOf(result.contours, grid, 0);
		// The left stem (two columns, full height) is still there.
		const leftColumn = Array.from({ length: cells.rows }, (_, r) => cells.cells[r * cells.cols]);
		expect(leftColumn.every(Boolean)).toBe(true);
	});

	it('traces diagonal neighbours as separate contours and holes the other way', () => {
		const diagonal = pixelGlyph(['.#', '#.']);
		expect(diagonal).toHaveLength(2);
		const ring = PIXEL_O;
		const areas = ring.map((c) => signedArea(flattenContour(c)));
		expect(areas.some((a) => a < 0)).toBe(true);
		expect(areas.some((a) => a > 0)).toBe(true);
		const traced = traceCells({ cols: 1, rows: 1, i0: 2, j0: 3, cells: new Uint8Array([1]) }, GRID);
		expect(traced[0].points.map((p) => [p.x, p.y])).toEqual([
			[120, 240],
			[180, 240],
			[180, 180],
			[120, 180],
		]);
	});
});

describe('grid snap cleanup', () => {
	it('splits an outline that folds back onto a node into simple loops', () => {
		const p = (x, y) => ({ x, y, h1: null, h2: null });
		// A lobe pinched at (0, 10), and a spike out to (20, 0) and back that has no area.
		const loops = splitAtRepeats([
			p(0, 0),
			p(0, 10),
			p(10, 10),
			p(10, 20),
			p(0, 10),
			p(-10, 10),
			p(-10, 0),
			p(20, 0),
			p(-10, 0),
		]);
		expect(loops.map((loop) => loop.length).sort()).toEqual([3, 4]);
	});
});
