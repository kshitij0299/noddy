/**
 * Noddy top bar for an open project (M2 app shell, Figma TopBar `50:78`).
 *
 * Left: mark, editable font name, set progress ring, status slot.
 * Right: undo, redo, theme, Export.
 *
 * The bar is rebuilt by every `navigate()`; a stable `currentItem`
 * subscription keeps undo/redo and the ring fresh in between.
 */

import { makeElement } from '../common/dom.js';
import { ioFont_exportDefaultFormat } from '../formats_io/otf/font_export.js';
import { getCurrentProjectEditor } from './main.js';
import { getSetProgress } from './set_progress.js';

export const TOP_BAR_ID = 'app__top-bar';
export const THEME_STORAGE_KEY = 'noddy.theme';
const SUBSCRIBER_ID = 'topBar';
const NAME_MAX_LENGTH = 80;
const MONITOR_MEDIA = '(max-width: 759px)';
const RING_RADIUS = 6.5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Actions the bar calls through to. Read at click time so tests (and later
 * milestones, e.g. the M9 export sheet) can swap them without rebuilding
 * the bar.
 */
export const topBarActions = {
	export: () => ioFont_exportDefaultFormat(),
};

// --------------------------------------------------------------
// Theme
// --------------------------------------------------------------

/**
 * @returns {'light' | 'dark'}
 */
export function getTheme() {
	return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Sets `data-theme` on the root (the existing dark tokens key off it) and
 * remembers the choice. Storage can be unavailable (private mode, blocked
 * site data), so every access is guarded.
 * @param {'light' | 'dark'} theme - theme to apply
 */
export function applyTheme(theme) {
	const next = theme === 'dark' ? 'dark' : 'light';
	document.documentElement.setAttribute('data-theme', next);
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, next);
	} catch {
		// Storage is a convenience only.
	}
}

/**
 * Applies the remembered theme, if any. Called at boot and when the bar is built.
 */
export function applyStoredTheme() {
	let stored = null;
	try {
		stored = window.localStorage.getItem(THEME_STORAGE_KEY);
	} catch {
		stored = null;
	}
	if (stored === 'dark' || stored === 'light') {
		document.documentElement.setAttribute('data-theme', stored);
	}
}

/**
 * @returns {'light' | 'dark'} the theme now applied
 */
export function toggleTheme() {
	const next = getTheme() === 'dark' ? 'light' : 'dark';
	applyTheme(next);
	return next;
}

// --------------------------------------------------------------
// Top bar
// --------------------------------------------------------------

/**
 * Material Symbols Rounded icon (outlined, FILL 0).
 * @param {String} name - ligature name
 * @returns {Element}
 */
function icon(name) {
	return makeElement({
		tag: 'span',
		className: 'material-symbols-rounded',
		content: name,
		attributes: { 'aria-hidden': 'true' },
	});
}

/**
 * 36px icon button.
 * @param {Object} options - button options
 * @param {String} options.id - element id
 * @param {String} options.iconName - Material Symbols name
 * @param {String} options.label - tooltip and accessible name
 * @param {String} options.className - extra class
 * @param {Function} options.onClick - click handler
 * @returns {HTMLButtonElement}
 */
function iconButton({ id, iconName, label, className, onClick }) {
	const button = /** @type {HTMLButtonElement} */ (
		makeElement({
			tag: 'button',
			id,
			className: `icon-button ${className}`,
			title: label,
			attributes: { type: 'button', 'aria-label': label },
			onClick,
		})
	);
	button.appendChild(icon(iconName));
	return button;
}

/**
 * Makes the Top Bar for an open project.
 * @returns {Element}
 */
