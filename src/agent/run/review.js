// --------------------------------------------------------------
// Review actions (M7 #29): Keep, Keep all, Revert, Revert run
// --------------------------------------------------------------
/*
	Every action here is a user action from the panel, a tile or the
	inspector, and each one is exactly ONE history entry (commitReview in
	native-tools.js), so Cmd+Z takes it back as a whole.

	- Keep / Keep all: Draft → Kept. Only Drafts count: Failed, Yours, Kept
	  and empty glyphs are left alone, and the label count is the same list.
	- Revert: a forward commit to the pre-draft outline stored on the status
	  record when the agent first drew the glyph (glyph-status.js preDraft).
	  Not history time travel: later glyphs are untouched.
	- Revert run: every glyph the run drew goes back to its "Before run"
	  state, except glyphs that are Yours or were edited after the run drew
	  them.
*/
import { isPreDraft } from '../../project_editor/glyph-status.js';
import { commitReview } from '../native-tools.js';

/**
 * 'glyph-0x61' → 'a'
 * @param {String} id
 * @returns {String}
 */
export function charOf(id) {
	const match = /^glyph-0x([0-9a-f]+)$/i.exec(id || '');
	if (!match) return id || '';
	try {
		return String.fromCodePoint(parseInt(match[1], 16));
	} catch {
		return id;
	}
}

/**
 * The IDs, in order, that are Drafts right now (what Keep all keeps).
 * @param {Object} editor
 * @param {Array<String>} ids
 * @returns {Array<String>}
 */
export function draftsAmong(editor, ids = []) {
	const store = editor?.glyphStatus;
	if (!store) return [];
	return [...new Set(ids)].filter((id) => store.getStatus(id) === 'draft');
}

/**
 * History title for a set of glyphs: 'Keep · a' or 'Keep · 22 glyphs'.
 * @param {String} verb
 * @param {Array<String>} ids
 */
function titleFor(verb, ids) {
	return ids.length === 1 ? `${verb} · ${charOf(ids[0])}` : `${verb} · ${ids.length} glyphs`;
}

/**
 * Keep (one glyph) or Keep all (a group): Drafts become Kept in one entry.
 * @param {Object} editor
 * @param {Array<String>} ids - candidates; non-Drafts are skipped
 * @returns {{ok: Boolean, kept: Array<String>, error?: Object}}
 */
export function keepGlyphs(editor, ids) {
	const kept = draftsAmong(editor, ids);
	if (!kept.length) return { ok: true, kept };
	const result = commitReview(editor, {
		title: titleFor('Keep', kept),
		statuses: kept.map((id) => ({ id, record: { status: 'kept', owner: 'user' } })),
	});
	return result.ok ? { ok: true, kept } : { ok: false, kept: [], error: result.error };
}

/**
 * The pre-draft snapshot on a glyph's status record, or null.
 * @param {Object} editor
 * @param {String} id
 * @returns {{glyph: Object | null} | null}
 */
export function preDraftOf(editor, id) {
	const record = editor?.glyphStatus?.get(id);
	return record?.status === 'draft' && isPreDraft(record.preDraft) ? record.preDraft : null;
}

/** Status a glyph returns to when its outline is put back. */
function settledRecord(glyphData) {
	return glyphData?.shapes?.length
		? { status: 'kept', owner: 'user' }
		: { status: 'empty', owner: 'user', derived: true };
}

/**
 * Revert one Draft: a forward commit back to the pre-draft outline.
 * @param {Object} editor
 * @param {String} id
 * @returns {{ok: Boolean, error?: Object}}
 */
export function revertGlyph(editor, id) {
	const preDraft = preDraftOf(editor, id);
	if (!preDraft)
		return {
			ok: false,
			error: { code: 'NO_PRE_DRAFT', message: 'Nothing to revert to for this glyph.' },
		};
	return commitReview(editor, {
		title: `Revert · ${charOf(id)}`,
		glyphs: { [id]: preDraft.glyph },
		statuses: [{ id, record: settledRecord(preDraft.glyph) }],
	});
}

/**
 * Revert run: back to the "Before run" checkpoint for every glyph the run
 * drew, in one entry. Yours glyphs and glyphs edited after the run drew them
 * are kept as they are.
 * @param {Object} editor
 * @param {Object} run
 * @param {Object<String, {submitted: String, preDraft: {glyph: Object | null}}>} run.drawn
 * @param {{statuses: Object<String, Object>}} run.checkpoint
 * @returns {{ok: Boolean, reverted: Array<String>, kept: Array<String>, error?: Object}}
 */
export function revertRun(editor, { drawn = {}, checkpoint = { statuses: {} } } = {}) {
	const store = editor?.glyphStatus;
	const project = editor?.project;
	const reverted = [];
	const kept = [];
	const glyphs = {};
	const statuses = [];
	for (const [id, info] of Object.entries(drawn)) {
		const glyph = project?.glyphs[id];
		const status = store?.getStatus(id);
		const unchanged = !!glyph && JSON.stringify(glyph.save()) === info.submitted;
		if (status === 'yours' || !unchanged || !isPreDraft(info.preDraft)) {
			kept.push(id);
			continue;
		}
		reverted.push(id);
		glyphs[id] = info.preDraft.glyph;
		statuses.push({
			id,
			record: checkpoint.statuses?.[id] || settledRecord(info.preDraft.glyph),
		});
	}
	if (!reverted.length) return { ok: true, reverted, kept };
	const result = commitReview(editor, { title: 'Revert run', glyphs, statuses });
	return result.ok
		? { ok: true, reverted, kept }
		: { ok: false, reverted: [], kept, error: result.error };
}
