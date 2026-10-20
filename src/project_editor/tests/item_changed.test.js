import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../project_editor.js';
import { createNativeToolSession } from '../../agent/native-tools.js';
import {
	ITEM_CHANGED_TOPIC,
	createDebouncedRedraw,
	itemIdForPublish,
	subscribeToItemChanged,
} from '../item_changed.js';

const ID = 'glyph-0x6E';
const OTHER = 'glyph-0x6F';
const copy = (value) => JSON.parse(JSON.stringify(value));
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeGlyph(id, parent) {
	return new Glyph({
		id,
		parent,
		advanceWidth: 1088,
		shapes: [
			{
				name: 'Outline',
				pathPoints: [
					[40, 0],
					[1048, 0],
					[1048, 1039],
					[40, 1039],
				].map(([x, y]) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } })),
			},
		],
	});
}

let editor;
let events;

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.nav.page = 'Characters';
	editor.project.settings.app.autoSave = false;
	editor.project.glyphs[ID] = makeGlyph(ID, editor.project);
	editor.project.glyphs[OTHER] = makeGlyph(OTHER, editor.project);
	editor.selectedGlyphID = ID;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	events = [];
	editor.subscribe({
		topic: ITEM_CHANGED_TOPIC,
		subscriberID: 'test-item-changed',
		callback: (data) => events.push(data),
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	getGlyphrStudioApp().projectEditors = [];
});

/** The same sequence the canvas path-edit tool uses for a point move. */
function manualPointMove(dx) {
	const point = editor.project.glyphs[ID].shapes[0].pathPoints[0];
	point.p.x += dx;
	editor.publish('currentPathPoint', point);
	editor.history.addState(`Moved point`);
}

describe('itemChanged topic', () => {
	it('emits once with the glyph id for a manual edit', async () => {
		manualPointMove(10);
		expect(events).toEqual([]); // deferred: never re-enters the publishing action
		await flushMicrotasks();
		expect(events).toEqual([{ id: ID }]);
	});

	it('emits once for an agent commit, with no duplicate for the related publishes', async () => {
		const session = createNativeToolSession();
		const result = session.execute('set_spacing', {
			glyphId: ID,
			metric: 'rightSideBearing',
			value: 60,
			expectedRevision: session.getContext().revision,
		});
		expect(result.ok).toBe(true);
		await flushMicrotasks();
		expect(events).toEqual([{ id: ID }]);
		session.dispose();
	});

	it('emits once for undo and once for redo with the restored item id', async () => {
		manualPointMove(10);
		manualPointMove(10);
		await flushMicrotasks();
		events.length = 0;

		editor.history.restoreState();
		await flushMicrotasks();
		expect(events).toEqual([{ id: ID }]);
		expect(editor.project.glyphs[ID].shapes[0].pathPoints[0].p.x).toBe(50);

		events.length = 0;
		editor.history.redoState();
		await flushMicrotasks();
		expect(events).toEqual([{ id: ID }]);
		expect(editor.project.glyphs[ID].shapes[0].pathPoints[0].p.x).toBe(60);
	});

	it('emits for undo and redo of an agent (whole-project) commit', async () => {
		const session = createNativeToolSession();
		session.execute('set_spacing', {
			glyphId: ID,
			metric: 'rightSideBearing',
			value: 60,
			expectedRevision: session.getContext().revision,
		});
		await flushMicrotasks();
		events.length = 0;
		editor.history.restoreState();
		await flushMicrotasks();
		expect(events).toEqual([{ id: ID }]);
		events.length = 0;
		editor.history.redoState();
		await flushMicrotasks();
		expect(events).toEqual([{ id: ID }]);
		session.dispose();
	});

	it('does not change selection, view, or focus when emitting', async () => {
		const view = copy(editor.view);
		const focused = document.activeElement;
		manualPointMove(5);
		await flushMicrotasks();
		expect(editor.selectedItemID).toBe(ID);
		expect(editor.view).toEqual(view);
		expect(document.activeElement).toBe(focused);
	});

	it('resolves the edited item from the data, not the selection', () => {
		const other = editor.project.glyphs[OTHER];
		expect(itemIdForPublish(editor, 'currentItem', other)).toBe(OTHER);
		expect(itemIdForPublish(editor, 'currentPath', other.shapes[0])).toBe(OTHER);
		expect(itemIdForPublish(editor, 'currentPathPoint.p', other.shapes[0].pathPoints[0].p)).toBe(
			OTHER
		);
		expect(itemIdForPublish(editor, 'whichGlyphIsSelected', OTHER)).toBe(false);
		expect(itemIdForPublish(editor, 'editCanvasView', {})).toBe(false);
	});

	it('does not emit for selection or view topics', async () => {
		editor.publish('whichGlyphIsSelected', OTHER);
		editor.publish('editCanvasView', editor.view);
		await flushMicrotasks();
		expect(events).toEqual([]);
	});

	it('emits one event per distinct id within one action', async () => {
		editor.publish('currentItem', editor.project.glyphs[ID]);
		editor.publish('currentItem', editor.project.glyphs[OTHER]);
		editor.publish('currentItem', editor.project.glyphs[ID]);
		await flushMicrotasks();
		expect(events).toEqual([{ id: ID }, { id: OTHER }]);
	});
});

describe('debounced redraw helper', () => {
	it('coalesces N schedules for one id into 1 call per animation frame', () => {
		const frames = [];
		vi.stubGlobal('requestAnimationFrame', (fn) => frames.push(fn));
		vi.stubGlobal('cancelAnimationFrame', () => {});
		const redraw = vi.fn();
		const { schedule } = createDebouncedRedraw(redraw);
		for (let i = 0; i < 25; i++) schedule(ID);
		schedule(OTHER);
		expect(redraw).not.toHaveBeenCalled();
		expect(frames.length).toBe(1);
		frames[0]();
		expect(redraw.mock.calls).toEqual([[ID], [OTHER]]);
		vi.unstubAllGlobals();
	});

	it('honours a configurable delay and can be cancelled', () => {
		vi.useFakeTimers();
		const redraw = vi.fn();
		const debounced = createDebouncedRedraw(redraw, { delay: 50 });
		debounced.schedule(ID);
		debounced.schedule(ID);
		vi.advanceTimersByTime(49);
		expect(redraw).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(redraw).toHaveBeenCalledTimes(1);

		debounced.schedule(ID);
		debounced.cancel();
		vi.advanceTimersByTime(100);
		expect(redraw).toHaveBeenCalledTimes(1);
	});

	it('subscribeToItemChanged filters by id, coalesces a burst of edits, and unsubscribes', async () => {
		vi.useFakeTimers();
		const redraw = vi.fn();
		const unsubscribe = subscribeToItemChanged(editor, {
			subscriberID: 'tile-n',
			ids: [ID],
			delay: 16,
			callback: redraw,
		});
		for (let i = 0; i < 10; i++) {
			editor.publish('currentItem', editor.project.glyphs[ID]);
			editor.publish('currentItem', editor.project.glyphs[OTHER]);
			await Promise.resolve(); // each loop is its own action → its own itemChanged
		}
		vi.advanceTimersByTime(16);
		expect(redraw.mock.calls).toEqual([[ID]]);

		unsubscribe();
		editor.publish('currentItem', editor.project.glyphs[ID]);
		await Promise.resolve();
		vi.advanceTimersByTime(16);
		expect(redraw).toHaveBeenCalledTimes(1);
	});
});
