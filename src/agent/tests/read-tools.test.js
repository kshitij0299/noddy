import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { LATIN_KERNEL_GROUPS } from '../../project_editor/charset_latin_kernel.js';
import { toolOutput } from '../agent-controller.js';
import { createNativeToolSession } from '../native-tools.js';
import { getMutationLog, handToAgent } from '../ownership.js';
import {
	READ_ONLY_TOOLS,
	RENDER_IMAGES_PER_REQUEST,
	SET_GROUPS,
	TOOL_DEFINITIONS,
} from '../tool-definitions.js';

const N = 'glyph-0x6E';
const O = 'glyph-0x6F';
const copy = (value) => JSON.parse(JSON.stringify(value));
const corner = (x, y) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } });
const rect = (x1, y1, x2, y2, clockwise = true) => {
	const pts = [corner(x1, y1), corner(x1, y2), corner(x2, y2), corner(x2, y1)];
	return { name: 'Rect', pathPoints: clockwise ? pts : pts.reverse() };
};

let editor;
let session;

function addGlyph(id, shapes, advanceWidth = 600) {
	editor.project.glyphs[id] = new Glyph({ id, parent: editor.project, advanceWidth, shapes });
}

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	const font = editor.project.settings.font;
	Object.assign(font, {
		family: 'Test Sans',
		upm: 1000,
		ascent: 800,
		descent: -200,
		capHeight: 700,
		xHeight: 500,
		overshoot: 10,
	});
	editor.project.settings.app.autoSave = false;
	editor.nav.page = 'Characters';
	// n: one clockwise outer contour.
	addGlyph(N, [rect(50, 0, 550, 500)]);
	// o: outer clockwise, counter counter-clockwise (correct).
	addGlyph(O, [rect(40, -10, 560, 510), rect(140, 90, 460, 410, false)]);
	editor.selectedGlyphID = N;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	session = createNativeToolSession();
});

afterEach(() => {
	session.dispose();
	vi.restoreAllMocks();
	getGlyphrStudioApp().projectEditors = [];
});

function observeSideEffects(run) {
	const publish = vi.spyOn(editor, 'publish');
	const before = {
		project: JSON.stringify(editor.project.save()),
		history: editor.history.queue.length,
		redo: editor.history.redoQueue.length,
		page: editor.nav.page,
		focus: editor.nav.focus,
		selected: editor.selectedItemID,
		view: JSON.stringify(editor.view),
		shapes: [...editor.multiSelect.shapes.members],
	};
	const result = run();
	expect(publish).not.toHaveBeenCalled();
	expect(JSON.stringify(editor.project.save())).toBe(before.project);
	expect(editor.history.queue.length).toBe(before.history);
	expect(editor.history.redoQueue.length).toBe(before.redo);
	expect(editor.nav.page).toBe(before.page);
	expect(editor.nav.focus).toBe(before.focus);
	expect(editor.selectedItemID).toBe(before.selected);
	expect(JSON.stringify(editor.view)).toBe(before.view);
	expect(editor.multiSelect.shapes.members).toEqual(before.shapes);
	return result;
}

describe('read tool registry', () => {
	it('lists every read tool and keeps the set groups in step with the Latin Kernel', () => {
		const names = TOOL_DEFINITIONS.map((tool) => tool.name);
		for (const name of READ_ONLY_TOOLS) expect(names).toContain(name);
		expect(SET_GROUPS).toEqual([...LATIN_KERNEL_GROUPS]);
	});
});

describe('read tools have no side effects', () => {
	const calls = [
		['get_context', {}],
		['get_font_spec', {}],
		['get_set_status', { group: null }],
		['render_glyphs', { glyphIds: [N, O], height: null, guides: null }],
		['render_text', { text: 'noon', height: 256, guides: true }],
		['check_outlines', { glyphId: O }],
		['get_mutation_log', { glyphId: null, limit: null }],
		['read_glyphs', { glyphIds: [N], includePaths: true }],
	];
	it.each(calls)('%s', (name, input) => {
		const result = observeSideEffects(() => session.execute(name, input));
		expect(result.ok).toBe(true);
	});
});

