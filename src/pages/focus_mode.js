import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { sXcX, sYcY } from '../edit_canvas/edit_canvas.js';
import { removeStopCreatingNewPathButton } from '../edit_canvas/tools/new_path.js';
import { selectTool } from '../edit_canvas/tools/tools.js';
import { Glyph } from '../project_data/glyph.js';
import {
	latinKernelAll,
	latinKernelLettersAndFigures,
} from '../project_editor/charset_latin_kernel.js';
import { GLYPH_STATUS_TOPIC } from '../project_editor/glyph-status.js';
import { ITEM_CHANGED_TOPIC, createDebouncedRedraw } from '../project_editor/item_changed.js';
import { charForGlyphID, makeContextStrip } from './focus_context_strip.js';
import { makeInspector } from './focus_inspector.js';
import { makeToolPill } from './focus_tool_pill.js';
import './focus-mode.css';

// --------------------------------------------------------------
// Focus mode (issues #16, #17, #18; Figma flow-06)
// --------------------------------------------------------------
/*
	A calm editor for one glyph over the workspace's left column. It hosts
	the EXISTING <edit-canvas> unchanged inside `.editor-page__edit-canvas-wrapper`
	(so auto-fit measures it), plus a header (close · prev/next · name), Mono
	metric labels over the canvas guides, a floating tool pill, an inspector
	card and a context strip.

	Page semantics: focus mode IS the 'Characters' page (`editor.nav.page`),
	rendered differently while `editor.nav.focus` is set. Every existing
	page check (selectedItem, canvas shortcuts, history navigation, agent
	tools) therefore behaves exactly as on the Characters page, with no
	change to protected code.

	Yours (#18): opening a glyph takes an outline baseline. When the glyph is
	left (close, prev/next, any switch), a changed outline marks it Yours
	(owner user). Spacing-only edits (advance, side bearings, moving the
	whole outline sideways) do not count.

	Esc only closes focus mode. It never touches an agent run.
*/

export const FOCUS_SUBSCRIBER = 'focusMode';

/**
 * @typedef {Object} FocusState
 * @property {String} originID - the glyph whose tile / letter opened focus mode
 * @property {String} origin - 'grid' | 'specimen'
 * @property {String} view - grid view at open ('default' | 'all')
 * @property {Array<String>} order - glyph IDs prev/next walks through
 * @property {{id: String, outline: String} | null} baseline - outline at open
 */

/** Open dialogs and menus that get Esc before focus mode does. */
const OPEN_OVERLAYS = '#modal-dialog, nav, option-chooser[deployed], .export-menu';

/** Document-level listeners for the mounted focus page. */
let mounted = null;

// --------------------------------------------------------------
// Outline baseline and Yours
// --------------------------------------------------------------

/**
 * A spacing-independent fingerprint of a glyph's outline: the SVG path data
 * of a copy whose outline is moved so its left edge sits at x = 0. Advance
 * width and side bearings therefore never change it.
 * @param {Object | false} glyph - Glyph
 * @returns {String}
 */
export function outlineFingerprint(glyph) {
	if (!glyph || !glyph.shapes?.length) return '';
	const copy = new Glyph(glyph.save());
	copy.parent = glyph.parent;
	copy.setGlyphPosition(0, false, false);
	return copy.makeSVGPathData();
}

/**
 * Takes the open-time baseline for a glyph.
 * @param {Object} editor - ProjectEditor
 * @param {String} id
 * @returns {{id: String, outline: String}}
 */
export function takeBaseline(editor, id) {
	return { id, outline: outlineFingerprint(editor.project.getItem(id)) };
}

/**
 * Compares the glyph with its baseline; a changed outline makes it Yours.
 * @param {Object} editor - ProjectEditor
 * @param {{id: String, outline: String} | null} baseline
 * @returns {Boolean} whether the glyph became Yours
 */
