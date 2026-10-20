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
		expect(bar.querySelector('.top-bar__mark').hasAttribute('tabindex')).toBe(false);
		expect(name().value).toBe('Bakery Sans');
		expect(bar.querySelector('.top-bar__count').textContent).toBe(`0/${LATIN_KERNEL_SIZE}`);
		const status = bar.querySelector('.top-bar__status');
		expect(status).not.toBeNull();
		expect(status.childElementCount).toBe(0);

		const order = [...bar.querySelectorAll('input, button')].map(
			(element) => element.getAttribute('aria-label') || element.textContent.trim()
		);
		expect(order).toEqual(['Font name', 'Undo', 'Redo', 'Theme', 'downloadExport']);

		const icons = [...bar.querySelectorAll('.material-symbols-rounded')].map((i) => i.textContent);
		expect(icons).toEqual(expect.arrayContaining(['undo', 'redo', 'dark_mode', 'download']));
	});

	it('does not add a settings cog, project menu, breadcrumb or hamburger', () => {
		const text = bar.textContent;
		for (const banned of ['settings', 'menu', 'File', 'Projects', 'Help']) {
			expect(text.includes(banned), banned).toBe(false);
		}
	});

	it('Export calls through to the default-format export action', () => {
		const original = topBarActions.export;
		topBarActions.export = vi.fn();
		try {
			/** @type {HTMLButtonElement} */ (bar.querySelector('.top-bar__export')).click();
			expect(topBarActions.export).toHaveBeenCalledTimes(1);
		} finally {
			topBarActions.export = original;
		}
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
