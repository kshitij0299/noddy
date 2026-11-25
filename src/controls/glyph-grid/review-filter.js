import { glyphIDToCodePoint, latinKernelAll } from '../../project_editor/charset_latin_kernel.js';

/**
 * "To review" (issue #135): which glyphs need the owner, and the grid filter
 * that shows only those.
 *
 * A glyph needs review while it is an agent Draft: the agent drew it and the
 * owner has not kept or reverted it yet. reviewIDs() / reviewCount() are the
 * one count: the top bar's "N to review" pill, the agent pill's
 * "Needs you · N to review" and the filtered grid all read it, so they agree.
 * It covers every draft in the project, including glyphs outside the 116
 * set, so "N to review" always shows exactly N tiles. Failed glyphs keep their
 * red mark and Retry button on the tile but are not "to review": there is
 * nothing to look at yet. Kept and Yours are finished, Empty is not started,
 * and Queued / Drafting are still in the agent's hands.
 *
 * The filter is view state only. It lives in memory, one flag per
 * ProjectEditor (a WeakMap), and never reaches the project file or
 * localStorage. Opening or importing a project reuses the same editor, so
 * those paths clear the flag (openStartProject, importProjectDataAndNavigate);
 * a whole-project undo swaps the project object too and keeps it. The top
 * bar's "N to review" pill sets it; the <glyph-grid> reads it and listens for
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
 * Every glyph that needs review in the project, in grid order: the 116 set
 * first (in set order), then the rest by code point.
 * @param {Object} editor - ProjectEditor (reads editor.glyphStatus)
 * @returns {Array<String>} item IDs
 */
export function reviewIDs(editor) {
	const store = editor?.glyphStatus;
	if (!store) return [];
	let drafts;
	try {
		drafts = REVIEW_STATUSES.flatMap((status) => store.listByStatus(status));
	} catch {
		return [];
	}
	const order = kernelOrder();
	const rank = (id) => (order.has(id) ? order.get(id) : Infinity);
	const point = (id) => {
		const value = glyphIDToCodePoint(id);
		return value === false ? Infinity : value;
	};
	return [...new Set(drafts)].sort(
		(a, b) => rank(a) - rank(b) || point(a) - point(b) || (a < b ? -1 : a > b ? 1 : 0)
	);
}

/**
 * How many glyphs need review. The one count every "N to review" shows.
 * @param {Object} editor - ProjectEditor
 * @returns {Number}
 */
export function reviewCount(editor) {
	return reviewIDs(editor).length;
}

/**
 * Grid entries for every glyph to review (reviewIDs order). Glyphs in the 116
 * set get their set entry; the rest get one built from the ID, so the tile
 * can label them.
 * @param {Object} editor - ProjectEditor
 * @returns {Array<{glyphID: String, char: String, codePoint: Number, hex: String}>}
 */
export function reviewEntries(editor) {
	const byID = kernelEntries();
	return reviewIDs(editor).map((id) => {
		const known = byID.get(id);
		if (known) return known;
		const codePoint = glyphIDToCodePoint(id);
		if (codePoint === false) return { glyphID: id, char: '', codePoint: 0, hex: id };
		return {
			glyphID: id,
			char: String.fromCodePoint(codePoint),
			codePoint,
			hex: id.substring('glyph-'.length),
		};
	});
}

/** @type {Map<String, Object> | null} */
let kernelByID = null;
function kernelEntries() {
	if (!kernelByID) kernelByID = new Map(latinKernelAll().map((entry) => [entry.glyphID, entry]));
	return kernelByID;
}

/** @type {Map<String, Number> | null} */
let kernelRank = null;
function kernelOrder() {
	if (!kernelRank)
		kernelRank = new Map(latinKernelAll().map((entry, index) => [entry.glyphID, index]));
	return kernelRank;
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