describe('get_font_spec and get_context', () => {
	it('returns the font spec with metrics', () => {
		const { spec } = session.execute('get_font_spec', {});
		expect(spec).toMatchObject({
			family: 'Test Sans',
			upm: 1000,
			ascent: 800,
			descent: -200,
			capHeight: 700,
			xHeight: 500,
			overshoot: 10,
			stems: null,
		});
		expect(spec).toHaveProperty('lineGap');
		expect(spec).toHaveProperty('italicAngle');
	});

	it('extends get_context with spec, set and lock, small enough for the relay', () => {
		editor.glyphStatus.set('glyph-0x41', 'yours', 'user');
		const { context } = session.execute('get_context', {});
		expect(context.spec).toMatchObject({ upm: 1000, ascent: 800, xHeight: 500 });
		expect(context.set).toMatchObject({ name: 'Latin Kernel', total: 116, drawn: 2, open: null });
		expect(context.set.yours).toEqual(['glyph-0x41']);
		expect(context.set.statusCounts.yours).toBe(1);
		expect(context.lock).toBeNull();
		expect(JSON.stringify(context).length).toBeLessThan(8000);
	});
});

describe('get_set_status', () => {
	it('reports coverage and per-glyph status, owner and lock', () => {
		editor.glyphStatus.set(O, 'draft', 'agent');
		editor.glyphStatus.set('glyph-0x61', 'yours', 'user');
		const result = session.execute('get_set_status', { group: 'lowercase' });
		expect(result.coverage.total).toBe(116);
		expect(result.coverage.drawn).toBe(2);
		expect(result.glyphs).toHaveLength(26);
		const byId = Object.fromEntries(result.glyphs.map((glyph) => [glyph.glyphId, glyph]));
		expect(byId[N]).toMatchObject({
			char: 'n',
			status: 'kept',
			owner: 'user',
			lock: null,
			exists: true,
		});
		expect(byId[O]).toMatchObject({ status: 'draft', owner: 'agent', lock: null });
		expect(byId['glyph-0x61']).toMatchObject({ status: 'yours', lock: 'yours' });
		expect(byId['glyph-0x7A']).toMatchObject({ status: 'empty', exists: false });
		expect(result.statusCounts).toMatchObject({ kept: 1, draft: 1, yours: 1, empty: 23 });
	});

	it('marks the glyph open in the focus editor', () => {
		editor.nav.focus = { originID: O };
		editor.selectedGlyphID = O;
		const result = session.execute('get_set_status', { group: null });
		expect(result.open).toBe(O);
		expect(result.glyphs.find((glyph) => glyph.glyphId === O).lock).toBe('open');
		expect(result.glyphs).toHaveLength(116);
	});
});

