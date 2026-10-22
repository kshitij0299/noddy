import { keepGlyphs, revertGlyph } from '../agent/run/review.js';
import { makeElement } from '../common/dom.js';
import { STATUS_LABELS, makeStatusMark } from '../controls/glyph-grid/status-mark.js';
import { isPreDraft } from '../project_editor/glyph-status.js';
import { makeSingleInput } from '../panels/cards.js';
import { charForGlyphID } from './focus_context_strip.js';
import { guardControlKeys } from './focus_tool_pill.js';

// --------------------------------------------------------------
// Focus mode: inspector card (issue #17, flow-06)
// --------------------------------------------------------------
/*
	Top-right card: glyph + U+ code + status chip; Advance / Left / Right as
	the EXISTING numeric inputs (`makeSingleInput` → <input-number>), so each
	committed edit is one undo step (the M1 fix in panels/cards.js);
	Keep / Revert only while the glyph is a Draft.

	Keep and Revert are one history entry each (src/agent/run/review.js).
	Revert is a forward commit to the pre-draft outline the agent job stored
	on the status record (glyph-status.js `preDraft`). A Draft without one
	(set by hand in a test or an old session) shows Revert disabled with a
	tooltip that says why.
*/

export const REVERT_UNAVAILABLE_TOOLTIP =
	'Nothing to revert to: no pre-draft outline was saved for this glyph';

/**
 * 'glyph-0x61' → 'U+0061'
 * @param {String} id
 * @returns {String}
 */
export function codePointLabel(id) {
	const match = /^glyph-0x([0-9a-f]+)$/i.exec(id || '');
	if (!match) return '';
	return `U+${match[1].toUpperCase().padStart(4, '0')}`;
}

/**
 * The pre-draft snapshot on a status record, if any.
 * @param {Object} record - from editor.glyphStatus.get(id)
 * @returns {{glyph: Object | null} | null}
 */
export function preDraftSnapshot(record) {
	return isPreDraft(record?.preDraft) ? record.preDraft : null;
}

/**
 * Keep: the user accepts the draft (one history entry).
 * @param {Object} editor - ProjectEditor
 * @param {String} id
 * @returns {Boolean} whether the status changed
 */
export function keepDraft(editor, id) {
	return keepGlyphs(editor, [id]).kept.length === 1;
}

/**
 * Revert: a forward commit (one new history entry) that puts the pre-draft
 * outline back. Not history time travel.
 * @param {Object} editor - ProjectEditor
 * @param {String} id
 * @returns {Boolean} whether anything was reverted
 */
export function revertDraft(editor, id) {
	if (editor.glyphStatus?.getStatus(id) !== 'draft') return false;
	return revertGlyph(editor, id).ok;
}

/**
 * Builds the inspector. Call `render(id)` after a glyph switch or a project
 * swap; `refreshStatus()` after a status change.
 * @param {Object} editor - ProjectEditor
 * @returns {HTMLElement & {render: Function, refreshStatus: Function, isStale: Function}}
 */
export function makeInspector(editor) {
	const card = /** @type {HTMLElement & {render: Function, refreshStatus: Function, isStale: Function}} */ (
		makeElement({
			tag: 'section',
			className: 'focus-inspector',
			attributes: { 'aria-label': 'Glyph inspector' },
		})
	);

	card.addEventListener('keydown', guardControlKeys);
	card.addEventListener('keyup', guardControlKeys);

	let currentID = '';
	let renderedGlyph = null;

	const head = makeElement({ tag: 'div', className: 'focus-inspector__head' });
	const glyphEl = makeElement({ tag: 'span', className: 'focus-inspector__glyph text-title' });
	const codeEl = makeElement({ tag: 'span', className: 'focus-inspector__code text-mono-small' });
	const chip = makeElement({ tag: 'span', className: 'focus-inspector__chip text-label' });
	head.append(glyphEl, codeEl, chip);

	const fields = makeElement({ tag: 'div', className: 'focus-inspector__fields' });

	const actions = makeElement({ tag: 'div', className: 'focus-inspector__actions' });
	const keepButton = makeElement({
		tag: 'button',
		className: 'focus-inspector__keep text-label',
		attributes: { type: 'button' },
		innerHTML: '<span class="material-symbols-rounded" aria-hidden="true">check</span>Keep',
	});
	const revertButton = makeElement({
		tag: 'button',
		className: 'focus-inspector__revert text-label',
		attributes: { type: 'button' },
		innerHTML: '<span class="material-symbols-rounded" aria-hidden="true">undo</span>Revert',
	});
	keepButton.addEventListener('click', () => {
		// Keep hides the button; tell the host so focus lands on a stable control.
		if (keepDraft(editor, currentID)) card.dispatchEvent(new CustomEvent('focus-mode:kept'));
	});
	revertButton.addEventListener('click', () => {
		if (revertButton.getAttribute('aria-disabled') === 'true') return;
		revertDraft(editor, currentID);
	});
	actions.append(keepButton, revertButton);

	card.append(head, fields, actions);

	function makeField(label, property, glyph) {
		const wrap = makeElement({ tag: 'label', className: 'focus-inspector__field' });
		wrap.appendChild(makeElement({ tag: 'span', className: 'text-label', content: label }));
		const input = makeSingleInput(glyph, property, 'currentItem', 'input-number');
		input.setAttribute('aria-label', label);
		// Figma flow-06: plain mono fields, no stepper arrows. Arrow keys still step.
		input.setAttribute('hide-arrows', '');
		wrap.appendChild(input);
		return wrap;
	}

	card.refreshStatus = () => {
		const store = editor.glyphStatus;
		const record = store ? store.get(currentID) : { status: 'empty' };
		const status = record.status;
		chip.setAttribute('data-status', status);
		chip.replaceChildren(makeStatusMark(status), document.createTextNode(STATUS_LABELS[status]));
		const isDraft = status === 'draft';
		actions.hidden = !isDraft;
		const canRevert = !!preDraftSnapshot(record);
		revertButton.setAttribute('aria-disabled', canRevert ? 'false' : 'true');
		if (canRevert) revertButton.removeAttribute('title');
		else revertButton.title = REVERT_UNAVAILABLE_TOOLTIP;
	};

	card.render = (id) => {
		currentID = id;
		const glyph = editor.project.getItem(id);
		const char = charForGlyphID(id);
		glyphEl.textContent = char;
		codeEl.textContent = codePointLabel(id);
		if (glyph) {
			fields.replaceChildren(
				makeField('Advance', 'advanceWidth', glyph),
				makeField('Left', 'leftSideBearing', glyph),
				makeField('Right', 'rightSideBearing', glyph)
			);
		} else {
			fields.replaceChildren();
		}
		renderedGlyph = glyph;
		card.refreshStatus();
	};

	/** True when the fields hold a glyph object the project no longer has (whole-project undo). */
	card.isStale = () => editor.project.getItem(currentID) !== renderedGlyph;

	return card;
}
