/**
 * Noddy top bar for an open project (M2 app shell, Figma TopBar `50:78`).
 *
 * Left: mark, editable font name, set progress ring, status slot.
 * Right: undo, redo, theme, Export.
 *
 * The bar is rebuilt by every `navigate()`; a stable `currentItem`
 * subscription keeps undo/redo and the ring fresh in between.
 */

import { insertAfter, makeElement } from '../common/dom.js';
import { closeEveryTypeOfDialog } from '../controls/dialogs/dialogs.js';
import { getCurrentProjectEditor, getGlyphrStudioApp } from './main.js';
import { makeFileMenuRows } from './menu.js';
import { makePage_OpenProject } from './open_project.js';
import { getSetProgress } from './set_progress.js';
import { LEAVE_MESSAGE, hasUnsavedChanges, shouldShowNotAutosaving } from './leave_guard.js';

export { hasUnsavedChanges };

export const TOP_BAR_ID = 'app__top-bar';
export const THEME_STORAGE_KEY = 'noddy.theme';
const SUBSCRIBER_ID = 'topBar';
const EXPORT_MENU_WIDTH = 320;
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
	/**
	 * Export: opens the project file menu (save project, save a copy, export
	 * OTF/TTF/WOFF/WOFF2/SVG font) anchored under the button. Owner note:
	 * closest to Figma until the M9 export sheet replaces it.
	 * @param {HTMLElement} button - the Export button
	 */
	export: (button) => openExportMenu(button),
	/**
	 * Mark: back to the start screen to open or import another project.
	 * Asks first when the project has unsaved changes.
	 */
	backToStart: () => {
		if (hasUnsavedChanges() && !window.confirm(LEAVE_MESSAGE)) return;
		closeEveryTypeOfDialog();
		getGlyphrStudioApp().appPageNavigate(makePage_OpenProject);
	},
};

export const EXPORT_MENU_ID = 'top-bar-export-menu';
const MENU_ICONS = { command_save: 'save', command_export: 'download' };

/**
 * Opens the project file menu under the Export button as a popover of real
 * buttons: ArrowUp/ArrowDown/Home/End move, Enter/Space activate, Esc closes
 * and returns focus, click outside or Tab away closes. Rows come from
 * makeFileMenuRows() so the actions stay defined once.
 * @param {HTMLElement} button - the Export button
 * @returns {Element | null} the menu
 */
export function openExportMenu(button) {
	if (!button) return null;
	if (document.getElementById(EXPORT_MENU_ID)) {
		closeExportMenu();
		return null;
	}
	closeEveryTypeOfDialog();

	const menu = makeElement({
		tag: 'div',
		id: EXPORT_MENU_ID,
		className: 'export-menu',
		attributes: { role: 'menu', 'aria-label': 'Export' },
	});
	for (const row of makeFileMenuRows()) {
		if (row.name === 'hr') {
			menu.appendChild(makeElement({ tag: 'hr', className: 'export-menu__separator' }));
		} else if (row.child) {
			const heading = makeElement({ tag: 'div', className: 'export-menu__heading' });
			heading.appendChild(row.child);
			menu.appendChild(heading);
		} else {
			menu.appendChild(makeExportMenuItem(row));
		}
	}

	const close = () => closeExportMenu();
	menu.addEventListener('keydown', (event) => {
		const items = focusableMenuItems(menu);
		const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
		const move = (next) => {
			event.preventDefault();
			items[(next + items.length) % items.length]?.focus();
		};
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
			button.focus();
		} else if (event.key === 'ArrowDown') move(index + 1);
		else if (event.key === 'ArrowUp') move(index - 1);
		else if (event.key === 'Home') move(0);
		else if (event.key === 'End') move(items.length - 1);
	});
	// Tab away or click outside closes the menu and resets the button.
	menu.addEventListener('focusout', (event) => {
		const next = /** @type {Node | null} */ (event.relatedTarget);
		if (next && (menu.contains(next) || next === button)) return;
		if (next) close();
	});
	const onPointerDown = (event) => {
		const target = /** @type {Node} */ (event.target);
		if (menu.contains(target) || button.contains(target)) return;
		close();
	};
	document.addEventListener('pointerdown', onPointerDown, true);
	menu.addEventListener('export-menu-close', () =>
		document.removeEventListener('pointerdown', onPointerDown, true)
	);

	// Right-aligned under the button, inside the bar so navigate() drops it.
	const rect = button.getBoundingClientRect();
	menu.style.left = `${Math.max(0, rect.right - EXPORT_MENU_WIDTH)}px`;
	menu.style.top = `${rect.bottom + 4}px`;
	menu.style.width = `${EXPORT_MENU_WIDTH}px`;
	insertAfter(button, menu);
	button.setAttribute('aria-expanded', 'true');
	focusableMenuItems(menu)[0]?.focus();
	return menu;
}

