// --------------------------------------------------------------
// Chaos tab: preview and Apply (PR C). No DOM.
// --------------------------------------------------------------
/*
	Preview runs the engine directly on the font's glyphs (nothing is written). Apply goes
	through the agent's own tools in one native session: apply_chaos opens each glyph's job and
	sets its draft, submit_glyph lands it as a Draft with one undo step ("Chaos · A") per glyph.
	So the Chaos tab, the built-in agent and Claude Code over MCP share the engine, the gate and
	the history path.

	Consent (owner decision 2026-10-26): Apply is the user's own action, like a filter. For This
	glyph and Selected glyphs the session gets a UI-minted grant per glyph covering the open glyph
	and Yours glyphs. For the Whole set the grant covers the open glyph only, so Yours
	(hand-drawn) glyphs are skipped. The agent tool apply_chaos gets no grants: its locks stay.
*/
import { Glyph } from '../../../project_data/glyph.js';
import { isPreDraft } from '../../../project_editor/glyph-status.js';
import { getChaosOp, runChaos } from '../../chaos/engine.js';
import { toShapeData } from '../../chaos/geometry.js';
import { glyphContours, projectCellGrid } from '../../chaos/project-bridge.js';
import { createNativeToolSession } from '../../native-tools.js';
import { grantConsent } from '../../ownership.js';
import { fontMetrics } from '../../render.js';

/** Glyphs in the preview strip at most (Apply still covers the whole target). */
export const PREVIEW_LIMIT = 8;

/**
 * What a glyph starts from: the outline before its Draft when the Chaos tab drew that Draft
 * (so a second Apply re-rolls instead of stacking), else the glyph as it is.
 * @param {Object} editor
 * @param {String} id
 * @param {Set<String>} chaosDrafts - glyphs the Chaos tab drafted
 * @returns {'current' | 'before-draft'}
 */
export function baseFor(editor, id, chaosDrafts) {
	const record = editor?.glyphStatus?.get?.(id);
	return chaosDrafts.has(id) && record?.status === 'draft' && isPreDraft(record.preDraft)
		? 'before-draft'
		: 'current';
}

function baseGlyph(editor, id, base) {
	if (base === 'before-draft') {
		const glyph = editor.glyphStatus.get(id).preDraft.glyph;
		return glyph ? new Glyph(JSON.parse(JSON.stringify(glyph))) : null;
	}
	return editor.project.glyphs[id] || null;
}

/** Why the op cannot run on this font (Pixel Life on a drawn font), or null. */
export function fontNote(editor, opId, ids = []) {
	const op = getChaosOp(opId);
	if (!op?.unavailable || !editor?.project) return null;
	return op.unavailable({ grid: projectCellGrid(editor.project, ids) });
}

/**
 * Runs the op on each glyph for the preview strip. Yields between glyphs so typing and
 * sliding stay smooth; a newer preview cancels an older one through `isStale`.
 * @returns {Promise<Array<{id: String, glyph: Object | null, result: Object | null}> | null>}
 *   null when cancelled
 */
export async function previewChaos(
	editor,
	{
		op,
		ids,
		seed,
		chaos,
		params,
		breakRules,
		chaosDrafts = new Set(),
		isStale = () => false,
		onGlyph,
	}
) {
	const project = editor.project;
	const metrics = fontMetrics(project);
	const grid = getChaosOp(op)?.needsGrid ? projectCellGrid(project, ids) : null;
	const items = [];
	for (const id of ids.slice(0, PREVIEW_LIMIT)) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (isStale()) return null;
		const source = baseGlyph(editor, id, baseFor(editor, id, chaosDrafts));
		let item;
		if (!source?.shapes?.length) item = { id, glyph: null, result: null };
		else {
			let result;
			try {
				result = await runChaos({
					op,
					contours: glyphContours(source),
					glyphId: id,
					seed,
					chaos,
					params,
					metrics,
					grid,
					breakRules,
				});
			} catch (error) {
				result = {
					ok: false,
					error: { code: error.code || 'CHAOS_FAILED', message: error.message },
				};
			}
			const glyph = result.ok
				? new Glyph({
						id,
						advanceWidth: source.advanceWidth,
						shapes: toShapeData(result.contours, op),
				  })
				: source;
			item = { id, glyph, result };
		}
		if (isStale()) return null;
		items.push(item);
		onGlyph?.(item, items.length - 1);
	}
	return items;
}

/**
 * Apply: each glyph lands as a Draft, one undo step per glyph.
 * @param {() => Object} getEditor
 * @param {Object} options
 * @param {String} options.op
 * @param {Array<String>} options.ids
 * @param {'glyph' | 'selected' | 'set'} options.scope
 * @param {Number} options.seed
 * @param {Number} options.chaos
 * @param {Object} options.params
 * @param {Boolean} [options.breakRules]
 * @param {Set<String>} [options.chaosDrafts] - updated with the glyphs that landed
 * @param {AbortSignal} [options.signal]
 * @param {(done: Number, total: Number) => void} [options.onProgress]
 * @returns {Promise<Array<{id: String, ok: Boolean, seed?: Number, chaos?: Number,
 *   rerolled?: Boolean, skipped?: Boolean, error?: Object}>>}
 */
export async function applyChaos(
	getEditor,
	{
		op,
		ids,
		scope,
		seed,
		chaos,
		params,
		breakRules = false,
		chaosDrafts = new Set(),
		signal,
		onProgress,
	}
) {
	const editor = getEditor();
	const explicit = scope !== 'set';
	const grants = new Map(
		ids.map((id) => [id, grantConsent(editor, id, { open: true, yours: explicit })])
	);
	const session = createNativeToolSession({
		getEditor,
		grantOpen: false,
		consentFor: (id) => grants.get(id),
		historyLabel: 'Chaos',
		callLimit: ids.length * 3 + 8,
		renderLimit: 0,
	});
	const results = [];
	try {
		for (const [index, id] of ids.entries()) {
			if (signal?.aborted) break;
			const glyph = editor.project.glyphs[id];
			if (!glyph?.shapes?.length) {
				results.push({
					id,
					ok: false,
					skipped: true,
					error: { code: 'EMPTY_GLYPH', message: 'Nothing drawn yet' },
				});
				onProgress?.(index + 1, ids.length);
				continue;
			}
			const base = baseFor(editor, id, chaosDrafts);
			const applied = await session.execute('apply_chaos', {
				glyphIds: [id],
				expectedRevision: session.getContext().revision,
				op,
				seed,
				chaos,
				params,
				breakRules,
				base,
			});
			const outcome = applied.ok ? applied.results[0] : null;
			if (!outcome?.ok) {
				const error = outcome?.error ||
					applied.error || { code: 'CHAOS_FAILED', message: 'Failed' };
				const skipped = ['LOCKED_YOURS', 'LOCKED_OPEN', 'EMPTY_GLYPH', 'DEPENDENT_GLYPHS'].includes(
					error.code
				);
				results.push({ id, ok: false, skipped, error });
			} else {
				const submitted = session.execute('submit_glyph', {
					glyphId: id,
					expectedRevision: session.getContext().revision,
					note: `${op}, seed ${outcome.seed}, chaos ${outcome.chaos}`,
				});
				if (submitted.ok) {
					chaosDrafts.add(id);
					results.push({
						id,
						ok: true,
						changed: submitted.changed !== false,
						seed: outcome.seed,
						chaos: outcome.chaos,
						rerolled: outcome.rerolled,
					});
				} else results.push({ id, ok: false, error: submitted.error });
			}
			onProgress?.(index + 1, ids.length);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	} finally {
		session.dispose();
	}
	return results;
}
