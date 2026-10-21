import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Glyph } from '../../project_data/glyph.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../main.js';
import { LATIN_KERNEL_SIZE } from '../set_progress.js';
import {
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

afterEach(() => {
	vi.clearAllMocks();
	getGlyphrStudioApp().projectEditors = [];
	document.body.innerHTML = '';
});

describe('Top bar: controls', () => {
	it('renders mark, name, ring, status slot, undo, redo, theme and Export in tab order', () => {
		expect(bar.id).toBe('app__top-bar');
		expect(bar.querySelector('.top-bar__mark')).not.toBeNull();
		expect(bar.querySelector('.top-bar__mark').tagName).toBe('BUTTON');
		expect(name().value).toBe('Bakery Sans');
		expect(bar.querySelector('.top-bar__count').textContent).toBe(`0/${LATIN_KERNEL_SIZE}`);
		const status = bar.querySelector('.top-bar__status');
		expect(status).not.toBeNull();
		expect(status.childElementCount).toBe(0);

		// UI reset: no compact-tier "Panel" toggle and no menus slot; the
		// minimized agent pill is the one control that restores the panel.
		const order = [...bar.querySelectorAll('input, button')].map(
			(element) => element.getAttribute('aria-label') || element.textContent.trim()
		);
		expect(order).toEqual(['Back to start', 'Font name', 'Undo', 'Redo', 'Theme', 'downloadExport']);
		expect(bar.querySelector('.noddy-panel-toggle')).toBeNull();
		expect(bar.querySelector('.top-bar__menus')).toBeNull();

		const icons = [...bar.querySelectorAll('.material-symbols-rounded')].map((i) => i.textContent);
		expect(icons).toEqual(expect.arrayContaining(['undo', 'redo', 'dark_mode', 'download']));
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

describe('Top bar: set progress ring', () => {
	it('counts Kernel glyphs with outlines and shows n/116', () => {
		editor.project.glyphs['glyph-0x41'] = makeGlyph(editor, 'glyph-0x41');
		editor.project.glyphs['glyph-0x62'] = makeGlyph(editor, 'glyph-0x62');
		editor.project.glyphs['glyph-0x20AC'] = makeGlyph(editor, 'glyph-0x20AC');
		// Outside the set: not counted
		editor.project.glyphs['glyph-0xE9'] = makeGlyph(editor, 'glyph-0xE9');
		refreshTopBar();
		const ring = bar.querySelector('.top-bar__progress');
		expect(bar.querySelector('.top-bar__count').textContent).toBe(`3/${LATIN_KERNEL_SIZE}`);
		expect(ring.getAttribute('aria-label')).toBe(`3 of ${LATIN_KERNEL_SIZE} characters drawn`);
		expect(ring.hasAttribute('data-complete')).toBe(false);
		const fill = ring.querySelector('.top-bar__ring-fill');
		expect(Number(fill.getAttribute('stroke-dashoffset'))).toBeLessThan(
			Number(fill.getAttribute('stroke-dasharray'))
		);
	});
});
