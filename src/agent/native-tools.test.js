import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../app/main.js';
import { Glyph } from '../project_data/glyph.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../project_editor/project_editor.js';
import { shouldExportItem } from '../formats_io/otf/font_export.js';
import { createNativeToolSession } from './native-tools.js';
import { TOOL_DEFINITIONS, validateToolInput } from './tool-definitions.js';
import { InputNumber } from '../controls/input-number/input_number.js';
import { makeSingleInput } from '../panels/cards.js';
import { Guide } from '../project_editor/guide.js';

if (!customElements.get('input-number')) {
	customElements.define('input-number', InputNumber);
}

const ID = 'glyph-0x6E';
const copy = (value) => JSON.parse(JSON.stringify(value));
const points = [
	{ x: 40, y: 0, h1: null, h2: null },
	{ x: 1048, y: 0, h1: null, h2: null },
	{ x: 1048, y: 1039, h1: null, h2: null },
	{ x: 40, y: 1039, h1: null, h2: null },
];
let editor;
let session;
const selected = () => editor.project.glyphs[ID];
const args = (extra = {}) => ({
	glyphId: ID,
	expectedRevision: session.getContext().revision,
	...extra,
});
const spacing = (value, options) =>
	session.execute('set_spacing', args({ metric: 'rightSideBearing', value }), options);

beforeEach(() => {
	document.title = 'Noddy';
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.nav.page = 'Characters';
	editor.project.settings.app.autoSave = false;
	editor.project.glyphs[ID] = new Glyph({
		id: ID,
		parent: editor.project,
		advanceWidth: 1088,
		shapes: [
			{
				name: 'Outline',
				pathPoints: points.map((point) => ({
					p: { coord: { x: point.x, y: point.y } },
					h1: { use: false },
					h2: { use: false },
				})),
			},
		],
	});
	editor.selectedGlyphID = ID;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	session = createNativeToolSession();
});

afterEach(() => {
	session.dispose();
	vi.restoreAllMocks();
	getGlyphrStudioApp().projectEditors = [];
});