export function settleBaseline(editor, baseline) {
	if (!baseline?.id || !editor.glyphStatus) return false;
	const now = outlineFingerprint(editor.project.getItem(baseline.id));
	if (now === baseline.outline) return false;
	editor.glyphStatus.set(baseline.id, 'yours', 'user');
	return true;
}

// --------------------------------------------------------------
// Open / close / step
// --------------------------------------------------------------

/**
 * The glyph order prev/next walks: the grid view the glyph is in.
 * @param {String} id
 * @param {String=} view
 * @returns {{order: Array<String>, view: String}}
 */
export function defaultOrderFor(id, view) {
	const ids = (entries) => entries.map((entry) => entry.glyphID);
	const lettersAndFigures = ids(latinKernelLettersAndFigures());
	if (view !== 'all' && lettersAndFigures.includes(id)) {
		return { order: lettersAndFigures, view: 'default' };
	}
	return { order: ids(latinKernelAll()), view: 'all' };
}

/**
 * @param {Object=} editor - ProjectEditor
 * @returns {Boolean}
 */
export function isFocusModeOpen(editor = getCurrentProjectEditor()) {
	return !!editor?.nav?.focus;
}

/**
 * Opens a glyph in focus mode.
 * @param {String} id - glyph ID
 * @param {Object=} options
 * @param {Object=} options.editor - ProjectEditor
 * @param {String=} options.origin - 'grid' | 'specimen'
 * @param {Array<String>=} options.order - prev/next order (the grid's visible IDs)
 * @param {String=} options.view - the grid view at open
 */
export function openFocusMode(id, { editor = getCurrentProjectEditor(), origin = 'grid', order, view } = {}) {
	if (!id || !editor) return;
	const fallback = defaultOrderFor(id, view);
	const useOrder = Array.isArray(order) && order.includes(id) ? order : fallback.order;
	/** @type {FocusState} */
	const state = {
		originID: id,
		origin,
		view: view || fallback.view,
		order: useOrder.slice(),
		baseline: null,
	};
	editor.nav.focus = state;
	editor.selectedGlyphID = id;
	editor.nav.page = 'Characters';
	editor.navigate();
}

/**
 * Closes focus mode: settles Yours, goes back to the workspace and returns
 * focus to the tile (or specimen letter) that opened it. Never stops an
 * agent run.
 * @param {Object=} editor - ProjectEditor
 */
export function closeFocusMode(editor = getCurrentProjectEditor()) {
	const state = editor?.nav?.focus;
	if (!state) return;
	settleBaseline(editor, state.baseline);
	teardownFocusMode(editor);
	editor.nav.focus = null;
	removeStopCreatingNewPathButton();
	editor.nav.page = 'Workspace';
	editor.navigate();
	returnFocus(state);
}

/**
 * Moves to the previous (-1) or next (+1) glyph in the focus order.
 * @param {Number} delta
 * @param {Object=} editor - ProjectEditor
 * @returns {Boolean} whether the glyph changed
 */
export function stepFocusGlyph(delta, editor = getCurrentProjectEditor()) {
	const state = editor?.nav?.focus;
	if (!state) return false;
	const index = state.order.indexOf(editor.selectedGlyphID);
	const next = state.order[index + delta];
	if (index < 0 || !next) return false;
	editor.selectedGlyphID = next;
	return true;
}

/**
 * Removes focus-mode subscriptions and document listeners.
 * @param {Object=} editor - ProjectEditor
 */
export function teardownFocusMode(editor = getCurrentProjectEditor()) {
	if (mounted) {
		document.removeEventListener('keydown', mounted.onKeyDown, true);
		window.removeEventListener('resize', mounted.onResize);
		mounted.redraw.cancel();
		mounted = null;
	}
	if (editor?.unsubscribe) editor.unsubscribe({ idToRemove: FOCUS_SUBSCRIBER });
}

/**
 * @param {FocusState} state
 */
