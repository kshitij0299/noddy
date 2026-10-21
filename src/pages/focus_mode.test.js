import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../app/main.js';
import { GlyphGrid, openGlyph } from '../controls/glyph-grid/glyph-grid.js';
import { GlyphGridTile } from '../controls/glyph-grid/glyph-tile.js';
import { InputNumber } from '../controls/input-number/input_number.js';
import { SpecimenCard } from '../controls/specimen-card/specimen_card.js';
import { EditCanvas } from '../edit_canvas/edit_canvas.js';
import { eventHandlerData } from '../edit_canvas/events.js';
import { selectTool } from '../edit_canvas/tools/tools.js';
import { Glyph } from '../project_data/glyph.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../project_editor/project_editor.js';
import { charForGlyphID, contextStringFor, makeContextStripSVG } from './focus_context_strip.js';
import {
	REVERT_UNAVAILABLE_TOOLTIP,
	codePointLabel,
	keepDraft,
	revertDraft,
} from './focus_inspector.js';
import {
	closeFocusMode,
	glyphDisplayName,
	isFocusModeOpen,
	openFocusMode,
	outlineFingerprint,
	stepFocusGlyph,
} from './focus_mode.js';

const elements = {
	'edit-canvas': EditCanvas,
	'input-number': InputNumber,
	'glyph-grid-tile': GlyphGridTile,
	'glyph-grid': GlyphGrid,
	'specimen-card': SpecimenCard,
};
Object.entries(elements).forEach(([name, cls]) => {
	if (!customElements.get(name)) customElements.define(name, cls);
});

// jsdom has no Web Animations; dialogs.js animateRemove() needs it.
if (!Element.prototype.animate) {
	// @ts-expect-error 'test stub'
	Element.prototype.animate = () => ({ onfinish: null, cancel() {} });
}

const A = 'glyph-0x41';
const B = 'glyph-0x42';
const a = 'glyph-0x61';
const n = 'glyph-0x6E';
const copy = (value) => JSON.parse(JSON.stringify(value));

function makeGlyph(id, parent, { x = 40, size = 500, advance = 600 } = {}) {
	return new Glyph({
		id,
		parent,
		advanceWidth: advance,
		shapes: [
			{
				name: 'Outline',
				pathPoints: [
					[x, 0],
					[x + size, 0],
					[x + size, size],
					[x, size],
				].map(([px, py]) => ({ p: { coord: { x: px, y: py } }, h1: { use: false }, h2: { use: false } })),
			},
		],
	});
}

let editor;

function key(target, keyName, init = {}) {
	const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	target.dispatchEvent(new KeyboardEvent('keyup', { key: keyName, bubbles: true, ...init }));
	return event;
}

const focusCard = () => document.querySelector('.focus-mode');
const canvas = () => document.querySelector('.focus-mode edit-canvas');
const pillButton = (tool) =>
	/** @type {HTMLButtonElement} */ (document.querySelector(`.focus-pill__tool[data-tool="${tool}"]`));

function openWorkspace() {
	editor.nav.page = 'Workspace';
	editor.navigate();
}

function grid() {
	return /** @type {GlyphGrid} */ (document.querySelector('glyph-grid'));
}

beforeEach(() => {
	document.body.innerHTML = '<div id="app__wrapper"></div>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.project.settings.app.autoSave = false;
	editor.project.glyphs[A] = makeGlyph(A, editor.project);
	editor.project.glyphs[B] = makeGlyph(B, editor.project);
	editor.project.glyphs[a] = makeGlyph(a, editor.project, { size: 300 });
	editor.project.glyphs[n] = makeGlyph(n, editor.project, { size: 280 });
	editor.selectedGlyphID = A;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	editor.glyphStatus.reload();
	Object.assign(eventHandlerData, { isCtrlDown: false, isShiftDown: false, isSpaceDown: false });
	editor.selectedTool = 'pathEdit';
	openWorkspace();
});