export function makeAppTopBar() {
	applyStoredTheme();
	const editor = getCurrentProjectEditor();

	const topBar = makeElement({ tag: 'header', id: TOP_BAR_ID, className: 'top-bar' });
	const left = makeElement({ tag: 'div', className: 'top-bar__left' });
	const right = makeElement({ tag: 'div', className: 'top-bar__right' });

	const mark = makeElement({
		tag: 'span',
		className: 'top-bar__mark',
		attributes: { role: 'img', 'aria-label': 'Noddy' },
	});

	const name = makeNameField(editor);
	const progress = makeProgressRing();
	const status = makeElement({ tag: 'div', className: 'top-bar__status', id: 'top-bar-status' });
	// The existing compact-tier panel drawer toggle (panels.js) mounts here.
	const menus = makeElement({ tag: 'div', className: 'top-bar__menus' });

	left.append(mark, name, progress, status, menus);

	const undo = iconButton({
		id: 'top-bar-undo',
		iconName: 'undo',
		label: 'Undo',
		className: 'top-bar__undo',
		onClick: () => {
			getCurrentProjectEditor().history.restoreState();
			refreshTopBar();
		},
	});
	const redo = iconButton({
		id: 'top-bar-redo',
		iconName: 'redo',
		label: 'Redo',
		className: 'top-bar__redo',
		onClick: () => {
			getCurrentProjectEditor().history.redoState();
			refreshTopBar();
		},
	});
	const theme = iconButton({
		id: 'top-bar-theme',
		iconName: 'dark_mode',
		label: 'Theme',
		className: 'top-bar__theme',
		onClick: () => {
			toggleTheme();
			refreshTopBar();
		},
	});
	const exportButton = makeElement({
		tag: 'button',
		id: 'top-bar-export',
		className: 'button button--secondary top-bar__export',
		attributes: { type: 'button' },
		onClick: () => topBarActions.export(),
	});
	exportButton.append(icon('download'), makeElement({ tag: 'span', content: 'Export' }));

	right.append(undo, redo, theme, exportButton);
	topBar.append(left, right);

	editor.subscribe({ topic: 'currentItem', subscriberID: SUBSCRIBER_ID, callback: refreshTopBar });

	refreshTopBar(topBar);
	return topBar;
}

/**
 * Updates the live parts of the bar: undo/redo availability, the ring, the
 * theme icon and the name (after undo of a settings change, for example).
 * @param {Element =} topBar - defaults to the bar in the document
 */
export function refreshTopBar(topBar = document.getElementById(TOP_BAR_ID)) {
	if (!topBar || !(topBar instanceof Element)) return;
	const editor = getCurrentProjectEditor();
	const history = editor.history;

	const undo = topBar.querySelector('.top-bar__undo');
	const redo = topBar.querySelector('.top-bar__redo');
	if (undo) /** @type {HTMLButtonElement} */ (undo).disabled = !(history && history.length > 0);
	if (redo)
		/** @type {HTMLButtonElement} */ (redo).disabled = !(
			history &&
			Array.isArray(history.redoQueue) &&
			history.redoQueue.length > 0
		);

	const theme = topBar.querySelector('.top-bar__theme');
	if (theme) {
		const isDark = getTheme() === 'dark';
		theme.setAttribute('aria-pressed', String(isDark));
		const glyph = theme.querySelector('.material-symbols-rounded');
		if (glyph) glyph.textContent = isDark ? 'light_mode' : 'dark_mode';
	}

	const name = /** @type {HTMLInputElement | null} */ (topBar.querySelector('.top-bar__name'));
	if (name && !name.hasAttribute('data-editing')) {
		setNameValue(name, editor.project.settings.project.name);
	}

	updateProgressRing(topBar.querySelector('.top-bar__progress'), getSetProgress(editor.project));
}

// --------------------------------------------------------------
// Font name
// --------------------------------------------------------------

/**
 * Sets the field text and sizes the field to it (ellipsis past ~40 chars).
 * @param {HTMLInputElement} input - the name field
 * @param {String} value - project name
 */
function setNameValue(input, value) {
	input.value = value;
	const length = Math.max(4, Math.min(40, String(value).length + 1));
	input.style.width = `${length}ch`;
}