describe('native agent tool boundary', () => {
	it('has a static registry and rejects arbitrary or malformed writes', () => {
		expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
			'get_context',
			'read_glyphs',
			'set_spacing',
			'transform_paths',
			'add_paths',
		]);
		const before = copy(editor.project.save());
		for (const value of [NaN, Infinity, '60', 40000]) {
			expect(spacing(value).error.code).toBe('INVALID_ARGUMENTS');
		}
		expect(session.execute('eval', { code: 'anything' }).ok).toBe(false);
		expect(session.execute('set_spacing', args({ metric: '__proto__', value: 1 })).ok).toBe(false);
		expect(validateToolInput('get_context', { permission: 'all' }).valid).toBe(false);
		expect(editor.project.save()).toEqual(before);
		expect(editor.history.length).toBe(0);
	});

	it('reads other glyphs without materializing missing items or mutating history', () => {
		const before = copy(editor.project.save());
		const result = session.execute('read_glyphs', {
			glyphIds: [ID, 'glyph-0x42'],
			includePaths: true,
		});
		expect(result.glyphs[0]).toMatchObject({
			advanceWidth: 1088,
			leftSideBearing: 40,
			rightSideBearing: 40,
			pathsIncluded: true,
		});
		expect(result.glyphs[0].paths[0].points[0]).toMatchObject({ x: 40, y: 0, h1: null, h2: null });
		expect(result.glyphs[1]).toEqual({ glyphId: 'glyph-0x42', exists: false });
		expect(editor.project.save()).toEqual(before);
		expect(editor.history.length).toBe(0);
	});

	it('bounds serialized read results and reports omitted geometry explicitly', () => {
		const ids = [];
		for (let i = 65; i < 73; i++) {
			const id = `glyph-0x${i.toString(16).toUpperCase()}`;
			const glyph = new Glyph({ id, parent: editor.project });
			for (let path = 0; path < 128; path++)
				glyph.addOneShape({
					name: '💖'.repeat(500),
					pathPoints: points.map((point) => ({
						p: { coord: { x: point.x, y: point.y } },
						h1: { use: false },
						h2: { use: false },
					})),
				});
			editor.project.glyphs[id] = glyph;
			ids.push(id);
		}
		const result = session.execute('read_glyphs', { glyphIds: ids, includePaths: true });
		expect(result.ok).toBe(true);
		expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(120000);
		expect(result.glyphs.some((glyph) => !glyph.pathsIncluded)).toBe(true);
		expect(result.glyphs.every((glyph) => glyph.pathCount === 128)).toBe(true);
	});

	it('sets RSB natively and preserves outlines, with one native undo and redo', () => {
		const before = copy(editor.project.save());
		const result = spacing(60);
		expect(result.ok).toBe(true);
		expect(selected().advanceWidth).toBe(1108);
		expect(selected().leftSideBearing).toBe(40);
		expect(selected().save().shapes).toEqual(before.glyphs[ID].shapes);
		expect(editor.history.length).toBe(1);
		const after = copy(editor.project.save());
		editor.history.restoreState();
		expect(editor.project.save()).toEqual(before);
		editor.history.redoState();
		expect(editor.project.save()).toEqual(after);
	});

	it('keeps empty-glyph reads finite and preserves false settings and imported versions in undo', () => {
		selected().shapes = [];
		editor.project.settings.project.initialVersion = 'older-version';
		editor.project.settings.app.autoSave = false;
		const result = session.execute('read_glyphs', { glyphIds: [ID], includePaths: true });
		expect(Object.values(result.glyphs[0].bounds).every(Number.isFinite)).toBe(true);
		const before = copy(editor.project.save());
		expect(spacing(100).ok).toBe(true);
		editor.history.restoreState();
		expect(editor.project.save()).toEqual(before);
	});

	it('rebuilds inspector handlers so manual edits after an agent command target the live glyph', () => {
		document.body.insertAdjacentHTML('beforeend', '<div id="editor-page__panel"></div>');
		editor.nav.panel = 'Attributes';
		expect(spacing(60).ok).toBe(true);
		const input = document.querySelector('.singleInput-rightSideBearing');
		expect(input).toBeTruthy();
		input.value = 75;
		input.dispatchEvent(new Event('change'));
		expect(selected().rightSideBearing).toBe(75);
	});

	it('rebinds real inspector change handlers after native undo and redo even after session disposal', () => {
		document.body.insertAdjacentHTML('beforeend', '<div id="editor-page__panel"></div>');
		editor.nav.panel = 'Attributes';
		expect(spacing(60).ok).toBe(true);
		session.dispose();
		const inputAfterAgent = document.querySelector('.singleInput-rightSideBearing');
		editor.history.restoreState();
		const inputAfterUndo = document.querySelector('.singleInput-rightSideBearing');
		expect(inputAfterUndo).not.toBe(inputAfterAgent);
		editor.history.redoState();
		const inputAfterRedo = document.querySelector('.singleInput-rightSideBearing');
		expect(inputAfterRedo).not.toBe(inputAfterUndo);
		expect(selected().rightSideBearing).toBe(60);
		inputAfterRedo.value = 75;
		inputAfterRedo.dispatchEvent(new Event('change'));
		expect(selected().rightSideBearing).toBe(75);
		// The manual edit is its own native undo step, so Undo returns to the agent value
		// and re-renders the inspector with a freshly bound input.
		editor.history.restoreState();
		expect(selected().rightSideBearing).toBe(60);
		const inputAfterManualUndo = document.querySelector('.singleInput-rightSideBearing');
		expect(inputAfterManualUndo).not.toBe(inputAfterRedo);
		inputAfterManualUndo.value = 45;
		inputAfterManualUndo.dispatchEvent(new Event('change'));
		expect(selected().rightSideBearing).toBe(45);
	});

	it('preserves transient export eligibility for glyphs, components, and ligatures across history', () => {
		editor.project.settings.app.exportUneditedItems = false;
		for (const [group, id] of [
			['glyphs', 'glyph-0x42'],
			['components', 'comp-agent'],
			['ligatures', 'liga-0x66-0x69'],
		]) {
			editor.project[group][id] = new Glyph({ id, parent: editor.project });
			expect(shouldExportItem(editor.project[group][id])).toBe(false);
		}
		selected().wasCreatedThisSession = false;
		selected().hasChangedThisSession = false;
		expect(spacing(60).ok).toBe(true);
		expect(selected().wasCreatedThisSession).toBe(false);
		expect(selected().hasChangedThisSession).toBe(true);
		editor.history.restoreState();
		editor.history.redoState();
		expect(selected().wasCreatedThisSession).toBe(false);
		expect(selected().hasChangedThisSession).toBe(true);
		expect(shouldExportItem(selected())).toBe(true);
		for (const [group, id] of [
			['glyphs', 'glyph-0x42'],
			['components', 'comp-agent'],
			['ligatures', 'liga-0x66-0x69'],
		]) {
			expect(editor.project[group][id].wasCreatedThisSession).toBe(true);
			expect(editor.project[group][id].hasChangedThisSession).toBe(false);
			expect(shouldExportItem(editor.project[group][id])).toBe(false);
		}
	});

	it('moves outlines for LSB while retaining RSB, and rebinds selected paths/points', () => {
		const shape = selected().shapes[0];
		editor.multiSelect.shapes.members = [shape];
		editor.multiSelect.points.members = [shape.pathPoints[0]];
		const result = session.execute('set_spacing', args({ metric: 'leftSideBearing', value: 70 }));
		expect(result.ok).toBe(true);
		expect(selected().leftSideBearing).toBe(70);
		expect(selected().rightSideBearing).toBe(40);
		expect(selected().advanceWidth).toBe(1118);
		expect(editor.multiSelect.shapes.members[0]).toBe(selected().shapes[0]);
		expect(editor.multiSelect.points.members[0]).toBe(selected().shapes[0].pathPoints[0]);
	});

	it('rejects a stale revision after an unpublished manual mutation or selection change', () => {
		const old = args({ metric: 'rightSideBearing', value: 60 });
		selected().advanceWidth += 5;
		expect(session.execute('set_spacing', old).error.code).toBe('STALE_REVISION');
		const readAgain = args({ metric: 'rightSideBearing', value: 60 });
		editor.multiSelect.shapes.members = [selected().shapes[0]];
		expect(session.execute('set_spacing', readAgain).error.code).toBe('STALE_REVISION');
		expect(spacing(60).ok).toBe(true);
	});

	it('does not retarget when the user changes glyph or project', () => {
		const old = args({ metric: 'rightSideBearing', value: 60 });
		editor.selectedGlyphID = 'glyph-0x41';
		expect(session.execute('set_spacing', old).error.code).toBe('OUT_OF_SCOPE');
		expect(selected().advanceWidth).toBe(1088);
		editor._project = new GlyphrStudioProject(copy(editor.project.save()));
		expect(session.execute('get_context', {}).error.code).toBe('PROJECT_CHANGED');
	});

	it('honors path and control-point locks and rejects dependent glyph effects', () => {
		selected().shapes[0].xLock = true;
		expect(
			session.execute('set_spacing', args({ metric: 'leftSideBearing', value: 60 })).error.code
		).toBe('LOCKED_GEOMETRY');
		expect(spacing(60).ok).toBe(true); // advance-only edits do not move a locked path
		selected().shapes[0].xLock = false;
		selected().shapes[0].pathPoints[0].h1.yLock = true;
		expect(
			session.execute('transform_paths', args({ pathIndices: [0], dx: 0, dy: 10 })).error.code
		).toBe('LOCKED_GEOMETRY');
		selected().usedIn = ['glyph-0x41'];
		expect(spacing(80).error.code).toBe('DEPENDENT_GLYPHS');
	});

	it('rejects components and malformed/bounded geometry without partial changes', () => {
		const before = copy(selected().save());
		expect(
			session.execute('transform_paths', args({ pathIndices: [0, 5], dx: 25, dy: 10 })).error.code
		).toBe('MISSING_PATH');
		expect(selected().save()).toEqual(before);
		expect(
			session.execute('transform_paths', args({ pathIndices: [0], dx: 32767, dy: 0 })).error.code
		).toBe('GEOMETRY_BOUNDS');
		expect(selected().save()).toEqual(before);
		selected().addOneShape({ objType: 'ComponentInstance', link: 'glyph-0x41' });
		expect(spacing(60).error.code).toBe('UNSUPPORTED_COMPONENT');
	});

	it('adds editable closed paths to an empty selected glyph and preserves cubic handles', () => {
		selected().shapes = [];
		selected().advanceWidth = 0;
		const curve = copy(points);
		curve[0].h2 = { x: 200, y: 50 };
		curve[1].h1 = { x: 900, y: 50 };
		const result = session.execute(
			'add_paths',
			args({ paths: [{ name: 'Drawn outline', points: curve }] })
		);
		expect(result.ok).toBe(true);
		expect(selected().shapes[0].pathPoints).toHaveLength(4);
		expect(selected().shapes[0].pathPoints[0].h2.x).toBe(200);
		expect(selected().shapes[0].pathPoints[0].h1.use).toBe(false);
		expect(selected().shapes[0].svgPathData).toBeTruthy();
		expect(session.execute('set_spacing', args({ metric: 'advanceWidth', value: 1088 })).ok).toBe(
			true
		);
		expect(editor.history.length).toBe(2);
	});

	it('translates selected indices exactly once, keeps advance, and updates cached bounds', () => {
		const oldBounds = selected().maxes;
		const result = session.execute('transform_paths', args({ pathIndices: [0], dx: 20, dy: -10 }));
		expect(result.ok).toBe(true);
		expect(selected().advanceWidth).toBe(1088);
		expect(selected().maxes.xMin).toBe(oldBounds.xMin + 20);
		expect(selected().maxes.yMax).toBe(oldBounds.yMax - 10);
		expect(
			session.execute('transform_paths', args({ pathIndices: [0, 0], dx: 20, dy: 0 })).error.code
		).toBe('INVALID_ARGUMENTS');
	});

	it('rolls back live state, selections, saved indication, and history on a commit failure', () => {
		const original = selected();
		editor.multiSelect.shapes.members = [original.shapes[0]];
		const before = copy(editor.project.save());
		const redo = editor.history.redoQueue;
		vi.spyOn(editor.history, 'addWholeProjectChangePostState').mockImplementation(() => {
			throw new Error('Injected history failure');
		});
		expect(spacing(60).ok).toBe(false);
		expect(editor.project.save()).toEqual(before);
		expect(selected()).toBe(original);
		expect(editor.multiSelect.shapes.members).toEqual([original.shapes[0]]);
		expect(editor.history.length).toBe(0);
		expect(editor.history.redoQueue).toEqual(redo);
		expect(document.title).toBe('Noddy');
		expect(document.getElementById('actionButtonUndo').disabled).toBe(true);
	});

	it('does not execute cancelled commands and rolls back cancellation during the transaction', () => {
		const controller = new AbortController();
		controller.abort();
		expect(spacing(60, { signal: controller.signal }).error.code).toBe('CANCELLED');
		const during = new AbortController();
		const original = editor.history.addWholeProjectChangePreState.bind(editor.history);
		vi.spyOn(editor.history, 'addWholeProjectChangePreState').mockImplementation((title) => {
			original(title);
			during.abort();
		});
		expect(spacing(60, { signal: during.signal }).error.code).toBe('CANCELLED');
		expect(selected().advanceWidth).toBe(1088);
		expect(editor.history.length).toBe(0);
	});

	it('deduplicates host-issued call IDs and rejects conflicting reuse', () => {
		const input = args({ metric: 'rightSideBearing', value: 60 });
		const first = session.execute('set_spacing', input, { callId: 'call-1' });
		const retry = session.execute('set_spacing', input, { callId: 'call-1' });
		expect(first.ok).toBe(true);
		expect(retry).toMatchObject({ ok: true, duplicate: true });
		expect(editor.history.length).toBe(1);
		expect(
			session.execute('set_spacing', { ...input, value: 70 }, { callId: 'call-1' }).error.code
		).toBe('CALL_ID_CONFLICT');
	});

	it('only offers inline undo for the latest unchanged edit', () => {
		spacing(60);
		selected().advanceWidth += 5;
		expect(session.undoLast().error.code).toBe('UNDO_NOT_LATEST');
		expect(selected().advanceWidth).toBe(1113);
		session.dispose();
		session = createNativeToolSession();
		spacing(80);
		expect(session.undoLast()).toEqual({ ok: true, undone: true });
		expect(selected().advanceWidth).toBe(1113);
	});

	it('preserves existing manual history through two agent edits, native undo and redo', () => {
		selected().advanceWidth = 1098;
		editor.history.addState('Manual advance');
		const manualEntry = editor.history.queue[0];
		expect(spacing(60).ok).toBe(true);
		expect(spacing(80).ok).toBe(true);
		expect(editor.history.length).toBe(3);
		expect(editor.history.queue.at(-1)).toBe(manualEntry);
		editor.history.restoreState();
		expect(selected().rightSideBearing).toBe(60);
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(1098);
		editor.history.redoState();
		expect(selected().rightSideBearing).toBe(60);
		editor.history.redoState();
		expect(selected().rightSideBearing).toBe(80);
	});

	it('keeps prior history for a different glyph intact across native undo and redo', () => {
		editor.selectedGlyphID = 'glyph-0x41';
		editor.selectedItem.advanceWidth = 700;
		editor.history.addState('Manual A edit');
		const manualEntry = editor.history.queue[0];
		editor.selectedGlyphID = ID;
		session.dispose();
		session = createNativeToolSession();
		expect(spacing(60).ok).toBe(true);
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(1088);
		expect(editor.project.glyphs['glyph-0x41'].advanceWidth).toBe(700);
		expect(editor.history.queue[0]).toBe(manualEntry);
		editor.history.redoState();
		expect(selected().advanceWidth).toBe(1108);
		expect(editor.project.glyphs['glyph-0x41'].advanceWidth).toBe(700);
	});

	it('detaches native restored snapshots before a later edit, preserving future redo', () => {
		spacing(60);
		editor.history.restoreState();
		editor.history.redoState();
		session.dispose();
		session = createNativeToolSession();
		expect(spacing(80).ok).toBe(true);
		editor.history.restoreState();
		expect(selected().rightSideBearing).toBe(60);
		editor.history.restoreState();
		expect(selected().rightSideBearing).toBe(40);
		editor.history.redoState();
		expect(selected().rightSideBearing).toBe(60);
		editor.history.redoState();
		expect(selected().rightSideBearing).toBe(80);
	});

	it('keeps a native redo snapshot isolated from a subsequent manual edit', () => {
		spacing(60);
		editor.history.restoreState();
		editor.history.redoState();
		selected().advanceWidth = 1200;
		editor.history.addState('Manual width after redo');
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(1108);
	});

	it('keeps an undone multi-command snapshot isolated from a subsequent manual edit', () => {
		spacing(60);
		spacing(80);
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(1108);
		selected().advanceWidth = 1200;
		editor.history.addState('Manual width after undo');
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(1108);
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(1088);
		editor.history.redoState();
		expect(selected().advanceWidth).toBe(1108);
	});

	it('deeply isolates whole-project snapshots, including arrays on unrelated glyphs', () => {
		editor.project.glyphs['glyph-0x41'] = new Glyph({
			id: 'glyph-0x41',
			usedIn: ['glyph-0x42'],
			parent: editor.project,
		});
		spacing(60);
		const post = editor.history.queue[0].itemState;
		const pre = editor.history.queue[1].itemState;
		editor.project.glyphs['glyph-0x41'].usedIn.push('glyph-0x43');
		selected().shapes[0].pathPoints[0].p.x = 300;
		expect(pre.glyphs['glyph-0x41'].usedIn).toEqual(['glyph-0x42']);
		expect(post.glyphs['glyph-0x41'].usedIn).toEqual(['glyph-0x42']);
		expect(post.glyphs[ID].shapes[0].pathPoints[0].p.x).toBe(40);
	});

	it('runs native save notifications after commit so autosave has the changed font', () => {
		editor.project.settings.app.autoSave = true;
		const app = getGlyphrStudioApp();
		const previousDev = app.settings.dev.mode;
		app.settings.dev.mode = false;
		const saved = [];
		vi.spyOn(app, 'addAutoSaveState').mockImplementation(() => saved.push(selected().advanceWidth));
		expect(spacing(60).ok).toBe(true);
		expect(saved.at(-1)).toBe(1108);
		app.settings.dev.mode = previousDev;
	});
});