afterEach(() => {
	if (isFocusModeOpen(editor)) closeFocusMode(editor);
	document.body.innerHTML = '';
	vi.restoreAllMocks();
	getGlyphrStudioApp().projectEditors = [];
	try {
		window.localStorage.clear();
	} catch {
		// ignore
	}
});

// --------------------------------------------------------------
// #16 Open, close, prev/next
// --------------------------------------------------------------

describe('Focus mode: open and close (#16)', () => {
	it('a tile click opens focus mode with the existing edit canvas for that glyph', () => {
		grid().tiles.get(a).click();
		expect(isFocusModeOpen(editor)).toBe(true);
		expect(editor.nav.page).toBe('Characters');
		expect(focusCard()).toBeTruthy();
		expect(canvas()).toBeInstanceOf(EditCanvas);
		expect(canvas().getAttribute('editing-item-id')).toBe(a);
		expect(canvas().closest('.editor-page__edit-canvas-wrapper')).toBeTruthy();
		expect(editor.editCanvas).toBe(canvas());
		expect(document.querySelector('.focus-mode__name').textContent).toBe('Latin small a');
		expect(document.querySelector('#app__top-bar')).toBeTruthy();
	});

	it('Enter on a focused tile opens it', () => {
		const tile = grid().tiles.get(n);
		grid().select(n, { focus: true });
		key(tile, 'Enter');
		expect(canvas().getAttribute('editing-item-id')).toBe(n);
	});

	it('Esc closes focus mode and returns focus to the tile that opened it', () => {
		grid().tiles.get(a).click();
		expect(focusCard()).toBeTruthy();
		key(document.body, 'Escape');
		expect(isFocusModeOpen(editor)).toBe(false);
		expect(focusCard()).toBeNull();
		expect(editor.nav.page).toBe('Workspace');
		expect(document.activeElement).toBe(grid().tiles.get(a));
	});

	it('Esc while a modal dialog is open leaves focus mode open', () => {
		grid().tiles.get(a).click();
		const dialog = document.createElement('div');
		dialog.id = 'modal-dialog';
		document.body.appendChild(dialog);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(focusCard()).toBeTruthy();
		dialog.remove();
	});

	it('the close button closes; focus returns to the specimen letter when that opened it', () => {
		openGlyph(a, editor, { origin: 'specimen' });
		/** @type {HTMLButtonElement} */ (document.querySelector('.focus-mode__close')).click();
		expect(focusCard()).toBeNull();
		const active = document.activeElement;
		// Either the specimen letter (when it renders) or the grid tile.
		expect(active?.getAttribute('data-item-id') === a || active === grid().tiles.get(a)).toBe(
			true
		);
	});

	it('prev/next walk the grid order and disable at the ends', () => {
		grid().tiles.get(A).click();
		const prev = /** @type {HTMLButtonElement} */ (document.querySelector('.focus-mode__prev'));
		const next = /** @type {HTMLButtonElement} */ (document.querySelector('.focus-mode__next'));
		expect(prev.disabled).toBe(true);
		next.click();
		expect(editor.selectedGlyphID).toBe(B);
		expect(canvas().getAttribute('editing-item-id')).toBe(B);
		expect(document.querySelector('.focus-mode__char').textContent).toBe('B');
		expect(prev.disabled).toBe(false);
		prev.click();
		expect(canvas().getAttribute('editing-item-id')).toBe(A);

		// Last glyph of the 62 view ('9')
		stepFocusGlyph(61, editor);
		expect(editor.selectedGlyphID).toBe('glyph-0x39');
		expect(next.disabled).toBe(true);
		expect(stepFocusGlyph(1, editor)).toBe(false);
	});

	it('Esc and close leave the history alone (opening is not an edit)', () => {
		const before = editor.history.queue.length;
		grid().tiles.get(a).click();
		key(document.body, 'Escape');
		expect(editor.history.queue.length).toBe(before);
	});

	it('regression: existing canvas tool shortcuts still work inside focus mode', () => {
		grid().tiles.get(a).click();
		key(document.body, 'm');
		expect(editor.selectedTool).toBe('newRectangle');
		key(document.body, 'v');
		expect(editor.selectedTool).toBe('resize');
		key(document.body, 'h');
		expect(editor.selectedTool).toBe('newPath');
	});

	it('Ctrl+Z inside focus mode undoes the last edit to the glyph', () => {
		grid().tiles.get(a).click();
		const glyph = editor.project.getItem(a);
		glyph.advanceWidth = 777;
		editor.history.addState('Changed advance');
		// Real keyboards send Control down first; the canvas handler tracks it.
		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }));
		document.body.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
		);
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));
		expect(editor.project.getItem(a).advanceWidth).toBe(600);
	});

	it('glyph names read like flow-06', () => {
		expect(glyphDisplayName(editor, a)).toBe('Latin small a');
		expect(glyphDisplayName(editor, A)).toBe('Latin capital A');
		expect(glyphDisplayName(editor, 'glyph-0x30')).toBe('Digit zero');
	});
});