function returnFocus(state) {
	const id = state.originID;
	if (state.origin === 'specimen') {
		const letter = /** @type {HTMLElement} */ (
			document.querySelector(`#workspace__specimen .specimen__letter[data-item-id="${id}"]`)
		);
		if (letter) {
			letter.focus();
			return;
		}
	}
	const grid = /** @type {any} */ (document.querySelector('glyph-grid'));
	if (!grid?.select) return;
	if (state.view && grid.view !== state.view && grid.setView) grid.setView(state.view);
	grid.select(id, { focus: true });
}

// --------------------------------------------------------------
// Page
// --------------------------------------------------------------

/**
 * Human name for a glyph, e.g. "Latin small a".
 * @param {Object} editor - ProjectEditor
 * @param {String} id
 * @returns {String}
 */
export function glyphDisplayName(editor, id) {
	let name = '';
	try {
		name = editor.project.getItemName(id, true) || '';
	} catch {
		name = '';
	}
	// "Latin Small Letter A" → "Latin small a"; "Digit Zero" → "Digit zero".
	const words = name.replace(/\bletter\s+/i, '').split(/\s+/).filter(Boolean);
	const isSmall = /^small$/i.test(words[1] || '');
	return words
		.map((word, index) => {
			if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			if (index === words.length - 1 && word.length === 1) {
				return isSmall ? word.toLowerCase() : word.toUpperCase();
			}
			return word.toLowerCase();
		})
		.join(' ');
}

/**
 * Metric labels drawn over the canvas guides (the canvas draws the lines).
 * @param {Object} editor - ProjectEditor
 * @param {HTMLElement} layer
 * @param {String} id
 */
export function renderGuideLabels(editor, layer, id) {
	const font = editor.project.settings.font;
	const glyph = editor.project.getItem(id);
	const view = editor.view;
	const rows = [
		['ascender', font.ascent],
		['cap', font.capHeight],
		['x-height', font.xHeight],
		['baseline', 0],
		['descender', font.descent],
	];
	const nodes = [];
	// Lines that sit within LABEL_GAP px share one label row ("ascender 1400 · cap 1490").
	const LABEL_GAP = 16;
	let lastLabel = null;
	let lastY = -Infinity;
	rows
		.map(([name, value]) => ({ name, value: Math.round(Number(value) || 0) }))
		.map((row) => ({ ...row, y: Math.round(sYcY(row.value, view)) }))
		.sort((a, b) => a.y - b.y)
		.forEach(({ name, value, y }) => {
			const strong = name === 'ascender' || name === 'baseline';
			const line = makeElement({
				tag: 'span',
				className: `focus-guides__line focus-guides__line--h${strong ? ' is-strong' : ''}`,
				attributes: { 'data-guide': name },
			});
			line.style.top = `${y}px`;
			nodes.push(line);
			if (lastLabel && y - lastY < LABEL_GAP) {
				lastLabel.textContent += ` · ${name} ${value}`;
				return;
			}
			const label = makeElement({
				tag: 'span',
				className: 'focus-guides__label focus-guides__label--h text-mono-small',
				content: `${name} ${value}`,
				attributes: { 'data-guide': name },
			});
			label.style.top = `${y}px`;
			nodes.push(label);
			lastLabel = label;
			lastY = y;
		});

	// Side bearings: dashed verticals with 0 and the advance below the descender.
	const advance = Math.round(glyph?.advanceWidth || 0);
	const bottom = Math.round(sYcY(Number(font.descent) || 0, view));
	[
		['lsb', 0],
		['advance', advance],
	].forEach(([name, value]) => {
		const x = `${Math.round(sXcX(Number(value), view))}px`;
		const line = makeElement({
			tag: 'span',
			className: 'focus-guides__line focus-guides__line--v',
			attributes: { 'data-guide': name },
		});
		line.style.left = x;
		const label = makeElement({
			tag: 'span',
			className: 'focus-guides__label focus-guides__label--v text-mono-small',
			content: `${value}`,
			attributes: { 'data-guide': name },
		});
		label.style.left = x;
		label.style.top = `${bottom}px`;
		nodes.push(line, label);
	});
	layer.replaceChildren(...nodes);
}

