// --------------------------------------------------------------
// Remix mode: the run (PR D). Memory only, per editor; never in the project file.
// --------------------------------------------------------------
/*
	What a Remix run remembers so the agent's next glyph can differ from the last ones:
	- order: glyphs in the order they first drew cards (tabu looks at the 3 before a glyph);
	- draws: the cards each glyph was dealt last, with the seed;
	- takes: what each glyph landed with (seed, cards, kept moves, the regret, its change mask
	  for novelty pressure), which is also what the receipt shows as the glyph's seed;
	- mark: the reference mark (describe_mark), which seeds slashes, gashes and kicks.
	New chat clears it (resetRemixRun); so does switching to Exact.
*/
import { TABU_GLYPHS } from './deck.js';

/** @type {WeakMap<Object, Object>} */
const runs = new WeakMap();

function fresh() {
	return { order: [], draws: new Map(), takes: new Map(), mark: null };
}

/** The editor's run, created on first use. */
export function remixRun(editor) {
	if (!editor || typeof editor !== 'object') return fresh();
	if (!runs.has(editor)) runs.set(editor, fresh());
	return runs.get(editor);
}

export function resetRemixRun(editor) {
	if (editor && typeof editor === 'object') runs.delete(editor);
}

/** Card ids dealt to the glyphs right before this one in the run (oldest first). */
export function tabuFor(run, glyphId) {
	const at = run.order.indexOf(glyphId);
	const end = at < 0 ? run.order.length : at;
	return run.order
		.slice(Math.max(0, end - TABU_GLYPHS), end)
		.map((id) => (run.draws.get(id)?.cards || []).map((card) => card.id));
}

/** The take of the closest glyph before this one that landed one (Telephone's source). */
export function previousTake(run, glyphId) {
	const at = run.order.indexOf(glyphId);
	const before = run.order.slice(0, at < 0 ? run.order.length : at).reverse();
	for (const id of before) {
		const take = run.takes.get(id);
		if (take) return { glyphId: id, ...take };
	}
	return null;
}

export function recordDraw(run, glyphId, draw) {
	if (!run.order.includes(glyphId)) run.order.push(glyphId);
	run.draws.set(glyphId, draw);
}

export function recordTake(run, glyphId, take) {
	if (!run.order.includes(glyphId)) run.order.push(glyphId);
	run.takes.set(glyphId, take);
}

/** Other glyphs' takes, for novelty pressure. */
export function siblingTakes(run, glyphId) {
	return [...run.takes.entries()]
		.filter(([id]) => id !== glyphId)
		.map(([id, take]) => ({ glyphId: id, mask: take.mask }));
}

/** The seed a glyph's Remix take landed with, or null. */
export function remixSeedFor(editor, glyphId) {
	const take = runs.get(editor)?.takes.get(glyphId);
	return take ? take.seed : null;
}
