import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Glyph } from '../../project_data/glyph.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../main.js';
import { LATIN_KERNEL_SIZE } from '../set_progress.js';
import {
	isReviewFilterOn,
	reviewCount,
	setReviewFilter,
} from '../../controls/glyph-grid/review-filter.js';
import {
	ALL_REVIEWED_TEXT,
	THEME_STORAGE_KEY,
	applyStoredTheme,
	makeAppTopBar,
	refreshTopBar,
	topBarActions,
} from '../top_bar.js';

// jsdom has no Web Animations; dialogs.js animateRemove() needs it.
if (!Element.prototype.animate) {
	Element.prototype.animate = () => ({ onfinish: null, cancel() {} });
}

const square = [
	{ x: 0, y: 0 },
	{ x: 0, y: 500 },
	{ x: 500, y: 500 },
	{ x: 500, y: 0 },
];

function makeGlyph(editor, id) {
	return new Glyph({
		id,
		parent: editor.project,
		advanceWidth: 600,
		shapes: [
			{
				name: 'Outline',
				pathPoints: square.map((point) => ({
					p: { coord: { x: point.x, y: point.y } },
					h1: { use: false },
					h2: { use: false },
				})),
			},
		],
	});
}

/** @type {ProjectEditor} */
let editor;
/** @type {Element} */
let bar;

const name = () => /** @type {HTMLInputElement} */ (bar.querySelector('.top-bar__name'));
const undo = () => /** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__undo'));
const redo = () => /** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__redo'));
const theme = () => /** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__theme'));
const key = (element, key) =>
	element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

beforeEach(() => {
	document.title = 'Noddy';
	document.documentElement.removeAttribute('data-theme');
	try {
		window.localStorage.removeItem(THEME_STORAGE_KEY);
	} catch {
		// no storage in this environment
	}
	document.body.innerHTML = '<div id="app__wrapper"></div>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.project.settings.app.autoSave = false;
	editor.project.settings.project.name = 'Bakery Sans';
	bar = makeAppTopBar();
	document.querySelector('#app__wrapper').appendChild(bar);
});

/** Labels of the bar's tab stops, in DOM (= tab) order. */
function tabOrder() {
	return [
		...bar.querySelectorAll(
			'input:not([hidden]), button:not([hidden]), [tabindex="0"]:not([hidden])'
		),
	].map((element) => element.getAttribute('aria-label') || element.textContent.trim());
}

afterEach(() => {
	vi.clearAllMocks();
	getGlyphrStudioApp().projectEditors = [];
	document.body.innerHTML = '';
});

