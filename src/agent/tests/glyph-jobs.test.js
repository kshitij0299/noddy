// Glyph jobs (M6 #26): create_glyph / begin_glyph draft a glyph off the
// project, submit_glyph validates it and commits it as ONE history entry.
// These are regression tests near history/undo (protected area).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { ITEM_CHANGED_TOPIC } from '../../project_editor/item_changed.js';
import { createNativeToolSession } from '../native-tools.js';
import { getMutationLog, takeOver } from '../ownership.js';
import { validateToolInput } from '../tool-definitions.js';

const N = 'glyph-0x6E'; // selected (bound) glyph
const O = 'glyph-0x6F'; // another existing glyph
const B = 'glyph-0x62'; // missing Kernel glyph
const copy = (value) => JSON.parse(JSON.stringify(value));
const corner = (x, y) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } });
// Clockwise in y-up font units: outer contours.
const rect = (x1, y1, x2, y2) => ({
	name: 'Rect',
	pathPoints: [corner(x1, y1), corner(x1, y2), corner(x2, y2), corner(x2, y1)],
});
// Tool-format contour (add_paths / replace_paths).
const box = (x1, y1, x2, y2, name = 'Box') => ({
	name,
	points: [
		{ x: x1, y: y1, h1: null, h2: null },
		{ x: x1, y: y2, h1: null, h2: null },
		{ x: x2, y: y2, h1: null, h2: null },
		{ x: x2, y: y1, h1: null, h2: null },
	],
});
const bowtie = {
	name: 'Bowtie',
	points: [
		{ x: 0, y: 0, h1: null, h2: null },
		{ x: 400, y: 400, h1: null, h2: null },
		{ x: 400, y: 0, h1: null, h2: null },
		{ x: 0, y: 400, h1: null, h2: null },
	],
};
const NO_LINEAR = {
	scaleX: null,
	scaleY: null,
	skewX: null,
	skewY: null,
	rotate: null,
	flip: null,
	origin: null,
};

let editor;
let session;
const saved = () => JSON.stringify(editor.project.save());
const rev = () => session.getContext().revision;
const run = (name, input) => session.execute(name, { expectedRevision: rev(), ...input });

function addGlyph(id, shapes, advanceWidth = 600) {
	editor.project.glyphs[id] = new Glyph({ id, parent: editor.project, advanceWidth, shapes });
}

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	try {
		localStorage.clear();
	} catch {
		// Storage is optional for the status store.
	}
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	Object.assign(editor.project.settings.font, {
		upm: 1000,
		ascent: 800,
		descent: -200,
		capHeight: 700,
		xHeight: 500,
		overshoot: 10,
	});
	editor.project.settings.app.autoSave = false;
	editor.nav.page = 'Characters';
	addGlyph(N, [rect(50, 0, 550, 500)]);
	addGlyph(O, [rect(40, -10, 560, 510)]);
	editor.selectedGlyphID = N;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	session = createNativeToolSession();
});

afterEach(() => {
	session.dispose();
	vi.restoreAllMocks();
	getGlyphrStudioApp().projectEditors = [];
});

describe('tool schemas', () => {
	it('validates the job tools and the extended transform', () => {
		const r = 'r';
		expect(validateToolInput('create_glyph', { codePoint: 98, expectedRevision: r }).valid).toBe(
			true
		);
		expect(validateToolInput('create_glyph', { codePoint: 1.5, expectedRevision: r }).valid).toBe(
			false
		);
		expect(
			validateToolInput('submit_glyph', { glyphId: B, expectedRevision: r, note: null }).valid
		).toBe(true);
		expect(
			validateToolInput('add_svg_path', {
				glyphId: B,
				expectedRevision: r,
				d: 'M0 0"/><script>',
				baselineY: null,
			}).valid
		).toBe(false);
		const transform = {
			glyphId: N,
			expectedRevision: r,
			pathIndices: [0],
			dx: 0,
			dy: 0,
			...NO_LINEAR,
		};
		expect(validateToolInput('transform_paths', transform).valid).toBe(true);
		expect(validateToolInput('transform_paths', { ...transform, scaleX: 0 }).valid).toBe(false);
		expect(validateToolInput('transform_paths', { ...transform, flip: 'diagonal' }).valid).toBe(
			false
		);
	});
});