describe('render_glyphs / render_text', () => {
	it('renders glyphs to one PNG of bounded size with a layout', () => {
		const result = session.execute('render_glyphs', {
			glyphIds: [N, O],
			height: null,
			guides: null,
		});
		expect(result.image).toMatch(/^data:image\/png;base64,/);
		expect({
			width: result.width,
			height: result.height,
			scale: result.scale,
			layout: result.layout,
		}).toMatchInlineSnapshot(`
				{
				  "height": 384,
				  "layout": [
				    {
				      "glyphId": "glyph-0x6E",
				      "missing": false,
				      "width": 199,
				      "x": 26,
				    },
				    {
				      "glyphId": "glyph-0x6F",
				      "missing": false,
				      "width": 199,
				      "x": 258,
				    },
				  ],
				  "scale": 0.331,
				  "width": 484,
				}
			`);
		expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1024);
	});

	it('caps the image at 1024 px and shows missing glyphs as a box', () => {
		const result = session.execute('render_text', {
			text: 'nonzero nonzero',
			height: 1024,
			guides: null,
		});
		expect(result.width).toBeLessThanOrEqual(1024);
		expect(result.height).toBeLessThanOrEqual(1024);
		expect(result.layout).toHaveLength(15);
		expect(result.layout.filter((item) => item.missing).map((item) => item.glyphId)).toContain(
			'glyph-0x7A'
		);
	});

	it('draws on a detached canvas from a copy: a bad component link never leaks into the project', () => {
		editor.project.glyphs[N].shapes.push(
			...new Glyph({ shapes: [{ objType: 'ComponentInstance', link: 'comp-0' }] }).shapes
		);
		const shapeCount = editor.project.glyphs[N].shapes.length;
		expect(editor.project.glyphs[N].shapes.at(-1).objType).toBe('ComponentInstance');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const canvases = [];
		const tool = createNativeToolSession({
			makeCanvas: (width, height) => {
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				canvases.push(canvas);
				return canvas;
			},
		});
		const result = tool.execute('render_glyphs', { glyphIds: [N], height: 128, guides: false });
		expect(result.ok).toBe(true);
		// drawGlyph hit the bad link and spliced it, but only from the copy.
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad link'));
		expect(editor.project.glyphs[N].shapes).toHaveLength(shapeCount);
		expect(canvases).toHaveLength(1);
		expect(canvases[0].isConnected).toBe(false);
		expect([canvases[0].width, canvases[0].height]).toEqual([result.width, result.height]);
		tool.dispose();
	});

	it('refuses glyphs and characters outside the set', () => {
		expect(
			session.execute('render_glyphs', { glyphIds: ['glyph-0x4E00'], height: null, guides: null })
				.error.code
		).toBe('OUT_OF_SET');
		// render_text draws out-of-set characters as ghost boxes, like the specimen.
		const text = session.execute('render_text', { text: 'n→o', height: null, guides: null });
		expect(text.ok).toBe(true);
		expect(text.outOfSet).toEqual(['→']);
		expect(text.layout.map((item) => item.missing)).toEqual([false, true, false]);
		expect(session.execute('check_outlines', { glyphId: 'glyph-0x4E00' }).error.code).toBe(
			'OUT_OF_SET'
		);
	});

	it('returns RENDER_LIMIT past the per-request image budget, as a clean tool error', () => {
		const render = () =>
			session.execute('render_glyphs', { glyphIds: [N], height: 64, guides: false });
		for (let index = 0; index < RENDER_IMAGES_PER_REQUEST; index++) expect(render().ok).toBe(true);
		const ninth = render();
		expect(ninth.ok).toBe(false);
		expect(ninth.error.code).toBe('RENDER_LIMIT');
		expect(ninth.image).toBeUndefined();
		expect(
			session.execute('render_text', { text: 'no', height: null, guides: null }).error.code
		).toBe('RENDER_LIMIT');
		// Non-image reads still work, and a new request has a fresh budget.
		expect(session.execute('check_outlines', { glyphId: N }).ok).toBe(true);
		const next = createNativeToolSession();
		expect(next.execute('render_text', { text: 'no', height: null, guides: null }).ok).toBe(true);
		next.dispose();
	});

	it('sends the PNG to the model as an image part, not base64 text', () => {
		const output = toolOutput({
			ok: true,
			width: 1,
			height: 1,
			image: 'data:image/png;base64,iVBORw0K',
		});
		expect(output.type).toBe('content');
		expect(output.value[0].text).not.toContain('iVBORw0K');
		expect(output.value[1]).toEqual({
			type: 'file',
			mediaType: 'image/png',
			data: { type: 'data', data: 'iVBORw0K' },
		});
		expect(toolOutput({ ok: true, glyphs: [] })).toEqual({
			type: 'json',
			value: { ok: true, glyphs: [] },
		});
		expect(toolOutput({ ok: false, image: 'data:image/png;base64,AA==' }).type).toBe('json');
	});
});

