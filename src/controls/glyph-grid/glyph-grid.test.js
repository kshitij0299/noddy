import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { latinKernelAll } from '../../project_editor/charset_latin_kernel.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { GlyphGrid, openGlyph } from './glyph-grid.js';
import { FAILED_TOOLTIP, GlyphGridTile, tileLabelFor } from './glyph-tile.js';
import { STATUS_LABELS, STATUS_SHAPES, makeStatusMark } from './status-mark.js';

if (!customElements.get('glyph-grid-tile')) customElements.define('glyph-grid-tile', GlyphGridTile);
if (!customElements.get('glyph-grid')) customElements.define('glyph-grid', GlyphGrid);

const A = 'glyph-0x41'; // first tile (uppercase A)
const N = 'glyph-0x4E'; // 14th tile: row 2, column 1 at 13 columns
const a = 'glyph-0x61';
const copy = (value) => JSON.parse(JSON.stringify(value));
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeGlyph(id, parent, size = 1000) {
	return new Glyph({
		id,
		parent,
		advanceWidth: 1088,
		shapes: [
			{
				name: 'Outline',
				pathPoints: [
					[40, 0],
					[size, 0],
					[size, size],
					[40, size],
				].map(([x, y]) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } })),
			},
		],
	});
}

let editor;
let grid;

function key(target, key, init = {}) {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	return event;
}

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.project.settings.app.autoSave = false;
	editor.project.glyphs[A] = makeGlyph(A, editor.project);
	editor.selectedGlyphID = A;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	grid = new GlyphGrid({ editor });
	grid.setAttribute('columns', '13');
	document.body.appendChild(grid);
});

afterEach(() => {
	grid.remove();
	vi.restoreAllMocks();
	getGlyphrStudioApp().projectEditors = [];
});