/**
 * Page > Characters, in focus mode.
 * @param {Object=} editor - ProjectEditor
 * @returns {Element} page content
 */
export function makePage_Focus(editor = getCurrentProjectEditor()) {
	teardownFocusMode(editor);
	/** @type {FocusState} */
	const state = editor.nav.focus;
	let currentID = editor.selectedGlyphID;
	if (!state.baseline || state.baseline.id !== currentID) {
		settleBaseline(editor, state.baseline);
		state.baseline = takeBaseline(editor, currentID);
	}

	const content = makeElement({ tag: 'div', id: 'app__page', attributes: { 'data-page': 'focus' } });
	const card = makeElement({
		tag: 'div',
		className: 'focus-mode',
		attributes: { role: 'region', 'aria-label': 'Glyph editor' },
	});
	content.appendChild(card);

	// Header: close · prev/next pill · name
	const header = makeElement({ tag: 'div', className: 'focus-mode__header' });
	const closeButton = makeIconButton('close', 'Close', 'focus-mode__close');
	closeButton.title = 'Close · Esc';
	closeButton.addEventListener('click', () => closeFocusMode(editor));
	const stepper = makeElement({ tag: 'div', className: 'focus-mode__stepper' });
	const prevButton = makeIconButton('chevron_left', 'Previous glyph', 'focus-mode__prev');
	const nextButton = makeIconButton('chevron_right', 'Next glyph', 'focus-mode__next');
	const glyphChar = makeElement({ tag: 'span', className: 'focus-mode__char text-title' });
	prevButton.addEventListener('click', () => stepFocusGlyph(-1, editor));
	nextButton.addEventListener('click', () => stepFocusGlyph(1, editor));
	stepper.append(prevButton, glyphChar, nextButton);
	const nameEl = makeElement({ tag: 'span', className: 'focus-mode__name text-label' });
	header.append(closeButton, stepper, nameEl);

	// Canvas: the existing <edit-canvas>, unchanged, in the auto-fit wrapper.
	const wrapper = makeElement({
		tag: 'div',
		className: 'editor-page__edit-canvas-wrapper focus-mode__canvas',
	});
	const canvas = document.createElement('edit-canvas');
	canvas.id = 'editor-page__edit-canvas';
	canvas.setAttribute('editing-item-id', currentID);
	const guides = makeElement({ tag: 'div', className: 'focus-guides', attributes: { 'aria-hidden': 'true' } });
	wrapper.append(canvas, guides);

	const pill = makeToolPill(editor);
	const inspector = makeInspector(editor);
	const strip = makeContextStrip();

	// Focus trap: Tab wraps inside the card.
	const startSentinel = makeSentinel(() => lastFocusable(card).focus());
	const endSentinel = makeSentinel(() => closeButton.focus());
	card.append(startSentinel, header, wrapper, pill, inspector, strip, endSentinel);

	// Header keys stay out of the canvas shortcuts.
	header.addEventListener('keydown', guardKeys);
	header.addEventListener('keyup', guardKeys);

	function renderHeader() {
		const index = state.order.indexOf(currentID);
		prevButton.disabled = index <= 0;
		nextButton.disabled = index < 0 || index >= state.order.length - 1;
		glyphChar.textContent = charForGlyphID(currentID);
		nameEl.textContent = glyphDisplayName(editor, currentID);
	}

	function renderStrip() {
		strip.render(currentID, editor.project);
	}

	function renderGuides() {
		renderGuideLabels(editor, guides, currentID);
	}

	function renderAll() {
		renderHeader();
		inspector.render(currentID);
		renderStrip();
		renderGuides();
		pill.sync();
	}

	function switchTo(newID) {
		if (!newID || newID === currentID) return;
		settleBaseline(editor, state.baseline);
		currentID = newID;
		state.baseline = takeBaseline(editor, currentID);
		removeStopCreatingNewPathButton();
		canvas.setAttribute('editing-item-id', currentID);
		renderAll();
		if (!editor.project.getItem(currentID)?.shapes?.length) selectTool('newPath');
	}

	// Coalesced live updates (≤ one frame): strip, guide labels, stale fields.
	const redraw = createDebouncedRedraw((what) => {
		if (!card.isConnected) return;
		if (what === 'strip') renderStrip();
		if (what === 'guides') renderGuides();
		if (what === 'fields' && inspector.isStale()) inspector.render(currentID);
	});

	const sub = (topic, suffix, callback) =>
		editor.subscribe({ topic, subscriberID: `${FOCUS_SUBSCRIBER}.${suffix}`, callback });
	sub('whichGlyphIsSelected', 'glyph', (id) => switchTo(id));
	sub('whichToolIsSelected', 'tool', (tool) => pill.sync(tool));
	sub(GLYPH_STATUS_TOPIC, 'status', (data) => {
		if (!data?.id || data.id === currentID) inspector.refreshStatus();
	});
	sub(ITEM_CHANGED_TOPIC, 'item', () => {
		redraw.schedule('strip');
		redraw.schedule('guides');
	});
	sub('currentItem', 'item', () => {
		redraw.schedule('fields');
		redraw.schedule('guides');
	});
	sub('editCanvasView', 'view', () => redraw.schedule('guides'));

	const onKeyDown = (event) => {
		if (event.key !== 'Escape' || !card.isConnected) return;
		// Esc from the top bar or the agent panel belongs to them.
		const target = /** @type {Node} */ (event.target);
		const fromPage = target === document.body || target === document.documentElement;
		if (!fromPage && !card.contains(target)) return;
		// Let Esc close an open dialog or menu first (existing behaviour).
		if (document.querySelector(OPEN_OVERLAYS)) return;
		closeFocusMode(editor);
	};
	const onResize = () => redraw.schedule('guides');
	document.addEventListener('keydown', onKeyDown, true);
	window.addEventListener('resize', onResize);
	mounted = { onKeyDown, onResize, redraw };

	renderAll();
	if (!editor.project.getItem(currentID)?.shapes?.length) selectTool('newPath');
	// Guides need the laid-out canvas (auto-fit runs on connect).
	redraw.schedule('guides');

	return content;
}