describe('check_outlines', () => {
	it('passes a clean glyph', () => {
		const result = session.execute('check_outlines', { glyphId: O });
		expect(result.ok).toBe(true);
		expect(result.clean).toBe(true);
		expect(result.issues).toEqual([]);
		expect(result.contours.map((contour) => contour.winding)).toEqual([
			'clockwise',
			'counterclockwise',
		]);
		expect(result.extents).toMatchObject({
			yMax: 510,
			yMin: -10,
			top: { guide: 'xHeight', delta: 10 },
			bottom: { guide: 'baseline', delta: -10 },
		});
	});

	it('finds winding, self-intersection, duplicate point, speck and extent problems', () => {
		const bowtie = {
			name: 'Bowtie',
			pathPoints: [corner(0, 0), corner(400, 400), corner(400, 0), corner(0, 400)],
		};
		const dupe = rect(500, 0, 700, 300);
		dupe.pathPoints.splice(1, 0, corner(500, 0));
		addGlyph('glyph-0x67', [
			rect(40, -400, 560, 900),
			rect(140, 90, 460, 410), // same direction as its container
			bowtie,
			dupe,
			rect(800, 800, 801, 801),
		]);
		const result = session.execute('check_outlines', { glyphId: 'glyph-0x67' });
		// The tool call succeeded; the glyph has problems.
		expect(result.ok).toBe(true);
		expect(result.error).toBeUndefined();
		expect(result.clean).toBe(false);
		const codes = result.issues.map((issue) => issue.code);
		expect(codes).toEqual(
			expect.arrayContaining([
				'WINDING_SAME_AS_CONTAINER',
				'SELF_INTERSECTION',
				'DUPLICATE_POINTS',
				'SPECK',
				'ABOVE_ASCENDER',
				'BELOW_DESCENDER',
			])
		);
		expect(result.issues.find((issue) => issue.code === 'SELF_INTERSECTION')).toMatchObject({
			pathIndex: 2,
			at: [{ x: 200, y: 200 }],
		});
		expect(result.issues.find((issue) => issue.code === 'WINDING_SAME_AS_CONTAINER')).toMatchObject(
			{
				pathIndex: 1,
				containerIndex: 0,
			}
		);
	});

	it('reports a set glyph that does not exist yet without creating it', () => {
		const result = session.execute('check_outlines', { glyphId: 'glyph-0x71' });
		expect(result).toMatchObject({ ok: true, clean: true, exists: false, issues: [] });
		expect(editor.project.glyphs['glyph-0x71']).toBeUndefined();
	});
});

describe('mutation log', () => {
	it('records each agent write with its history entry and serves it read-only', () => {
		const revision = () => session.getContext().revision;
		session.execute('set_spacing', {
			glyphId: N,
			expectedRevision: revision(),
			metric: 'rightSideBearing',
			value: 70,
		});
		session.execute('transform_paths', {
			glyphId: N,
			expectedRevision: revision(),
			pathIndices: [0],
			dx: 0,
			dy: 10,
		});
		const log = getMutationLog(editor);
		expect(log.map((entry) => [entry.tool, entry.id, entry.summary])).toEqual([
			['set_spacing', N, 'set rightSideBearing to 70'],
			['transform_paths', N, 'move 1 paths'],
		]);
		expect(log[1].historyEntryRef).toBe(editor.history.queue[0]);
		expect(Object.isFrozen(log[0])).toBe(true);
		expect(typeof log[0].ts).toBe('number');

		const read = session.execute('get_mutation_log', { glyphId: N, limit: 1 });
		expect(read.total).toBe(2);
		expect(read.entries).toEqual([
			{ ts: log[1].ts, tool: 'transform_paths', id: N, summary: 'move 1 paths', inHistory: true },
		]);
		editor.history.restoreState();
		const afterUndo = createNativeToolSession();
		expect(
			afterUndo.execute('get_mutation_log', { glyphId: null, limit: null }).entries[1].inHistory
		).toBe(false);
		afterUndo.dispose();
	});

	it('does not log refused or unchanged writes', () => {
		editor.glyphStatus.set(N, 'yours', 'user');
		session.execute('set_spacing', {
			glyphId: N,
			expectedRevision: session.getContext().revision,
			metric: 'rightSideBearing',
			value: 70,
		});
		expect(getMutationLog(editor)).toHaveLength(0);
		handToAgent(editor, N);
		const width = editor.project.glyphs[N].advanceWidth;
		session.execute('set_spacing', {
			glyphId: N,
			expectedRevision: session.getContext().revision,
			metric: 'advanceWidth',
			value: width,
		});
		expect(getMutationLog(editor)).toHaveLength(0);
	});
});
