import { latinKernelAll } from '../../project_editor/charset_latin_kernel.js';

/**
 * "To review" (issue #135): which glyphs need the owner, and the grid filter
 * that shows only those.
 *
 * A glyph needs review while it is an agent Draft: the agent drew it and the
 * owner has not kept or reverted it yet. This is the same count as the agent
 * pill's "Needs you · N to review" (agent-panel.js reviewCount), so the two
 * never disagree. Failed glyphs keep their red mark and Retry button on the
 * tile but are not "to review": there is nothing to look at yet. Kept and
 * Yours are finished, Empty is not started, and Queued / Drafting are still
 * in the agent's hands.
 *
 * The filter is view state only. It lives in memory, one flag per
 * ProjectEditor (a WeakMap, so a new or reopened project starts unfiltered),
 * and never reaches the project file or localStorage. The top bar's
 * "N to review" pill sets it; the <glyph-grid> reads it and listens for
 * changes, so the filter survives focus mode closing and the grid being
 * rebuilt on navigate().
 */

/** Statuses that need the owner. */
export const REVIEW_STATUSES = Object.freeze(['draft']);

/** Event fired on `reviewFilterEvents` when the filter flips: detail { editor, on }. */
export const REVIEW_FILTER_EVENT = 'review-filter-change';

/** Module-level event target, so the top bar and the grid never import each other. */
export const reviewFilterEvents = new EventTarget();

/** @type {WeakMap<Object, Boolean>} */
const filterByEditor = new WeakMap();

/**
 * @param {String} status
 * @returns {Boolean} whether a glyph with this status needs the owner
 */
export function needsReview(status) {
	return REVIEW_STATUSES.includes(status);
}

/**
 * IDs that need review, in the order given.
 * @param {Object} editor - ProjectEditor (reads editor.glyphStatus)
 * @param {Array<String>=} ids - candidates; defaults to the whole character set (116)
 * @returns {Array<String>}
 */
export function reviewIDs(editor, ids = latinKernelAll().map((entry) => entry.glyphID)) {
	const store = editor?.glyphStatus;
	if (!store) return [];
	return ids.filter((id) => needsReview(store.getStatus(id)));
}

/**
 * @param {Object} editor - ProjectEditor
 * @returns {Boolean} whether the grid shows only glyphs to review
 */
export function isReviewFilterOn(editor) {
	return !!editor && filterByEditor.get(editor) === true;
}

/**
 * Turns the review filter on or off for an editor. Fires REVIEW_FILTER_EVENT
 * only when the value changes.
 * @param {Object} editor - ProjectEditor
 * @param {Boolean} on
 * @returns {Boolean} whether anything changed
 */
export function setReviewFilter(editor, on) {
	if (!editor) return false;
	const next = !!on;
	if (isReviewFilterOn(editor) === next) return false;
	if (next) filterByEditor.set(editor, true);
	else filterByEditor.delete(editor);
	reviewFilterEvents.dispatchEvent(
		new CustomEvent(REVIEW_FILTER_EVENT, { detail: { editor, on: next } })
	);
	return true;
}

/**
 * @param {Function} callback - receives the CustomEvent
 * @returns {Function} unsubscribe
 */
export function onReviewFilterChange(callback) {
	reviewFilterEvents.addEventListener(REVIEW_FILTER_EVENT, callback);
	return () => reviewFilterEvents.removeEventListener(REVIEW_FILTER_EVENT, callback);
}