/**
 * Editable font name. Enter commits, Esc cancels, empty reverts; a committed
 * name is written to the existing project name setting.
 * @param {Object} editor - ProjectEditor
 * @returns {HTMLInputElement}
 */
function makeNameField(editor) {
	const input = /** @type {HTMLInputElement} */ (
		makeElement({
			tag: 'input',
			id: 'top-bar-name',
			className: 'top-bar__name text-subheading',
			title: 'Font name',
			attributes: {
				type: 'text',
				'aria-label': 'Font name',
				maxlength: String(NAME_MAX_LENGTH),
				autocomplete: 'off',
				spellcheck: 'false',
			},
		})
	);
	setNameValue(input, editor.project.settings.project.name);

	// Monitor mode (<760px): the name is read-only.
	const monitor = typeof window.matchMedia === 'function' ? window.matchMedia(MONITOR_MEDIA) : null;
	const syncReadOnly = () => {
		input.readOnly = !!monitor?.matches;
	};
	syncReadOnly();
	monitor?.addEventListener?.('change', syncReadOnly);

	let previous = input.value;
	let cancelled = false;

	input.addEventListener('focus', () => {
		if (input.readOnly) return;
		previous = input.value;
		cancelled = false;
		input.setAttribute('data-editing', '');
	});

	input.addEventListener('input', () => setNameValue(input, input.value));

	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			input.blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelled = true;
			input.blur();
		}
	});

	input.addEventListener('blur', () => {
		input.removeAttribute('data-editing');
		const next = input.value.trim();
		if (cancelled || next === '') {
			setNameValue(input, previous);
			cancelled = false;
			return;
		}
		setNameValue(input, next);
		if (next !== previous) {
			const current = getCurrentProjectEditor();
			current.project.settings.project.name = next;
			current.setProjectAsUnsaved();
		}
		previous = next;
	});

	return input;
}

// --------------------------------------------------------------
// Set progress ring
// --------------------------------------------------------------

/**
 * 16px ring plus `n/116` in Mono small. Hollow at 0, fills with progress,
 * shows a check when complete.
 * @returns {Element}
 */
function makeProgressRing() {
	const wrapper = makeElement({
		tag: 'span',
		className: 'top-bar__progress',
		attributes: { role: 'img' },
	});
	const ring = makeElement({
		tag: 'span',
		className: 'top-bar__ring',
		attributes: { 'aria-hidden': 'true' },
		innerHTML: `<svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
			<circle class="top-bar__ring-track" cx="8" cy="8" r="${RING_RADIUS}" />
			<circle class="top-bar__ring-fill" cx="8" cy="8" r="${RING_RADIUS}"
				stroke-dasharray="${RING_LENGTH.toFixed(3)}" stroke-dashoffset="${RING_LENGTH.toFixed(3)}"
				transform="rotate(-90 8 8)" />
		</svg>`,
	});
	const check = icon('check');
	check.classList.add('top-bar__ring-check');
	const count = makeElement({ tag: 'span', className: 'top-bar__count text-mono-small' });
	wrapper.append(ring, check, count);
	return wrapper;
}

/**
 * @param {Element | null} wrapper - `.top-bar__progress`
 * @param {{done: Number, total: Number, fraction: Number}} progress - set progress
 */
function updateProgressRing(wrapper, progress) {
	if (!wrapper) return;
	const { done, total, fraction } = progress;
	wrapper.setAttribute('aria-label', `${done} of ${total} characters drawn`);
	wrapper.setAttribute('data-done', String(done));
	wrapper.toggleAttribute('data-complete', done >= total);
	const fill = wrapper.querySelector('.top-bar__ring-fill');
	if (fill) fill.setAttribute('stroke-dashoffset', (RING_LENGTH * (1 - fraction)).toFixed(3));
	const count = wrapper.querySelector('.top-bar__count');
	if (count) count.textContent = `${done}/${total}`;
}