describe('inspector numeric edits and native history', () => {
	const commit = (input, value) => {
		input.numberInput.value = String(value);
		input.numberInput.dispatchEvent(new Event('change', { bubbles: true }));
	};

	it('records a real numeric inspector edit after agent redo as its own native undo step', () => {
		document.body.insertAdjacentHTML('beforeend', '<div id="editor-page__panel"></div>');
		editor.nav.panel = 'Attributes';
		selected().shapes = [];
		selected().advanceWidth = 0;
		const rectangle = points.map((point) => ({
			...point,
			x: point.x === 40 ? 50 : 590,
		}));
		expect(
			session.execute('add_paths', args({ paths: [{ name: 'Outline', points: rectangle }] })).ok
		).toBe(true);
		expect(session.execute('set_spacing', args({ metric: 'advanceWidth', value: 720 })).ok).toBe(
			true
		);
		expect(session.undoLast().ok).toBe(true);
		editor.history.redoState();
		expect(selected().rightSideBearing).toBe(130);
		const input = document.querySelector('.singleInput-rightSideBearing');
		commit(input, 150);
		expect(selected().advanceWidth).toBe(740);
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(720);
		editor.history.redoState();
		expect(selected().advanceWidth).toBe(740);
	});

	it('records nothing when the committed value is unchanged', () => {
		const input = makeSingleInput(selected(), 'advanceWidth', 'currentItem', 'input-number');
		document.body.appendChild(input);
		const before = editor.history.queue.length;
		commit(input, selected().advanceWidth);
		expect(editor.history.queue.length).toBe(before);
	});

	it('records exactly one entry per increment and per repeated edit', () => {
		const input = makeSingleInput(selected(), 'advanceWidth', 'currentItem', 'input-number');
		document.body.appendChild(input);
		const before = editor.history.queue.length;
		input.upArrow.dispatchEvent(new MouseEvent('click'));
		expect(selected().advanceWidth).toBe(1089);
		expect(editor.history.queue.length).toBe(before + 1);
		expect(editor.history.queue[0].title).toBe('Updated advanceWidth');
		commit(input, 1100);
		commit(input, 1120);
		expect(editor.history.queue.length).toBe(before + 3);
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(1100);
		editor.history.restoreState();
		expect(selected().advanceWidth).toBe(1089);
	});

	it('records nothing for a locked value', () => {
		const path = selected().shapes[0];
		path.lock('x');
		const input = makeSingleInput(path, 'x', 'currentPath', 'input-number');
		document.body.appendChild(input);
		const before = editor.history.queue.length;
		const x = path.x;
		commit(input, x + 50);
		expect(path.x).toBe(x);
		expect(editor.history.queue.length).toBe(before);
	});

	it('does not add selected-item history for guide location changes', () => {
		const guide = new Guide({ name: 'Test guide', location: 100 });
		const input = makeSingleInput(guide, 'location', 'editCanvasView', 'input-number');
		document.body.appendChild(input);
		const before = editor.history.queue.length;
		commit(input, 250);
		expect(guide.location).toBe(250);
		expect(editor.history.queue.length).toBe(before);
	});
});