describe('create_glyph', () => {
	it('refuses characters outside the Latin Kernel and existing glyphs', () => {
		const before = saved();
		expect(run('create_glyph', { codePoint: 0x4e00 }).error.code).toBe('OUT_OF_SET');
		expect(run('create_glyph', { codePoint: 0x6e }).error.code).toBe('GLYPH_EXISTS');
		expect(saved()).toBe(before);
		expect(editor.history.queue).toHaveLength(0);
	});

	it('creates nothing until submit, then lands glyph and outlines as one undo step', () => {
		const before = saved();
		const nav = { page: editor.nav.page, selected: editor.selectedItemID, view: copy(editor.view) };
		const created = run('create_glyph', { codePoint: 0x62 });
		expect(created).toMatchObject({ ok: true, glyphId: B, job: { creating: true, char: 'b' } });
		expect(editor.project.glyphs[B]).toBeUndefined();
		expect(run('add_paths', { glyphId: B, paths: [box(60, 0, 140, 760)] }).ok).toBe(true);
		expect(run('set_spacing', { glyphId: B, metric: 'advanceWidth', value: 560 }).ok).toBe(true);
		expect(editor.project.glyphs[B]).toBeUndefined();
		expect(saved()).toBe(before);
		expect(editor.history.queue).toHaveLength(0);

		const submitted = run('submit_glyph', { glyphId: B, note: 'stem for b' });
		expect(submitted).toMatchObject({ ok: true, changed: true, created: true });
		expect(editor.project.glyphs[B].shapes).toHaveLength(1);
		expect(editor.project.glyphs[B].advanceWidth).toBe(560);
		expect(editor.history.length).toBe(1);
		expect(editor.history.queue[1].title).toBe('Agent · b');
		expect(editor.glyphStatus.get(B)).toMatchObject({ status: 'draft', owner: 'agent' });
		// Never navigated or moved the view.
		expect(editor.nav.page).toBe(nav.page);
		expect(editor.selectedItemID).toBe(nav.selected);
		expect(editor.view).toEqual(nav.view);

		editor.history.restoreState();
		expect(editor.project.glyphs[B]).toBeUndefined();
		expect(saved()).toBe(before);
		expect(editor.history.queue).toHaveLength(0);
	});
});