/**
 * Closes the Export menu (if open) and resets the button's aria-expanded.
 */
export function closeExportMenu() {
	const menu = document.getElementById(EXPORT_MENU_ID);
	if (menu) {
		menu.dispatchEvent(new Event('export-menu-close'));
		menu.remove();
	}
	document.querySelector('.top-bar__export')?.setAttribute('aria-expanded', 'false');
}

/**
 * @param {Element} menu - the menu
 * @returns {HTMLElement[]} enabled action buttons in order
 */
function focusableMenuItems(menu) {
	return [...menu.querySelectorAll('button.export-menu__item:not([disabled])')].map(
		(item) => /** @type {HTMLElement} */ (item)
	);
}

/**
 * One action row as a real button.
 * @param {Object} row - makeContextMenu row data (name, icon, note, onClick, disabled)
 * @returns {HTMLButtonElement}
 */
function makeExportMenuItem(row) {
	const item = /** @type {HTMLButtonElement} */ (
		makeElement({
			tag: 'button',
			className: 'export-menu__item',
			attributes: { type: 'button', role: 'menuitem', tabindex: '-1' },
		})
	);
	if (row.disabled) item.disabled = true;
	item.appendChild(icon(MENU_ICONS[row.icon] || 'chevron_right'));
	item.appendChild(makeElement({ tag: 'span', className: 'export-menu__name', content: row.name }));
	const note = makeElement({ tag: 'span', className: 'export-menu__note' });
	if (Array.isArray(row.note)) {
		for (const key of row.note) note.appendChild(makeElement({ tag: 'code', content: key }));
	}
	item.appendChild(note);
	item.addEventListener('click', () => {
		closeExportMenu();
		if (row.onClick) row.onClick();
	});
	return item;
}

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
		tag: 'button',
		className: 'top-bar__mark',
		title: 'Back to start',
		attributes: { type: 'button', 'aria-label': 'Back to start' },
		onClick: () => topBarActions.backToStart(),
	});

	const name = makeNameField(editor);
	const progress = makeProgressRing();
	const status = makeElement({ tag: 'div', className: 'top-bar__status', id: 'top-bar-status' });

	left.append(mark, name, progress, status);

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
		title: 'Export',
		attributes: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
		onClick: () => topBarActions.export(exportButton),
	});
	exportButton.append(icon('download'), makeElement({ tag: 'span', content: 'Export' }));

	right.append(undo, redo, theme, exportButton);
	topBar.append(left, right);

	// Pub/sub passes the published item as the first argument, so wrap the
	// refresh (its first parameter is the bar). Both topics cover edits,
	// undo/redo and agent commits.
	const refresh = () => refreshTopBar();
	editor.subscribe({ topic: 'currentItem', subscriberID: SUBSCRIBER_ID, callback: refresh });
	editor.subscribe({
		topic: 'itemChanged',
		subscriberID: `${SUBSCRIBER_ID}-itemChanged`,
		callback: refresh,
	});

	// Saving only changes the document title (setProjectAsSaved), so follow
	// the title to show or hide the "Not autosaving" chip.
	observeTitle(() => updateAutosaveChip(topBar));

	refreshTopBar(topBar);
	return topBar;
}

let titleObserver;

/**
 * One observer for the page; each new bar replaces the previous callback.
 * @param {Function} callback - called when the document title changes
 */
function observeTitle(callback) {
	titleObserver?.disconnect();
	const title = document.querySelector('title');
	if (!title || typeof MutationObserver === 'undefined') return;
	titleObserver = new MutationObserver(() => callback());
	titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
}

export const AUTOSAVE_CHIP_TEXT = 'Not autosaving';

/**
 * Shows the "Not autosaving" chip in the status slot only while autosave is
 * off and there are unsaved changes; removes it otherwise (the slot hides
 * while empty).
 * @param {Element | null} topBar - the bar
 */
export function updateAutosaveChip(topBar) {
	const status = topBar?.querySelector('#top-bar-status');
	if (!status) return;
	const existing = status.querySelector('.top-bar__autosave-chip');
	const show = shouldShowNotAutosaving();
	if (!show) {
		existing?.remove();
		return;
	}
	if (existing) return;
	const chip = makeElement({
		tag: 'span',
		className: 'top-bar__autosave-chip text-label',
		attributes: { role: 'status' },
	});
	chip.append(icon('cloud_off'), makeElement({ tag: 'span', content: AUTOSAVE_CHIP_TEXT }));
	status.appendChild(chip);
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
	updateAutosaveChip(topBar);
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
			refreshTopBar();
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