describe('GlyphGrid: header and views', () => {
	it('renders the heading, the 62 · All 116 pill and 62 tiles by default', () => {
		expect(grid.querySelector('h3').textContent).toBe('Letters & figures');
		expect(grid.querySelector('h3').classList.contains('text-heading')).toBe(true);
		const segments = [...grid.querySelectorAll('.glyph-grid__segment')];
		expect(segments.map((s) => s.textContent)).toEqual(['62', 'All 116']);
		expect(segments.map((s) => s.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
		expect(grid.querySelectorAll('glyph-grid-tile').length).toBe(62);
		expect(grid.getAttribute('data-view')).toBe('default');
	});

	it('"All 116" adds the rest below without reordering the first 62', () => {
		const before = [...grid.querySelectorAll('glyph-grid-tile')].map((t) => t.glyphID);
		grid.querySelector('[data-view="all"]').click();
		const after = [...grid.querySelectorAll('glyph-grid-tile')].map((t) => t.glyphID);
		expect(after.length).toBe(116);
		expect(after.slice(0, 62)).toEqual(before);
		expect(after).toEqual(latinKernelAll().map((e) => e.glyphID));
		expect(grid.segmentAll.getAttribute('aria-pressed')).toBe('true');
		expect(grid.segmentDefault.getAttribute('aria-pressed')).toBe('false');

		grid.querySelector('[data-view="default"]').click();
		expect(grid.querySelectorAll('glyph-grid-tile').length).toBe(62);
	});

	it('labels whitespace characters with a word, not an empty string', () => {
		grid.setView('all');
		const space = grid.tiles.get('glyph-0x20');
		expect(space.labelEl.textContent).toBe('space');
		expect(tileLabelFor({ char: '&', codePoint: 38, hex: '0x26' })).toBe('&');
		expect(grid.tiles.get('glyph-0x26').labelEl.textContent).toBe('&');
	});
});

describe('GlyphGrid: legend', () => {
	it('shows counts from glyphStatus.counts over the visible IDs, hiding zero statuses', () => {
		const items = () =>
			[...grid.legendEl.querySelectorAll('.glyph-grid__legend-item')].map((li) => [
				li.getAttribute('data-status'),
				li.querySelector('.glyph-grid__legend-count').textContent,
			]);
		// A is drawn (derived kept), everything else is empty.
		expect(items()).toEqual([
			['kept', '1'],
			['empty', '61'],
		]);

		editor.glyphStatus.set(a, 'draft', 'agent');
		editor.glyphStatus.set('glyph-0x62', 'failed', 'agent');
		editor.glyphStatus.set('glyph-0x21', 'draft', 'agent'); // "!" is outside the 62 view
		grid.flushRedraws();
		expect(items()).toEqual([
			['kept', '1'],
			['draft', '1'],
			['failed', '1'],
			['empty', '59'],
		]);

		grid.setView('all');
		expect(items()).toEqual([
			['kept', '1'],
			['draft', '2'],
			['failed', '1'],
			['empty', '112'],
		]);
	});

	it('hides the legend while every visible tile has the same status', () => {
		editor.project.glyphs[A] = new Glyph({ id: A, parent: editor.project });
		grid.refreshAll();
		expect(grid.legendEl.hidden).toBe(true); // all Empty (flow-02)
		expect(grid.legendEl.querySelectorAll('li')).toHaveLength(1);

		editor.glyphStatus.set(a, 'draft', 'agent');
		grid.flushRedraws();
		expect(grid.legendEl.hidden).toBe(false);
	});

	it('legend items name the status in text, not colour alone', () => {
		const kept = grid.legendEl.querySelector('[data-status="kept"]');
		expect(kept.getAttribute('aria-label')).toBe('1 Kept');
		expect(kept.getAttribute('title')).toBe('1 Kept');
		expect(kept.querySelector('.glyph-status-mark').getAttribute('data-shape')).toBe('icon');
	});
});

describe('GlyphGridTile: status marks (shape + text, never colour alone)', () => {
	it('every status has a distinct mark shape or icon', () => {
		const signatures = Object.keys(STATUS_SHAPES).map((status) => {
			const mark = makeStatusMark(status);
			const icon = mark.querySelector('.material-symbols-rounded');
			return `${mark.getAttribute('data-shape')}:${icon ? icon.textContent : ''}`;
		});
		expect(new Set(signatures).size).toBe(signatures.length);
		expect(makeStatusMark('kept').textContent).toBe('check_circle');
		expect(makeStatusMark('yours').textContent).toBe('edit');
		expect(makeStatusMark('failed').textContent).toBe('error');
		expect(makeStatusMark('draft').getAttribute('data-shape')).toBe('dot');
		expect(makeStatusMark('drafting').getAttribute('data-shape')).toBe('spinner');
		expect(makeStatusMark('queued').getAttribute('data-shape')).toBe('ring');
	});

	it('tiles expose "char · Status" as their accessible name and the mark shape', () => {
		const tile = grid.tiles.get(a);
		expect(tile.getAttribute('aria-label')).toBe('a · Empty');
		expect(tile.getAttribute('role')).toBe('option');

		editor.glyphStatus.set(a, 'draft', 'agent');
		grid.flushRedraws();
		expect(tile.getAttribute('data-status')).toBe('draft');
		expect(tile.getAttribute('aria-label')).toBe('a · Draft');
		expect(tile.mark.getAttribute('data-shape')).toBe('dot');
		expect(tile.hasAttribute('title')).toBe(false);

		editor.glyphStatus.set(a, 'failed', 'agent');
		grid.flushRedraws();
		expect(tile.getAttribute('aria-label')).toBe('a · Failed');
		expect(tile.mark.textContent).toBe('error');
		expect(tile.getAttribute('title')).toBe(FAILED_TOOLTIP);

		editor.glyphStatus.set(a, 'yours', 'user');
		grid.flushRedraws();
		expect(tile.getAttribute('aria-label')).toBe(`a · ${STATUS_LABELS.yours}`);
		expect(tile.mark.textContent).toBe('edit');
	});

	it('renders a ghost for an empty glyph and project outlines for a drawn one', () => {
		const empty = grid.tiles.get(a);
		expect(empty.hasAttribute('data-ghost')).toBe(true);
		expect(empty.querySelector('.glyph-grid-tile__ghost')).not.toBeNull();
		expect(empty.querySelector('svg')).toBeNull();

		const drawn = grid.tiles.get(A);
		expect(drawn.hasAttribute('data-ghost')).toBe(false);
		const svg = drawn.querySelector('svg[data-font-content]');
		expect(svg).not.toBeNull();
		expect(svg.getAttribute('height')).toBe('40');
		expect(svg.querySelector('path').getAttribute('d')).toBe(editor.project.getItem(A).svgPathData);
		expect(drawn.getAttribute('aria-label')).toBe('A · Kept');
	});
});

describe('GlyphGrid: column thresholds', () => {
	it('derives 13 / 10 / 6 columns from the 72px tile minimum and 4px gaps', () => {
		const css = fs.readFileSync(path.resolve(__dirname, 'glyph-grid.css'), 'utf8');
		const tile = 72;
		const gap = 4;
		const widthFor = (cols) => cols * tile + (cols - 1) * gap;
		expect(widthFor(13)).toBe(984); // 1440 viewport, agent panel open
		expect(widthFor(10)).toBe(756);
		expect(css).toContain(`@container (max-width: ${widthFor(13) - 1}px)`);
		expect(css).toContain(`@container (max-width: ${widthFor(10) - 1}px)`);
		// 1024 viewport (24px gutters) is 976px: narrower than 13 columns need
		expect(1024 - 48).toBeLessThan(widthFor(13));
		expect(1024 - 48).toBeGreaterThanOrEqual(widthFor(10));
	});
});

describe('GlyphGrid: keyboard navigation', () => {
	it('uses a roving tabindex with the selected tile focusable', () => {
		const tiles = [...grid.querySelectorAll('glyph-grid-tile')];
		expect(tiles.filter((t) => t.getAttribute('tabindex') === '0').length).toBe(1);
		expect(grid.tiles.get(A).getAttribute('tabindex')).toBe('0');
		expect(grid.tiles.get(A).getAttribute('aria-selected')).toBe('true');
		expect(grid.tiles.get(A).hasAttribute('selected')).toBe(true);
	});

	it('arrows move in reading order, wrap rows, Home/End jump', () => {
		const tile = (id) => grid.tiles.get(id);
		tile(A).focus();

		key(tile(A), 'ArrowRight');
		expect(grid.selectedID).toBe('glyph-0x42');
		expect(document.activeElement).toBe(tile('glyph-0x42'));

		key(tile('glyph-0x42'), 'ArrowDown');
		expect(grid.selectedID).toBe('glyph-0x4F'); // B + 13 = O

		key(tile('glyph-0x4F'), 'ArrowUp');
		expect(grid.selectedID).toBe('glyph-0x42');

		// Left at the start of row 2 wraps to the end of row 1
		grid.select(N, { focus: true });
		key(tile(N), 'ArrowLeft');
		expect(grid.selectedID).toBe('glyph-0x4D'); // M, 13th tile
		key(tile('glyph-0x4D'), 'ArrowRight');
		expect(grid.selectedID).toBe(N);

		key(tile(N), 'End');
		expect(grid.selectedID).toBe('glyph-0x39'); // "9", the 62nd tile
		key(tile('glyph-0x39'), 'ArrowRight');
		expect(grid.selectedID).toBe(A); // wraps around to the first tile
		key(tile(A), 'ArrowLeft');
		expect(grid.selectedID).toBe('glyph-0x39');
		key(tile('glyph-0x39'), 'Home');
		expect(grid.selectedID).toBe(A);

		// Up on the first row stays put
		key(tile(A), 'ArrowUp');
		expect(grid.selectedID).toBe(A);
	});

	it('Enter and Space open the selected glyph through openGlyph; click selects and opens', () => {
		grid.openGlyph = vi.fn();
		grid.select(a, { focus: true });
		const enter = key(grid.tiles.get(a), 'Enter');
		expect(grid.openGlyph).toHaveBeenCalledWith(a);
		expect(enter.defaultPrevented).toBe(true);

		key(grid.tiles.get(a), ' ');
		expect(grid.openGlyph).toHaveBeenCalledTimes(2);

		grid.tiles.get(N).click();
		expect(grid.selectedID).toBe(N);
		expect(grid.openGlyph).toHaveBeenLastCalledWith(N);
	});

	it('openGlyph(id) selects the glyph and opens it in focus mode (M3)', () => {
		const navigate = vi.spyOn(editor, 'navigate').mockImplementation(() => {});
		openGlyph(a, editor, { origin: 'grid', order: grid.visibleIDs, view: grid.view });
		expect(editor.selectedGlyphID).toBe(a);
		expect(editor.nav.page).toBe('Characters');
		expect(editor.nav.focus).toMatchObject({ originID: a, origin: 'grid', view: 'default' });
		expect(editor.nav.focus.order).toEqual(grid.visibleIDs);
		expect(navigate).toHaveBeenCalledTimes(1);
		editor.nav.focus = null;
	});

	it('grid keys never reach document-level canvas shortcuts; Ctrl/Cmd combos still do', () => {
		const seen = [];
		const listener = (event) => seen.push(event.key);
		document.addEventListener('keydown', listener);
		try {
			const tile = grid.tiles.get(A);
			key(tile, 'ArrowRight');
			key(tile, 'Delete');
			key(tile, 'v');
			key(tile, 'z', { ctrlKey: true });
			key(tile, 's', { metaKey: true });
		} finally {
			document.removeEventListener('keydown', listener);
		}
		expect(seen).toEqual(['z', 's']);
	});
});

describe('GlyphGrid: live updates', () => {
	it('re-fetches a tile by ID on itemChanged', async () => {
		const tile = grid.tiles.get(a);
		expect(tile.hasAttribute('data-ghost')).toBe(true);

		editor.project.glyphs[a] = makeGlyph(a, editor.project, 600);
		editor.publish('currentItem', editor.project.glyphs[a]);
		await flushMicrotasks();
		grid.flushRedraws();

		expect(tile.hasAttribute('data-ghost')).toBe(false);
		expect(tile.querySelector('svg path').getAttribute('d')).toBe(
			editor.project.glyphs[a].svgPathData
		);
		expect(tile.getAttribute('aria-label')).toBe('a · Kept');
		expect(grid.legendEl.querySelector('[data-status="kept"] .glyph-grid__legend-count').textContent).toBe('2');
	});

	it('refreshes every tile when a whole-project undo swaps the project object', async () => {
		// Draw "a" as a whole-project history step (pre / post state), then undo it.
		editor.history.addWholeProjectChangePreState('Drew a');
		editor.project.glyphs[a] = makeGlyph(a, editor.project, 600);
		editor.history.addWholeProjectChangePostState();
		editor.publish('currentItem', editor.project.glyphs[a]);
		await flushMicrotasks();
		grid.flushRedraws();
		expect(grid.tiles.get(a).hasAttribute('data-ghost')).toBe(false);

		const before = editor.project;
		editor.history.restoreState();
		await flushMicrotasks();
		grid.flushRedraws();
		expect(editor.project).not.toBe(before);
		expect(grid.tiles.get(a).hasAttribute('data-ghost')).toBe(true);
		expect(grid.tiles.get(A).hasAttribute('data-ghost')).toBe(false);
	});

	it('updates the tile and legend on glyphStatusChanged, coalesced per frame', () => {
		const render = vi.spyOn(grid.tiles.get(a), 'render');
		editor.glyphStatus.set(a, 'queued', 'agent');
		editor.glyphStatus.set(a, 'drafting', 'agent');
		expect(render).not.toHaveBeenCalled();
		grid.flushRedraws();
		expect(render).toHaveBeenCalledTimes(1);
		expect(grid.tiles.get(a).getAttribute('data-status')).toBe('drafting');
		expect(grid.tiles.get(a).mark.getAttribute('data-shape')).toBe('spinner');
		expect(grid.legendEl.querySelector('[data-status="drafting"]')).not.toBeNull();
	});

	it('stops listening after it is removed from the document', () => {
		grid.remove();
		const tile = grid.tiles.get(a);
		const render = vi.spyOn(tile, 'render');
		editor.glyphStatus.set(a, 'draft', 'agent');
		grid.flushRedraws();
		expect(render).not.toHaveBeenCalled();
		expect(editor.subscribers.glyphStatusChanged?.[grid._subscriberID]).toBeUndefined();
	});
});

describe('GlyphGrid: review actions on tiles (M7 #29)', () => {
	const tileOf = (id) => grid.tiles.get(id);
	const actions = (id) =>
		[...tileOf(id).querySelectorAll('[data-tile-action]')].map((b) =>
			b.getAttribute('data-tile-action')
		);

	it('a Draft tile offers Keep (and Revert with a pre-draft outline); Failed offers Retry', () => {
		editor.glyphStatus.set(A, 'draft', 'agent');
		grid.refreshTile(A);
		expect(actions(A)).toEqual(['keep']);
		editor.glyphStatus.set(A, 'draft', 'agent', { preDraft: { glyph: null } });
		grid.refreshTile(A);
		expect(actions(A)).toEqual(['keep', 'revert']);
		editor.glyphStatus.set(a, 'failed', 'agent');
		grid.refreshTile(a);
		expect(actions(a)).toEqual(['retry']);
		expect(actions(N)).toEqual([]);
		const keep = tileOf(A).querySelector('[data-tile-action="keep"]');
		expect(keep.getAttribute('aria-label')).toBe('Keep A');
		expect(keep.getAttribute('tabindex')).toBe('-1');
	});

	it('Keep on a tile is one history entry and never opens the glyph', () => {
		const open = vi.spyOn(grid, 'openGlyph');
		editor.glyphStatus.set(A, 'draft', 'agent');
		grid.refreshTile(A);
		const before = editor.history.length;
		/** @type {HTMLButtonElement} */ (tileOf(A).querySelector('[data-tile-action="keep"]')).click();
		expect(editor.glyphStatus.getStatus(A)).toBe('kept');
		expect(editor.history.length).toBe(before + 1);
		expect(open).not.toHaveBeenCalled();
	});

	it('Retry on a tile is announced for the agent panel', () => {
		const seen = vi.fn();
		document.addEventListener('noddy-retry-glyphs', seen);
		editor.glyphStatus.set(a, 'failed', 'agent');
		grid.refreshTile(a);
		/** @type {HTMLButtonElement} */ (tileOf(a).querySelector('[data-tile-action="retry"]')).click();
		document.removeEventListener('noddy-retry-glyphs', seen);
		expect(seen).toHaveBeenCalledTimes(1);
		expect(seen.mock.calls[0][0].detail).toEqual({ ids: [a] });
	});
});