// --------------------------------------------------------------
// #17 Tool pill and inspector
// --------------------------------------------------------------

describe('Focus mode: tool pill (#17)', () => {
	it('each button calls the real tool and the active state follows', () => {
		grid().tiles.get(a).click();
		const map = {
			select: 'pathEdit',
			pen: 'newPath',
			'add-point': 'pathAddPoint',
			rectangle: 'newRectangle',
			oval: 'newOval',
			hand: 'pan',
		};
		Object.entries(map).forEach(([button, tool]) => {
			pillButton(button).click();
			expect(editor.selectedTool).toBe(tool);
			expect(pillButton(button).getAttribute('aria-pressed')).toBe('true');
			const pressed = document.querySelectorAll('.focus-pill__tool[aria-pressed="true"]');
			expect(pressed.length).toBe(1);
		});
	});

	it('mirrors tools chosen by the existing keyboard shortcuts', () => {
		grid().tiles.get(a).click();
		key(document.body, 'o');
		expect(pillButton('oval').getAttribute('aria-pressed')).toBe('true');
		key(document.body, 'v');
		expect(pillButton('select').getAttribute('aria-pressed')).toBe('true');
	});

	it('every button has a name and a tooltip with its shortcut', () => {
		grid().tiles.get(a).click();
		document.querySelectorAll('.focus-pill__tool').forEach((button) => {
			expect(button.getAttribute('aria-label')).toBeTruthy();
			expect(button.getAttribute('title')).toMatch(/ · /);
		});
		expect(pillButton('pen').title).toBe('Pen · H');
	});

	it('keys pressed on the pill do not reach the canvas shortcuts', () => {
		grid().tiles.get(a).click();
		key(pillButton('pen'), 'm');
		expect(editor.selectedTool).toBe('pathEdit');
	});

	it('an empty glyph opens with the pen selected', () => {
		openGlyph('glyph-0x7A', editor);
		expect(editor.selectedTool).toBe('newPath');
		expect(pillButton('pen').getAttribute('aria-pressed')).toBe('true');
	});
});