/**
 * Keys without Ctrl / Cmd stay out of the document-level canvas shortcuts.
 * @param {KeyboardEvent} event
 */
function guardKeys(event) {
	if (event.key === 'Escape') return;
	if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
}

/**
 * @param {String} icon - Material Symbols Rounded ligature
 * @param {String} label - accessible name
 * @param {String} className
 * @returns {HTMLButtonElement}
 */
function makeIconButton(icon, label, className) {
	return /** @type {HTMLButtonElement} */ (
		makeElement({
			tag: 'button',
			className: `focus-mode__icon-button ${className}`,
			title: label,
			attributes: { type: 'button', 'aria-label': label },
			innerHTML: `<span class="material-symbols-rounded" aria-hidden="true">${icon}</span>`,
		})
	);
}

/**
 * An invisible focus stop that redirects focus (focus trap).
 * @param {Function} onFocus
 * @returns {HTMLElement}
 */
function makeSentinel(onFocus) {
	const sentinel = makeElement({
		tag: 'span',
		className: 'focus-mode__sentinel',
		attributes: { tabindex: '0', 'aria-hidden': 'true' },
	});
	sentinel.addEventListener('focus', () => onFocus());
	return sentinel;
}

/**
 * The last visible, enabled focusable inside the card (before the end sentinel).
 * @param {HTMLElement} card
 * @returns {HTMLElement}
 */
function lastFocusable(card) {
	const candidates = /** @type {Array<HTMLElement>} */ ([
		...card.querySelectorAll('button, input-number, edit-canvas'),
	]).filter((el) => !(/** @type {HTMLButtonElement} */ (el).disabled) && !el.closest('[hidden]'));
	return candidates[candidates.length - 1] || card.querySelector('.focus-mode__close');
}