describe('Top bar: controls', () => {
	it('renders mark, name, review pill, status slot, undo, redo, theme and Export in tab order', () => {
		expect(bar.id).toBe('app__top-bar');
		expect(bar.querySelector('.top-bar__mark')).not.toBeNull();
		expect(bar.querySelector('.top-bar__mark').tagName).toBe('BUTTON');
		expect(name().value).toBe('Bakery Sans');
		// Nothing to review: the calm note shows in the pill's place (a tab stop for its
		// "characters drawn" name) and the pill button is out of the tab order.
		expect(bar.querySelector('.top-bar__review-done').hidden).toBe(false);
		expect(bar.querySelector('.top-bar__review-done').textContent).toBe('All reviewed');
		expect(bar.querySelector('.top-bar__review').hidden).toBe(true);
		expect(bar.querySelector('.top-bar__progress')).toBeNull();
		const status = bar.querySelector('.top-bar__status');
		expect(status).not.toBeNull();
		expect(status.childElementCount).toBe(0);

		// UI reset: no compact-tier "Panel" toggle and no menus slot; the
		// minimized agent pill is the one control that restores the panel.
		expect(tabOrder()).toEqual([
			'Back to start',
			'Font name',
			`All reviewed · 0 of ${LATIN_KERNEL_SIZE} characters drawn`,
			'Undo',
			'Redo',
			'Theme',
			'downloadExport',
		]);
		expect(bar.querySelector('.noddy-panel-toggle')).toBeNull();
		expect(bar.querySelector('.top-bar__menus')).toBeNull();

		const icons = [...bar.querySelectorAll('.material-symbols-rounded')].map((i) => i.textContent);
		expect(icons).toEqual(expect.arrayContaining(['undo', 'redo', 'dark_mode', 'download']));
	});

	it('with drafts, the "N to review" pill sits between the font name and Undo', async () => {
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(tabOrder().slice(0, 4)).toEqual(['Back to start', 'Font name', '1 to review', 'Undo']);
	});

	it('does not add a settings cog, project menu, breadcrumb or hamburger', () => {
		const text = bar.textContent;
		for (const banned of ['settings', 'menu', 'File', 'Projects', 'Help']) {
			expect(text.includes(banned), banned).toBe(false);
		}
	});

	it('Export calls through to the export action with its button', () => {
		const original = topBarActions.export;
		topBarActions.export = vi.fn();
		try {
			const button = /** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__export'));
			expect(button.title).toBe('Export');
			button.click();
			expect(topBarActions.export).toHaveBeenCalledWith(button);
		} finally {
			topBarActions.export = original;
		}
	});

	it('Export opens a menu of real buttons: arrows move, Enter activates, Esc closes', () => {
		const button = /** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__export'));
		const save = vi.spyOn(editor, 'saveProjectFile').mockImplementation(() => {});
		button.click();
		const menu = document.querySelector('#top-bar-export-menu');
		expect(menu).not.toBeNull();
		expect(menu.getAttribute('role')).toBe('menu');
		expect(button.getAttribute('aria-expanded')).toBe('true');
		const items = [...menu.querySelectorAll('button[role="menuitem"]')];
		const names = items.map((i) => i.querySelector('.export-menu__name').textContent);
		expect(names[0]).toContain('Save project file');
		expect(names).toEqual(
			expect.arrayContaining([
				'Export OTF file',
				'Export TTF file',
				'Export WOFF file',
				'Export WOFF2 file',
				'Export SVG font file',
			])
		);
		// First action is focused on open (not a heading)
		expect(document.activeElement).toBe(items[0]);

		const key = (k) => menu.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		key('ArrowDown');
		expect(document.activeElement).toBe(items[1]);
		key('ArrowUp');
		expect(document.activeElement).toBe(items[0]);
		key('ArrowUp');
		expect(document.activeElement).toBe(items[items.length - 1]);
		key('Home');
		expect(document.activeElement).toBe(items[0]);

		// Enter on a focused button is a click: runs the action and closes
		/** @type {HTMLElement} */ (document.activeElement).click();
		expect(save).toHaveBeenCalledTimes(1);
		expect(document.querySelector('#top-bar-export-menu')).toBeNull();
		expect(button.getAttribute('aria-expanded')).toBe('false');

		// Esc closes and returns focus
		button.click();
		expect(document.querySelector('#top-bar-export-menu')).not.toBeNull();
		document
			.querySelector('#top-bar-export-menu')
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(document.querySelector('#top-bar-export-menu')).toBeNull();
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(button);
	});

	it('clicking outside closes the Export menu and resets aria-expanded', () => {
		const button = /** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__export'));
		button.click();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(document.querySelector('#top-bar-export-menu')).toBeNull();
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});

	it('the mark goes back to the start screen, asking first when unsaved', () => {
		const mark = /** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__mark'));
		expect(mark.title).toBe('Back to start');
		const app = getGlyphrStudioApp();
		const navigate = vi.spyOn(app, 'appPageNavigate').mockImplementation(() => {});
		const confirm = vi.spyOn(window, 'confirm');

		mark.click();
		expect(confirm).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledTimes(1);

		editor.setProjectAsUnsaved();
		confirm.mockReturnValue(false);
		mark.click();
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledTimes(1);

		confirm.mockReturnValue(true);
		mark.click();
		expect(navigate).toHaveBeenCalledTimes(2);
	});
});

describe('Top bar: font name', () => {
	it('Enter commits the new name to the project setting', () => {
		const input = name();
		input.focus();
		input.value = 'Croissant Sans';
		input.dispatchEvent(new Event('input'));
		key(input, 'Enter');
		input.blur();
		expect(editor.project.settings.project.name).toBe('Croissant Sans');
		expect(document.title.endsWith(' •')).toBe(true);
	});

	it('Esc cancels and restores the previous name', () => {
		const input = name();
		input.focus();
		input.value = 'Nope';
		key(input, 'Escape');
		input.blur();
		expect(input.value).toBe('Bakery Sans');
		expect(editor.project.settings.project.name).toBe('Bakery Sans');
	});

	it('an empty name reverts on blur', () => {
		const input = name();
		input.focus();
		input.value = '   ';
		input.blur();
		expect(input.value).toBe('Bakery Sans');
		expect(editor.project.settings.project.name).toBe('Bakery Sans');
	});

	it('refresh picks up a name changed elsewhere', () => {
		editor.project.settings.project.name = 'Changed in Settings';
		refreshTopBar();
		expect(name().value).toBe('Changed in Settings');
	});
});

describe('Top bar: undo / redo', () => {
	it('both are disabled with an empty history', () => {
		expect(undo().disabled).toBe(true);
		expect(redo().disabled).toBe(true);
	});

	it('undo enables after a change and calls the existing history actions', () => {
		editor.nav.page = 'Characters';
		editor.project.glyphs['glyph-0x41'] = makeGlyph(editor, 'glyph-0x41');
		editor.selectedGlyphID = 'glyph-0x41';
		editor.history.addState('Moved a point');
		refreshTopBar();
		expect(undo().disabled).toBe(false);
		expect(redo().disabled).toBe(true);

		const restore = vi.spyOn(editor.history, 'restoreState');
		const again = vi.spyOn(editor.history, 'redoState');
		undo().click();
		expect(restore).toHaveBeenCalledTimes(1);
		editor.history.redoQueue = [[{ itemState: {} }]];
		refreshTopBar();
		expect(redo().disabled).toBe(false);
		redo().click();
		expect(again).toHaveBeenCalledTimes(1);
	});
});

describe('Top bar: history refresh (regression)', () => {
	it('enables undo when an edit is published, without a navigate', () => {
		editor.nav.page = 'Characters';
		editor.project.glyphs['glyph-0x41'] = makeGlyph(editor, 'glyph-0x41');
		editor.selectedGlyphID = 'glyph-0x41';
		expect(undo().disabled).toBe(true);
		editor.history.addState('Moved a point');
		editor.publish('currentItem', editor.selectedGlyph);
		expect(undo().disabled).toBe(false);
	});

	it('refreshes on itemChanged too (agent commits)', () => {
		editor.nav.page = 'Characters';
		editor.project.glyphs['glyph-0x41'] = makeGlyph(editor, 'glyph-0x41');
		editor.selectedGlyphID = 'glyph-0x41';
		editor.history.addState('Agent edit');
		editor.publish('itemChanged', { id: 'glyph-0x41' });
		expect(undo().disabled).toBe(false);
	});
});

describe('Top bar: theme', () => {
	it('toggles data-theme on the root, swaps the icon and remembers the choice', () => {
		expect(theme().querySelector('.material-symbols-rounded').textContent).toBe('dark_mode');
		theme().click();
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
		expect(theme().getAttribute('aria-pressed')).toBe('true');
		expect(theme().querySelector('.material-symbols-rounded').textContent).toBe('light_mode');
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
		theme().click();
		expect(document.documentElement.getAttribute('data-theme')).toBe('light');
	});

	it('applies a stored theme at boot', () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
		document.documentElement.removeAttribute('data-theme');
		applyStoredTheme();
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	});
});

describe('Top bar: "N to review" pill (#135)', () => {
	const pill = () => /** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__review'));
	const done = () => /** @type {HTMLElement} */ (bar.querySelector('.top-bar__review-done'));
	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

	afterEach(() => setReviewFilter(editor, false));

	it('counts every agent Draft in the project, not Failed, Kept, Yours, Queued or Drafting', async () => {
		editor.project.glyphs['glyph-0x41'] = makeGlyph(editor, 'glyph-0x41'); // derived Kept
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent');
		editor.glyphStatus.set('glyph-0x62', 'draft', 'agent');
		editor.glyphStatus.set('glyph-0x21', 'draft', 'agent'); // "!" is in All 116
		editor.glyphStatus.set('glyph-0x66', 'failed', 'agent');
		editor.glyphStatus.set('glyph-0x63', 'yours', 'user');
		editor.glyphStatus.set('glyph-0x64', 'queued', 'agent');
		editor.glyphStatus.set('glyph-0x65', 'drafting', 'agent');
		editor.glyphStatus.set('glyph-0xE9', 'draft', 'agent'); // outside the set: counted too
		await flush();
		expect(pill().hidden).toBe(false);
		// The same number the agent pill shows (one shared count) and the grid's tile count.
		expect(pill().textContent).toBe('4 to review');
		expect(reviewCount(editor)).toBe(4);
		expect(pill().getAttribute('aria-pressed')).toBe('false');
		expect(done().hidden).toBe(true);
	});

	it('updates on glyphStatusChanged and falls back to a calm "All reviewed" at zero', async () => {
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent');
		await flush();
		expect(pill().textContent).toBe('1 to review');
		editor.glyphStatus.set('glyph-0x61', 'kept', 'user');
		await flush();
		expect(pill().hidden).toBe(true);
		expect(done().hidden).toBe(false);
		expect(done().textContent).toBe(ALL_REVIEWED_TEXT);
		expect(done().tagName).toBe('SPAN'); // not a control, not a disabled button
		expect(done().getAttribute('role')).toBe('note');
	});

	it('the only draft outside the 116 set still shows "1 to review", not "All reviewed"', async () => {
		editor.glyphStatus.set('glyph-0x203D', 'draft', 'agent'); // "‽" (Oblegg has it)
		await flush();
		expect(pill().hidden).toBe(false);
		expect(pill().textContent).toBe('1 to review');
		expect(done().hidden).toBe(true);
	});

	it('focus on the pill moves to "All reviewed" when the last draft goes, and back', async () => {
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent');
		await flush();
		pill().focus();
		pill().click();
		editor.glyphStatus.set('glyph-0x61', 'kept', 'user'); // e.g. redo of a Keep
		await flush();
		expect(pill().hidden).toBe(true);
		expect(document.activeElement).toBe(done());
		editor.glyphStatus.set('glyph-0x62', 'draft', 'agent');
		await flush();
		expect(document.activeElement).toBe(pill());
	});

	it('focus elsewhere is left alone when the count reaches 0', async () => {
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent');
		await flush();
		name().focus();
		editor.glyphStatus.set('glyph-0x61', 'kept', 'user');
		await flush();
		expect(document.activeElement).toBe(name());
	});

	it('click toggles the grid filter (aria-pressed), which stays out of the project file', async () => {
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent');
		await flush();
		const saved = JSON.stringify(editor.project.save());
		const stored = JSON.stringify({ ...window.localStorage });
		pill().click();
		expect(isReviewFilterOn(editor)).toBe(true);
		expect(pill().getAttribute('aria-pressed')).toBe('true');
		expect(JSON.stringify(editor.project.save())).toBe(saved);
		expect(JSON.stringify({ ...window.localStorage })).toBe(stored);

		pill().click();
		expect(isReviewFilterOn(editor)).toBe(false);
		expect(pill().getAttribute('aria-pressed')).toBe('false');
	});

	it('keeps the old ring\'s "n of 116 characters drawn" in the tooltip', () => {
		editor.project.glyphs['glyph-0x41'] = makeGlyph(editor, 'glyph-0x41');
		editor.project.glyphs['glyph-0x62'] = makeGlyph(editor, 'glyph-0x62');
		editor.project.glyphs['glyph-0x20AC'] = makeGlyph(editor, 'glyph-0x20AC');
		// Outside the set: not counted
		editor.project.glyphs['glyph-0xE9'] = makeGlyph(editor, 'glyph-0xE9');
		refreshTopBar();
		expect(done().getAttribute('title')).toBe(
			`Nothing to review · 3 of ${LATIN_KERNEL_SIZE} characters drawn`
		);
		// Reachable without a mouse: a tab stop whose accessible name carries the count.
		expect(done().getAttribute('tabindex')).toBe('0');
		expect(done().getAttribute('aria-label')).toBe(
			`All reviewed · 3 of ${LATIN_KERNEL_SIZE} characters drawn`
		);
		expect(pill().getAttribute('title')).toBe(
			`Show only glyphs to review · 3 of ${LATIN_KERNEL_SIZE} characters drawn`
		);
	});
});