describe('Focus mode: inspector (#17)', () => {
	it('shows glyph, U+ code and the status chip with a mark and a word', () => {
		grid().tiles.get(a).click();
		expect(document.querySelector('.focus-inspector__glyph').textContent).toBe('a');
		expect(document.querySelector('.focus-inspector__code').textContent).toBe('U+0061');
		const chip = document.querySelector('.focus-inspector__chip');
		expect(chip.getAttribute('data-status')).toBe('kept');
		expect(chip.textContent).toContain('Kept');
		expect(chip.querySelector('.status-mark, [class*="status"]')).toBeTruthy();
		expect(codePointLabel('glyph-0x1F600')).toBe('U+1F600');
	});

	it('a metric field edit is one history entry', () => {
		grid().tiles.get(a).click();
		const before = editor.history.queue.length;
		const input = /** @type {any} */ (document.querySelector('.focus-inspector .singleInput-advanceWidth'));
		input.value = 900;
		input.dispatchEvent(new Event('change'));
		expect(editor.project.getItem(a).advanceWidth).toBe(900);
		expect(editor.history.queue.length).toBe(before + 1);
		expect(editor.history.queue[0].title).toBe('Updated advanceWidth');
	});

	it('Keep / Revert show only for Draft; Keep sets Kept and hides them', () => {
		grid().tiles.get(a).click();
		const actions = /** @type {HTMLElement} */ (document.querySelector('.focus-inspector__actions'));
		expect(actions.hidden).toBe(true);

		editor.glyphStatus.set(a, 'draft', 'agent');
		expect(actions.hidden).toBe(false);
		const revert = document.querySelector('.focus-inspector__revert');
		expect(revert.getAttribute('aria-disabled')).toBe('true');
		expect(revert.getAttribute('title')).toBe(REVERT_UNAVAILABLE_TOOLTIP);

		/** @type {HTMLButtonElement} */ (document.querySelector('.focus-inspector__keep')).click();
		expect(editor.glyphStatus.get(a)).toMatchObject({ status: 'kept', owner: 'user' });
		expect(actions.hidden).toBe(true);
		expect(document.querySelector('.focus-inspector__chip').textContent).toContain('Kept');

		editor.glyphStatus.set(a, 'yours', 'user');
		expect(actions.hidden).toBe(true);
	});

	it('Keep is a no-op unless the glyph is a Draft', () => {
		expect(keepDraft(editor, a)).toBe(false);
		expect(editor.glyphStatus.getStatus(a)).toBe('kept');
	});

	it('Revert without a pre-draft snapshot does nothing', () => {
		editor.glyphStatus.set(a, 'draft', 'agent');
		const before = editor.history.queue.length;
		expect(revertDraft(editor, a)).toBe(false);
		expect(editor.history.queue.length).toBe(before);
		expect(editor.glyphStatus.getStatus(a)).toBe('draft');
	});

	it('Revert with a snapshot is one forward history entry, not time travel', () => {
		editor.nav.page = 'Characters';
		editor.selectedGlyphID = a;
		const preDraft = makeGlyph(a, editor.project, { size: 100, advance: 300 }).save();
		editor.glyphStatus.set(a, 'draft', 'agent');
		const realGet = editor.glyphStatus.get.bind(editor.glyphStatus);
		vi.spyOn(editor.glyphStatus, 'get').mockImplementation((id) => ({ ...realGet(id), preDraft }));
		const before = editor.history.queue.length;
		expect(revertDraft(editor, a)).toBe(true);
		const glyph = editor.project.getItem(a);
		expect(glyph.advanceWidth).toBe(300);
		expect(glyph.maxes.xMax).toBe(140);
		expect(editor.history.queue.length).toBe(before + 1);
		expect(editor.glyphStatus.getStatus(a)).toBe('kept');
	});
});

// --------------------------------------------------------------
// #18 Context strip and Yours
// --------------------------------------------------------------

describe('Focus mode: context strip (#18)', () => {
	it('builds the context string per glyph class', () => {
		expect(contextStringFor('a')).toBe('nnann ooaoo');
		expect(contextStringFor('n')).toBe('nnnnn oonoo');
		expect(contextStringFor('A')).toBe('HHAHH OOAOO');
		expect(contextStringFor('5')).toBe('00500 11511');
		expect(contextStringFor('!')).toBe('n!n o!o');
		expect(charForGlyphID('glyph-0x61')).toBe('a');
	});

	it('renders the current glyph highlighted and missing neighbours as ghosts', () => {
		const svg = makeContextStripSVG(a, editor.project);
		expect(svg.getAttribute('data-font-content')).toBe('');
		const current = svg.querySelectorAll('.focus-strip__ink.is-current');
		expect(current.length).toBe(2);
		expect(svg.querySelectorAll('.focus-strip__ink[data-item-id="glyph-0x6E"]').length).toBe(4);
		// No 'o' in this project: four ghosts, none of them current
		expect(svg.querySelectorAll('.focus-strip__ghost').length).toBe(4);
		expect(svg.querySelectorAll('.focus-strip__ghost.is-current').length).toBe(0);
	});

	it('an empty current glyph is a peach ghost', () => {
		const svg = makeContextStripSVG('glyph-0x7A', editor.project);
		expect(svg.querySelectorAll('.focus-strip__ghost.is-current').length).toBe(2);
	});

	it('is mounted in focus mode with an accessible name and redraws live on itemChanged', async () => {
		grid().tiles.get(a).click();
		const strip = document.querySelector('.focus-strip');
		expect(strip.getAttribute('aria-label')).toBe('a in context');
		const before = strip.querySelector('.is-current').getAttribute('d');
		const glyph = editor.project.getItem(a);
		glyph.shapes[0].pathPoints[2].p.x += 100;
		glyph.changed();
		editor.publish('currentItem', glyph);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(strip.querySelector('.is-current').getAttribute('d')).not.toBe(before);
	});
});