describe('begin_glyph / submit_glyph', () => {
	it('drafts off the project and commits one entry; undo/redo restore exactly', () => {
		const before = saved();
		expect(run('begin_glyph', { glyphId: O })).toMatchObject({ ok: true, glyphId: O });
		expect(
			run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 300, 500)] }).ok
		).toBe(true);
		expect(run('add_paths', { glyphId: O, paths: [box(400, 0, 500, 500, 'Second')] }).ok).toBe(
			true
		);
		expect(
			run('transform_paths', { glyphId: O, pathIndices: [1], dx: 10, dy: 0, ...NO_LINEAR }).ok
		).toBe(true);
		expect(run('delete_paths', { glyphId: O, pathIndices: [1] }).ok).toBe(true);
		// Nothing written yet: the project and history are untouched.
		expect(saved()).toBe(before);
		expect(editor.history.queue).toHaveLength(0);

		expect(run('submit_glyph', { glyphId: O, note: null }).ok).toBe(true);
		const after = saved();
		expect(after).not.toBe(before);
		expect(editor.history.length).toBe(1);
		expect(editor.history.queue).toHaveLength(2); // one whole-project pre/post pair
		expect(editor.project.glyphs[O].shapes.map((shape) => shape.maxes.xMax)).toEqual([300]);

		editor.history.restoreState();
		expect(saved()).toBe(before);
		expect(editor.history.length).toBe(0);
		editor.history.redoState();
		expect(saved()).toBe(after);
		expect(editor.history.length).toBe(1);
	});

	it('rejects invalid geometry with nothing written and keeps the job open', () => {
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [bowtie] });
		const before = saved();
		const queue = [...editor.history.queue];
		const failed = run('submit_glyph', { glyphId: O, note: null });
		expect(failed.ok).toBe(false);
		expect(failed.error.code).toBe('INVALID_OUTLINES');
		expect(failed.error.details.issues.map((issue) => issue.code)).toContain('SELF_INTERSECTION');
		expect(saved()).toBe(before);
		expect(editor.history.queue).toEqual(queue);
		expect(editor.history.redoQueue).toHaveLength(0);
		expect(getMutationLog(editor)).toHaveLength(0);
		expect(editor.glyphStatus.get(O).status).toBe('kept');
		// Fix the draft and submit again.
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 400, 400)] });
		expect(run('submit_glyph', { glyphId: O, note: null }).ok).toBe(true);
		expect(editor.history.length).toBe(1);
	});

	it('returns extents as warnings, not failures', () => {
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 400, 900)] });
		const result = run('submit_glyph', { glyphId: O, note: null });
		expect(result.ok).toBe(true);
		expect(result.warnings.map((issue) => issue.code)).toContain('ABOVE_ASCENDER');
	});

	it('fails JOB_STALE when the glyph changed since begin, writing nothing', () => {
		run('begin_glyph', { glyphId: O });
		run('delete_paths', { glyphId: O, pathIndices: [0] });
		editor.project.glyphs[O].advanceWidth = 700; // a manual change meanwhile
		const before = saved();
		expect(run('submit_glyph', { glyphId: O, note: null }).error.code).toBe('JOB_STALE');
		expect(saved()).toBe(before);
		expect(editor.history.queue).toHaveLength(0);
		expect(run('delete_paths', { glyphId: O, pathIndices: [0] }).error.code).toBe('NO_JOB');
	});

	it('discards the draft after Take over (CANCELLED) and on dispose', () => {
		run('begin_glyph', { glyphId: O });
		takeOver(editor, O);
		expect(run('submit_glyph', { glyphId: O, note: null }).error.code).toBe('CANCELLED');
		expect(editor.history.queue).toHaveLength(0);
		run('begin_glyph', { glyphId: O });
		session.dispose();
		session = createNativeToolSession();
		expect(run('submit_glyph', { glyphId: O, note: null }).error.code).toBe('NO_JOB');
	});

	it('refuses Yours glyphs at begin and checks the lock again at submit', () => {
		editor.glyphStatus.set(O, 'yours', 'user');
		expect(run('begin_glyph', { glyphId: O }).error.code).toBe('LOCKED_YOURS');
		editor.glyphStatus.clear(O);
		run('begin_glyph', { glyphId: O });
		editor.glyphStatus.set(O, 'yours', 'user');
		expect(run('submit_glyph', { glyphId: O, note: null }).error.code).toBe('LOCKED_YOURS');
		expect(editor.history.queue).toHaveLength(0);
	});

	it('needs an open job for the draft-only tools', () => {
		expect(run('delete_paths', { glyphId: O, pathIndices: [0] }).error.code).toBe('NO_JOB');
		expect(run('begin_glyph', { glyphId: B }).error.code).toBe('GLYPH_MISSING');
		expect(run('begin_glyph', { glyphId: 'glyph-0x4E00' }).error.code).toBe('OUT_OF_SET');
	});

	it('leaves selection, view, page and focus alone and emits itemChanged for the glyph', async () => {
		const shape = editor.project.glyphs[N].shapes[0];
		editor.multiSelect.shapes.members = [shape];
		const view = copy(editor.view);
		const input = document.createElement('input');
		document.body.append(input);
		input.focus();
		const changed = [];
		editor.subscribe({
			topic: ITEM_CHANGED_TOPIC,
			subscriberID: 'test-item-changed',
			callback: (data) => changed.push(data.id),
		});
		const publish = vi.spyOn(editor, 'publish');
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 300, 500)] });
		expect(publish).not.toHaveBeenCalled(); // drafts are silent
		expect(run('submit_glyph', { glyphId: O, note: null }).ok).toBe(true);
		await Promise.resolve();
		expect(changed).toEqual([O]);
		expect(publish.mock.calls.map(([topic]) => topic)).not.toContain('currentItem');
		expect(editor.multiSelect.shapes.members).toEqual([shape]);
		expect(editor.selectedItemID).toBe(N);
		expect(editor.nav.page).toBe('Characters');
		expect(editor.view).toEqual(view);
		expect(document.activeElement).toBe(input);
	});

	it('appends one mutation-log entry per job pointing at its history entry', () => {
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 300, 500)] });
		run('submit_glyph', { glyphId: O, note: 'narrower o' });
		const log = getMutationLog(editor);
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({ tool: 'submit_glyph', id: O, summary: 'edit o: narrower o' });
		expect(log[0].historyEntryRef).toBe(editor.history.queue[0]);
	});
});

