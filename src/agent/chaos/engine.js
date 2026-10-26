// --------------------------------------------------------------
// Chaos tools: the op engine (PR C). Pure: no DOM, no editor, no history.
// --------------------------------------------------------------
/*
	An op is { id, label, icon, hint, params: [schema], run(contours, ctx) → contours }.
	runChaos runs one op on one glyph's contours with a seed and a chaos level, then the
	legibility guard (guard.js). A rejected result is re-rolled: seed+1, up to 3 times, then the
	same seed at lower chaos. The Chaos tab (preview and Apply) and the agent tool apply_chaos
	both come here, so they always agree.

	paper.js (booleans) loads lazily through path-boolean.js the first time an op needs it.
*/
import { booleanPointContours } from '../path-boolean.js';
import { boundsOf, cleanContours, orientByDepth, pointCount } from './geometry.js';
import { guardResult } from './guard.js';
import { detectCellGrid } from './pixel-grid.js';
import { MAX_SEED, rngFor } from './rng.js';
import glitchBands from './ops/glitch-bands.js';
import gridSnap from './ops/grid-snap.js';
import pixelLife from './ops/pixel-life.js';
import slashCut from './ops/slash-cut.js';
import warp from './ops/warp.js';

export { detectCellGrid };

/** The ops, in the order the Chaos tab lists them. */
export const CHAOS_OPS = Object.freeze([slashCut, glitchBands, warp, gridSnap, pixelLife]);
export const CHAOS_OP_IDS = Object.freeze(CHAOS_OPS.map((op) => op.id));

/** Same limits as a glyph job (assertGeometry in native-tools.js). */
export const MAX_PATHS = 128;
export const MAX_POINTS = 4096;
export const REROLLS = 3;
const CHAOS_STEPS_DOWN = [0.6, 0.3];

export function getChaosOp(id) {
	return CHAOS_OPS.find((op) => op.id === id) || null;
}

/** Defaults for an op's params. */
export function defaultParams(op) {
	return Object.fromEntries(op.params.map((param) => [param.key, param.default]));
}

/**
 * The op's params from loose input: unknown keys dropped, absent or null = default, numbers
 * clamped to the range, enums checked.
 */
export function resolveParams(op, input = {}) {
	const result = {};
	for (const param of op.params) {
		const value = input?.[param.key];
		if (value === undefined || value === null) result[param.key] = param.default;
		else if (param.type === 'int' || param.type === 'number') {
			const number = Number(value);
			const clamped = Number.isFinite(number)
				? Math.min(param.max, Math.max(param.min, number))
				: param.default;
			result[param.key] = param.type === 'int' ? Math.round(clamped) : clamped;
		} else if (param.type === 'enum')
			result[param.key] = param.options.some((option) => option.value === value)
				? value
				: param.default;
		else if (param.type === 'boolean') result[param.key] = value === true;
	}
	return result;
}

export function normalizeSeed(seed) {
	const number = Math.floor(Number(seed));
	if (!Number.isFinite(number)) return 1;
	return ((number % MAX_SEED) + MAX_SEED) % MAX_SEED;
}

const clampChaos = (value) => {
	const number = Number(value);
	return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 50;
};

/** Why an op cannot run on this glyph (a note for the UI), or null. */
export function unavailableNote(op, { grid } = {}) {
	return op.unavailable ? op.unavailable({ grid }) : null;
}

const booleanFor = async (operation, subject, clip = []) =>
	booleanPointContours({ operation, subject, clip });

/** One attempt: the op's raw output, oriented and cleaned. */
async function attempt(op, contours, { seed, chaos, params, glyphId, metrics, grid, box }) {
	const ctx = {
		rng: rngFor(seed, glyphId, op.id),
		chaos: chaos / 100,
		params,
		box,
		metrics,
		grid,
		boolean: booleanFor,
	};
	const raw = await op.run(contours, ctx);
	return orientByDepth(cleanContours(raw, { minArea: Math.max(4, (metrics.upm * 0.004) ** 2) }));
}

/**
 * Runs one op on one glyph, guarded.
 * @param {Object} options
 * @param {String} options.op - op id
 * @param {Array<Object>} options.contours - the glyph's contours (agent point format)
 * @param {String} options.glyphId - part of the seed: each glyph gets its own result
 * @param {Number} options.seed
 * @param {Number} [options.chaos] - 0–100
 * @param {Object} [options.params]
 * @param {Object} options.metrics - fontMetrics()
 * @param {Object | null} [options.grid] - detectCellGrid() for ops that need it
 * @param {Boolean} [options.breakRules] - turns the legibility rules off (never the gate)
 * @returns {Promise<{ok: true, contours: Array<Object>, seed: Number, chaos: Number,
 *   params: Object, attempts: Number, rerolled: Boolean, rejected: Array<Object>} |
 *   {ok: false, error: {code: String, message: String}, attempts: Number, rejected: Array<Object>}>}
 */
export async function runChaos({
	op: opId,
	contours,
	glyphId,
	seed,
	chaos = 50,
	params,
	metrics,
	grid = null,
	breakRules = false,
}) {
	const op = getChaosOp(opId);
	if (!op) return failure('UNKNOWN_OP', `Unknown chaos tool: ${opId}.`);
	if (!contours?.length) return failure('EMPTY_GLYPH', 'This glyph has no outlines to work on.');
	const note = unavailableNote(op, { grid });
	if (note) return failure('NOT_PIXEL_FONT', note);
	const box = boundsOf(contours);
	const resolved = resolveParams(op, params);
	const startSeed = normalizeSeed(seed);
	const startChaos = clampChaos(chaos);
	// seed, seed+1 … seed+3 at the asked chaos; then the asked seed at lower chaos.
	const plan = [
		...Array.from({ length: REROLLS + 1 }, (_, index) => ({
			seed: normalizeSeed(startSeed + index),
			chaos: startChaos,
		})),
		...CHAOS_STEPS_DOWN.map((factor) => ({
			seed: startSeed,
			chaos: Math.round(startChaos * factor),
		})),
	];
	const rejected = [];
	for (const [index, step] of plan.entries()) {
		let result;
		try {
			result = await attempt(op, contours, {
				...step,
				params: resolved,
				glyphId,
				metrics,
				grid,
				box,
			});
		} catch (error) {
			if (error?.code === 'NOT_PIXEL_FONT') return failure(error.code, error.message, index + 1);
			rejected.push({
				...step,
				reasons: [{ code: 'OP_FAILED', message: 'The op could not run.' }],
			});
			continue;
		}
		const limits =
			result.length > MAX_PATHS || pointCount(result) > MAX_POINTS
				? [{ code: 'TOO_COMPLEX', message: 'The result has too many points.' }]
				: [];
		const guard = limits.length
			? { ok: false, reasons: limits }
			: guardResult(contours, result, {
					metrics,
					legibility: !breakRules,
					limits: op.guard,
			  });
		if (guard.ok)
			return {
				ok: true,
				contours: result,
				seed: step.seed,
				chaos: step.chaos,
				params: resolved,
				attempts: index + 1,
				rerolled: index > 0,
				rejected,
			};
		rejected.push({ ...step, reasons: guard.reasons });
	}
	const last = rejected.at(-1)?.reasons?.[0];
	return {
		...failure(
			'GUARD_REJECTED',
			`No take passed the legibility guard${
				last ? `: ${last.message}` : '.'
			} Try a lower chaos or other settings.`,
			plan.length
		),
		rejected,
	};
}

function failure(code, message, attempts = 0) {
	return { ok: false, error: { code, message }, attempts, rejected: [] };
}