describe('Focus mode: Yours on close (#18)', () => {
	it('an outline change marks the glyph Yours (owner user) on close', () => {
		editor.glyphStatus.set(a, 'draft', 'agent');
		grid().tiles.get(a).click();
		const glyph = editor.project.getItem(a);
		glyph.shapes[0].pathPoints[2].p.y += 50;
		glyph.changed();
		key(document.body, 'Escape');
		expect(editor.glyphStatus.get(a)).toMatchObject({ status: 'yours', owner: 'user' });
	});

	it('no change leaves the status untouched', () => {
		editor.glyphStatus.set(a, 'draft', 'agent');
		grid().tiles.get(a).click();
		key(document.body, 'Escape');
		expect(editor.glyphStatus.getStatus(a)).toBe('draft');
	});

	it('spacing-only changes (advance, left/right bearings) leave the status untouched', () => {
		grid().tiles.get(a).click();
		const glyph = editor.project.getItem(a);
		glyph.leftSideBearing = 120;
		glyph.rightSideBearing = 10;
		glyph.advanceWidth = 999;
		key(document.body, 'Escape');
		expect(editor.glyphStatus.getStatus(a)).toBe('kept');
		expect(editor.glyphStatus.get(a).derived).toBe(true);
	});

	it('a change undone before close leaves the status untouched', () => {
		grid().tiles.get(a).click();
		const glyph = editor.project.getItem(a);
		const original = glyph.shapes[0].pathPoints[2].p.y;
		glyph.shapes[0].pathPoints[2].p.y = original + 50;
		glyph.changed();
		glyph.shapes[0].pathPoints[2].p.y = original;
		glyph.changed();
		key(document.body, 'Escape');
		expect(editor.glyphStatus.get(a).derived).toBe(true);
	});

	it('switching with prev/next settles the glyph that was left', () => {
		grid().tiles.get(A).click();
		const glyph = editor.project.getItem(A);
		glyph.shapes[0].pathPoints[1].p.x += 30;
		glyph.changed();
		stepFocusGlyph(1, editor);
		expect(editor.glyphStatus.getStatus(A)).toBe('yours');
		expect(editor.glyphStatus.get(B).derived).toBe(true);
	});

	it('outlineFingerprint ignores horizontal position but not shape', () => {
		const left = makeGlyph('glyph-0x62', editor.project, { x: 0 });
		const moved = makeGlyph('glyph-0x62', editor.project, { x: 200, advance: 900 });
		const bigger = makeGlyph('glyph-0x62', editor.project, { x: 0, size: 600 });
		expect(outlineFingerprint(left)).toBe(outlineFingerprint(moved));
		expect(outlineFingerprint(left)).not.toBe(outlineFingerprint(bigger));
		expect(outlineFingerprint(false)).toBe('');
	});
});

describe('Focus mode: openFocusMode defaults', () => {
	it('falls back to the All 116 order for punctuation', () => {
		openFocusMode('glyph-0x21', { editor });
		expect(editor.nav.focus.view).toBe('all');
		expect(editor.nav.focus.order.length).toBe(116);
	});
});