describe('history around jobs', () => {
	it('keeps manual edits one step each before and after a job', () => {
		const glyph = () => editor.project.glyphs[N];
		glyph().advanceWidth = 610;
		editor.history.addState('manual 1');
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 300, 500)] });
		run('submit_glyph', { glyphId: O, note: null });
		glyph().advanceWidth = 620;
		editor.history.addState('manual 2');
		expect(editor.history.length).toBe(3);

		editor.history.restoreState(); // manual 2
		expect(editor.project.glyphs[N].advanceWidth).toBe(610);
		expect(editor.project.glyphs[O].shapes[0].maxes.xMax).toBe(300);
		editor.history.restoreState(); // the whole job
		expect(editor.project.glyphs[O].shapes[0].maxes.xMax).toBe(560);
		expect(editor.project.glyphs[N].advanceWidth).toBe(610);
		expect(editor.history.length).toBe(1);
	});

	it('announces itemChanged for the job glyph on undo and redo, so tiles and the specimen redraw', async () => {
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 300, 500)] });
		run('submit_glyph', { glyphId: O, note: null });
		await Promise.resolve();
		const changed = [];
		editor.subscribe({
			topic: ITEM_CHANGED_TOPIC,
			subscriberID: 'test-undo-item-changed',
			callback: (data) => changed.push(data.id),
		});
		editor.history.restoreState();
		await Promise.resolve();
		expect(changed).toContain(O);
		changed.length = 0;
		editor.history.redoState();
		await Promise.resolve();
		expect(changed).toContain(O);
	});

	it('restores the glyph status on undo and puts Draft back on redo', async () => {
		editor.glyphStatus.set(O, 'kept', 'user');
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 300, 500)] });
		run('submit_glyph', { glyphId: O, note: null });
		expect(editor.glyphStatus.get(O)).toMatchObject({ status: 'draft', owner: 'agent' });
		editor.history.restoreState();
		await Promise.resolve();
		expect(editor.glyphStatus.get(O)).toMatchObject({ status: 'kept', owner: 'user' });
		editor.history.redoState();
		await Promise.resolve();
		expect(editor.glyphStatus.get(O)).toMatchObject({ status: 'draft', owner: 'agent' });
		editor.history.restoreState();
		await Promise.resolve();
		// Undo replaces the project, so the next request is a new session.
		session.dispose();
		session = createNativeToolSession();
		run('create_glyph', { codePoint: 0x62 });
		run('add_paths', { glyphId: B, paths: [box(60, 0, 140, 760)] });
		run('submit_glyph', { glyphId: B, note: null });
		editor.history.restoreState();
		await Promise.resolve();
		expect(editor.glyphStatus.get(B)).toMatchObject({ status: 'empty', derived: true });
	});

	it('undoes a job from off the editing pages (#53) and clears stale selection (#48)', () => {
		const before = saved();
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 300, 500)] });
		run('submit_glyph', { glyphId: O, note: null });
		editor.nav.page = 'Workspace';
		editor.multiSelect.shapes.members = [editor.project.glyphs[N].shapes[0]];
		editor.history.restoreState();
		expect(saved()).toBe(before);
		expect(editor.nav.page).toBe('Workspace');
		expect(editor.multiSelect.shapes.members).toEqual([]);
	});

	it('round-trips agent-drafted glyphs through .gs2 save/load unchanged in format', () => {
		run('create_glyph', { codePoint: 0x62 });
		run('add_svg_path', { glyphId: B, d: 'M60 40 L60 800 L140 800 L140 40 Z', baselineY: null });
		expect(run('submit_glyph', { glyphId: B, note: null }).ok).toBe(true);
		const data = editor.project.save();
		const text = JSON.stringify(data);
		// No agent/status fields leak into the file.
		expect(text).not.toMatch(/draft|agent|owner/i);
		expect(Object.keys(data.glyphs[B]).sort()).toEqual(
			Object.keys(new Glyph({ id: B, shapes: [rect(0, 0, 1, 1)] }).save()).sort()
		);
		// Load ignores boolean app settings (pre-existing, unrelated to agents),
		// so compare the glyph data and a second save/load cycle.
		const reloaded = new GlyphrStudioProject(copy(data));
		expect(JSON.stringify(reloaded.save().glyphs)).toBe(JSON.stringify(data.glyphs));
		const again = JSON.stringify(reloaded.save());
		expect(JSON.stringify(new GlyphrStudioProject(JSON.parse(again)).save())).toBe(again);
	});
});

describe('draft geometry tools', () => {
	const points = (glyphId, index = 0) =>
		session
			.execute('read_glyphs', { glyphIds: [glyphId], includePaths: true })
			.glyphs[0].paths[index].points.map(({ x, y }) => [x, y]);
	const submitAndRead = (glyphId) => {
		expect(run('submit_glyph', { glyphId, note: null }).ok).toBe(true);
		return points(glyphId);
	};

	it('scales, rotates, skews and flips about the paths centre', () => {
		const transform = (extra) =>
			run('transform_paths', {
				glyphId: O,
				pathIndices: [0],
				dx: 0,
				dy: 0,
				...NO_LINEAR,
				...extra,
			});
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 200, 100)] });
		expect(transform({ scaleX: 2 }).ok).toBe(true); // x 0..200 -> -100..300
		expect(transform({ rotate: 90 }).ok).toBe(true); // about (100, 50)
		expect(submitAndRead(O)).toEqual([
			[150, -150],
			[50, -150],
			[50, 250],
			[150, 250],
		]);
		run('begin_glyph', { glyphId: O });
		run('replace_paths', { glyphId: O, pathIndices: null, paths: [box(0, 0, 100, 100)] });
		expect(transform({ skewX: 45, origin: { x: 0, y: 0 } }).ok).toBe(true);
		expect(submitAndRead(O)).toEqual([
			[0, 0],
			[100, 100],
			[200, 100],
			[100, 0],
		]);
	});

	it('keeps contour direction through a flip', () => {
		const winding = () =>
			session.execute('check_outlines', { glyphId: O }).contours.map((contour) => contour.winding);
		const original = winding();
		run('begin_glyph', { glyphId: O });
		expect(
			run('transform_paths', {
				glyphId: O,
				pathIndices: [0],
				dx: 0,
				dy: 0,
				...NO_LINEAR,
				flip: 'horizontal',
			}).ok
		).toBe(true);
		run('submit_glyph', { glyphId: O, note: null });
		expect(winding()).toEqual(original);
	});

	it('refuses to transform locked geometry', () => {
		editor.project.glyphs[O].shapes[0].pathPoints[0].p.xLock = true;
		run('begin_glyph', { glyphId: O });
		expect(
			run('transform_paths', {
				glyphId: O,
				pathIndices: [0],
				dx: 0,
				dy: 0,
				...NO_LINEAR,
				scaleX: 2,
			}).error.code
		).toBe('LOCKED_GEOMETRY');
	});

	it('imports SVG path data with a y-flip about the baseline, keeping its direction as seen', () => {
		run('create_glyph', { codePoint: 0x62 });
		// SVG y-down; baselineY null = ascender (800): SVG y 800 is the baseline.
		// Clockwise as seen on screen in the SVG, so clockwise (an outer) in the font.
		const result = run('add_svg_path', {
			glyphId: B,
			d: 'M60 0 L140 0 L140 800 L60 800 Z',
			baselineY: null,
		});
		expect(result).toMatchObject({ ok: true, job: { pathCount: 1 } });
		run('submit_glyph', { glyphId: B, note: null });
		const glyph = editor.project.glyphs[B];
		expect(glyph.shapes[0].maxes).toMatchObject({ xMin: 60, xMax: 140, yMin: 0, yMax: 800 });
		const check = session.execute('check_outlines', { glyphId: B });
		expect(check.contours[0].winding).toBe('clockwise');
		expect(run('begin_glyph', { glyphId: B }).ok).toBe(true);
		expect(run('add_svg_path', { glyphId: B, d: 'M0 0 L0 0 Z', baselineY: 0 }).error.code).toBe(
			'INVALID_SVG'
		);
	});

	it('replace_paths puts new contours at the first replaced index', () => {
		addGlyph(O, [rect(0, 0, 10, 10), rect(20, 0, 30, 10), rect(40, 0, 50, 10)]);
		session.dispose();
		session = createNativeToolSession();
		run('begin_glyph', { glyphId: O });
		run('replace_paths', {
			glyphId: O,
			pathIndices: [1],
			paths: [box(100, 0, 110, 10, 'New')],
		});
		run('submit_glyph', { glyphId: O, note: null });
		expect(editor.project.glyphs[O].shapes.map((shape) => shape.maxes.xMin)).toEqual([0, 100, 40]);
	});
});
