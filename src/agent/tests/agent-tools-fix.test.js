// PR A (agent tools fix): copy_paths, boolean_paths, transform pivots, the gate's
// pre-existing rule and hints, optional fields, and render/check/read seeing the draft.
// Near history/undo (protected area): every job still lands as one undo step.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { createNativeToolSession } from '../native-tools.js';
import { ISSUE_HINTS, checkGlyphOutlines } from '../outline-check.js';
import {
	TOOL_DEFINITIONS,
	normalizeToolInput,
	optionalNullableSchema,
	validateToolInput,
} from '../tool-definitions.js';

const N = 'glyph-0x6E'; // selected (bound) glyph
const A = 'glyph-0x41'; // source glyph with a slash
const B = 'glyph-0x42'; // target glyph
const copy = (value) => JSON.parse(JSON.stringify(value));
const corner = (x, y) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } });
// Clockwise in y-up font units: an outer contour.
const rect = (x1, y1, x2, y2, name = 'Rect') => ({
	name,
	pathPoints: [corner(x1, y1), corner(x1, y2), corner(x2, y2), corner(x2, y1)],
});
// The owner's graffiti slash: one 4-point contour that crosses itself, laid over the letter.
const slash = {
	name: 'Slash',
	pathPoints: [corner(-50, 150), corner(650, 350), corner(650, 150), corner(-50, 350)],
};

let editor;
let session;
const saved = () => JSON.stringify(editor.project.save());
const rev = () => session.getContext().revision;
const run = (name, input) => session.execute(name, { expectedRevision: rev(), ...input });
const glyph = (id) => editor.project.glyphs[id];

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
	addGlyph(A, [rect(0, 0, 600, 700, 'Stem'), copy(slash)]);
	addGlyph(B, [rect(50, 0, 550, 700, 'Bowl')]);
	editor.selectedGlyphID = N;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	session = createNativeToolSession();
});

afterEach(() => {
	session.dispose();
	getGlyphrStudioApp().projectEditors = [];
});

describe('optional means optional (bug 26)', () => {
	it('accepts absent nullable fields and still rejects absent required ones', () => {
		expect(validateToolInput('render_glyphs', { glyphIds: [A] }).valid).toBe(true);
		expect(validateToolInput('render_glyphs', { glyphIds: [A], height: null }).valid).toBe(true);
		expect(validateToolInput('render_glyphs', {}).error).toMatch(/missing glyphIds/);
		expect(validateToolInput('submit_glyph', { glyphId: A }).error).toMatch(/expectedRevision/);
		// A nested nullable (point handles) may be absent too.
		const paths = [
			{
				name: 'T',
				points: [
					{ x: 0, y: 0 },
					{ x: 9, y: 9 },
					{ x: 9, y: 0 },
				],
			},
		];
		expect(validateToolInput('add_paths', { glyphId: A, expectedRevision: 'r', paths }).valid).toBe(
			true
		);
	});

	it('normalizes absent nullable fields to null at every depth', () => {
		expect(normalizeToolInput('render_glyphs', { glyphIds: [A] })).toEqual({
			glyphIds: [A],
			height: null,
			guides: null,
		});
		const input = normalizeToolInput('add_paths', {
			glyphId: A,
			expectedRevision: 'r',
			paths: [{ name: 'T', points: [{ x: 0, y: 0 }] }],
		});
		expect(input.paths[0].points[0]).toEqual({ x: 0, y: 0, h1: null, h2: null });
	});

	it('runs tools in the tab with the optional fields left out', () => {
		expect(session.execute('render_glyphs', { glyphIds: [A] }).ok).toBe(true);
		expect(session.execute('get_mutation_log', {}).ok).toBe(true);
		expect(session.execute('read_glyphs', { glyphIds: [A] }).glyphs[0].pathsIncluded).toBe(false);
		expect(run('begin_glyph', { glyphId: B }).ok).toBe(true);
		expect(run('transform_paths', { glyphId: B, pathIndices: [0], dx: 10 }).ok).toBe(true);
		expect(glyph(B).shapes[0].maxes.xMin).toBe(50); // a draft: the font is unchanged
	});

	it('lists nullable fields as not required for MCP clients, without touching the registry', () => {
		const render = TOOL_DEFINITIONS.find((tool) => tool.name === 'render_glyphs');
		const schema = optionalNullableSchema(render.inputSchema);
		expect(schema.required).toEqual(['glyphIds']);
		expect(render.inputSchema.required).toEqual(['glyphIds', 'height', 'guides']);
		const add = optionalNullableSchema(
			TOOL_DEFINITIONS.find((tool) => tool.name === 'add_paths').inputSchema
		);
		expect(add.properties.paths.items.properties.points.items.required).toEqual(['x', 'y']);
	});
});

describe('transform_paths pivots', () => {
	it('rotates about the baseline below the centre with baseline-center', () => {
		run('begin_glyph', { glyphId: B });
		run('transform_paths', { glyphId: B, pathIndices: [0], rotate: 180, pivot: 'baseline-center' });
		const job = session.execute('read_glyphs', { glyphIds: [B], includePaths: false }).glyphs[0];
		// Turned about (300, 0): the bowl now hangs below the baseline.
		expect(job.bounds).toMatchObject({ xMin: 50, xMax: 550, yMin: -700, yMax: 0 });
		expect(job.source).toBe('draft');
	});

	it('mirrors about an explicit point, and the origin wins over the pivot', () => {
		run('begin_glyph', { glyphId: B });
		run('transform_paths', {
			glyphId: B,
			pathIndices: [0],
			flip: 'horizontal',
			pivot: 'baseline-center',
			origin: { x: 0, y: 0 },
		});
		const draft = session.execute('read_glyphs', { glyphIds: [B], includePaths: false });
		expect(draft.glyphs[0].bounds).toMatchObject({ xMin: -550, xMax: -50 });
	});
});

describe('copy_paths', () => {
	it('copies contours from another glyph into the draft, transformed, leaving the source alone', () => {
		const before = JSON.stringify(glyph(A).save());
		run('begin_glyph', { glyphId: B });
		const result = run('copy_paths', {
			glyphId: B,
			sourceGlyphId: A,
			sourcePathIndices: [1],
			dx: 100,
			scaleX: 0.5,
		});
		expect(result.ok).toBe(true);
		expect(result.newPathIndices).toEqual([1]);
		expect(result.glyph.paths[1].name).toBe('Slash');
		// Scaled about its own centre (300) to half width, then moved 100 right.
		expect(result.glyph.paths.length).toBe(2);
		const draft = session.execute('read_glyphs', { glyphIds: [B], includePaths: true }).glyphs[0];
		const xs = draft.paths[1].points.map((point) => point.x);
		expect(Math.min(...xs)).toBe(225);
		expect(Math.max(...xs)).toBe(575);
		expect(JSON.stringify(glyph(A).save())).toBe(before);
		expect(glyph(B).shapes.length).toBe(1);
	});

	it('reads a source whose paths are locked, and the copies are editable', () => {
		glyph(A).shapes[1].xLock = true;
		run('begin_glyph', { glyphId: B });
		expect(run('copy_paths', { glyphId: B, sourceGlyphId: A, sourcePathIndices: [1] }).ok).toBe(
			true
		);
		expect(run('transform_paths', { glyphId: B, pathIndices: [1], dx: 5 }).ok).toBe(true);
	});

	it('needs a job, a real source path, and stays within the copy bound', () => {
		expect(run('copy_paths', { glyphId: B, sourceGlyphId: A }).error.code).toBe('NO_JOB');
		run('begin_glyph', { glyphId: B });
		expect(
			run('copy_paths', { glyphId: B, sourceGlyphId: A, sourcePathIndices: [9] }).error.code
		).toBe('MISSING_PATH');
		expect(run('copy_paths', { glyphId: B, sourceGlyphId: 'glyph-0x4E00' }).error.code).toBe(
			'OUT_OF_SET'
		);
		const many = Array.from({ length: 33 }, (_, index) => rect(index, 0, index + 10, 10));
		addGlyph('glyph-0x43', many);
		expect(run('copy_paths', { glyphId: B, sourceGlyphId: 'glyph-0x43' }).error.code).toBe(
			'GEOMETRY_LIMIT'
		);
	});

	it("copies from the source's open draft in this session", () => {
		run('begin_glyph', { glyphId: A });
		run('delete_paths', { glyphId: A, pathIndices: [0] });
		run('begin_glyph', { glyphId: B });
		const result = run('copy_paths', { glyphId: B, sourceGlyphId: A });
		expect(result.newPathIndices).toEqual([1]);
	});
});

describe('boolean_paths', () => {
	it('cuts the self-crossing slash out of the letter so the job submits clean, as one undo step', async () => {
		run('begin_glyph', { glyphId: B });
		run('copy_paths', { glyphId: B, sourceGlyphId: A, sourcePathIndices: [1] });
		const cut = await run('boolean_paths', {
			glyphId: B,
			operation: 'subtract',
			pathIndices: [0],
			withPathIndices: [1],
		});
		expect(cut.ok).toBe(true);
		expect(cut.newPathIndices.length).toBeGreaterThanOrEqual(1);
		const check = session.execute('check_outlines', { glyphId: B });
		expect(check).toMatchObject({ source: 'draft', submitWouldPass: true });
		expect(check.issues.filter((issue) => issue.code !== 'ABOVE_ASCENDER')).toEqual([]);
		const before = saved();
		const submit = run('submit_glyph', { glyphId: B, note: 'slash from A' });
		expect(submit.ok).toBe(true);
		expect(editor.history.length).toBe(1);
		// The slash's crossing (300, 250) is now an outline vertex of the cut bowl.
		const vertices = glyph(B).shapes.flatMap((shape) =>
			shape.pathPoints.map((p) => [p.p.x, p.p.y])
		);
		expect(vertices).toContainEqual([300, 250]);
		editor.history.restoreState();
		expect(saved()).toBe(before);
	});

	it('exclude keeps the slash outside the letter and cuts it inside, with outers clockwise', async () => {
		run('begin_glyph', { glyphId: B });
		run('copy_paths', { glyphId: B, sourceGlyphId: A, sourcePathIndices: [1] });
		const result = await run('boolean_paths', {
			glyphId: B,
			operation: 'exclude',
			pathIndices: [0],
			withPathIndices: [1],
		});
		expect(result.ok).toBe(true);
		const check = session.execute('check_outlines', { glyphId: B });
		expect(check.submitWouldPass).toBe(true);
		// The cut bowl plus the two ends of the slash that stick out: all outers.
		expect(check.contours.length).toBeGreaterThanOrEqual(3);
		expect(check.contours.every((contour) => contour.winding === 'clockwise')).toBe(true);
	});

	it('union with no second set untangles a self-crossing contour', async () => {
		run('begin_glyph', { glyphId: A });
		const result = await run('boolean_paths', {
			glyphId: A,
			operation: 'union',
			pathIndices: [1],
			withPathIndices: null,
		});
		expect(result.ok).toBe(true);
		const check = session.execute('check_outlines', { glyphId: A });
		expect(check.issues.some((issue) => issue.code === 'SELF_INTERSECTION')).toBe(false);
	});

	it('keeps a counter a counter: subtracting a box inside makes a hole that winds the other way', async () => {
		run('begin_glyph', { glyphId: B });
		run('add_paths', {
			glyphId: B,
			paths: [
				{
					name: 'Hole',
					points: [
						{ x: 200, y: 200, h1: null, h2: null },
						{ x: 200, y: 400, h1: null, h2: null },
						{ x: 400, y: 400, h1: null, h2: null },
						{ x: 400, y: 200, h1: null, h2: null },
					],
				},
			],
		});
		await run('boolean_paths', {
			glyphId: B,
			operation: 'subtract',
			pathIndices: [0],
			withPathIndices: [1],
		});
		const check = session.execute('check_outlines', { glyphId: B });
		expect(check.contours.map((contour) => contour.winding).sort()).toEqual([
			'clockwise',
			'counterclockwise',
		]);
		expect(check.submitWouldPass).toBe(true);
	});

	it('refuses bad sets with nothing changed', async () => {
		expect(
			(await run('boolean_paths', { glyphId: B, operation: 'union', pathIndices: [0] })).error.code
		).toBe('NO_JOB');
		run('begin_glyph', { glyphId: B });
		const draft = () =>
			JSON.stringify(session.execute('read_glyphs', { glyphIds: [B], includePaths: true }));
		const before = draft();
		const bad = [
			{ operation: 'subtract', pathIndices: [0], withPathIndices: null },
			{ operation: 'union', pathIndices: [0], withPathIndices: [0] },
			{ operation: 'union', pathIndices: [0], withPathIndices: [7] },
		];
		for (const input of bad) {
			const result = await run('boolean_paths', { glyphId: B, ...input });
			expect(result.ok).toBe(false);
			expect(['INVALID_ARGUMENTS', 'MISSING_PATH']).toContain(result.error.code);
		}
		expect(draft()).toBe(before);
	});
});

describe('the gate: pre-existing issues warn, new ones reject with a hint (bugs 22, 27)', () => {
	it("never blocks a job on the user's own self-crossing slash", () => {
		run('begin_glyph', { glyphId: A });
		run('transform_paths', { glyphId: A, pathIndices: [0], dx: 5 });
		const submit = run('submit_glyph', { glyphId: A });
		expect(submit.ok).toBe(true);
		const warning = submit.warnings.find((issue) => issue.code === 'SELF_INTERSECTION');
		expect(warning).toMatchObject({ preExisting: true, pathIndex: 1 });
	});

	it('rejects a self-crossing contour the job introduced, naming a fix', () => {
		run('begin_glyph', { glyphId: B });
		run('copy_paths', { glyphId: B, sourceGlyphId: A, sourcePathIndices: [1] });
		const submit = run('submit_glyph', { glyphId: B });
		expect(submit.error.code).toBe('INVALID_OUTLINES');
		const issue = submit.error.details.issues.find((item) => item.code === 'SELF_INTERSECTION');
		expect(issue).toMatchObject({ preExisting: false });
		expect(issue.hint).toMatch(/boolean_paths/);
		expect(session.execute('check_outlines', { glyphId: B }).submitWouldPass).toBe(false);
	});

	it('moving a pre-existing problem contour makes it new', () => {
		run('begin_glyph', { glyphId: A });
		run('transform_paths', { glyphId: A, pathIndices: [1], dy: 10 });
		expect(run('submit_glyph', { glyphId: A }).error.code).toBe('INVALID_OUTLINES');
	});

	it('gives every issue code a hint; WINDING_SAME_AS_CONTAINER says to reverse or boolean', () => {
		const inner = rect(200, 200, 400, 400, 'Same way');
		const check = checkGlyphOutlines(new Glyph({ id: B, shapes: [rect(50, 0, 550, 700), inner] }), {
			upm: 1000,
			ascent: 800,
			descent: -200,
			capHeight: 700,
			xHeight: 500,
			overshoot: 10,
		});
		const issue = check.issues.find((item) => item.code === 'WINDING_SAME_AS_CONTAINER');
		expect(issue.hint).toMatch(/[Rr]everse this contour's point order/);
		expect(issue.hint).toMatch(/boolean_paths/);
		for (const code of [
			'TOO_FEW_POINTS',
			'DUPLICATE_POINTS',
			'SELF_INTERSECTION',
			'SPECK',
			'WINDING_SAME_AS_CONTAINER',
			'ABOVE_ASCENDER',
			'BELOW_DESCENDER',
		])
			expect(ISSUE_HINTS[code]).toMatch(/\w/);
	});
});

describe('render, check and read see the draft (#68)', () => {
	it('reports the draft for a glyph with an open job, the font otherwise', () => {
		run('begin_glyph', { glyphId: B });
		run('delete_paths', { glyphId: B, pathIndices: [0] });
		const read = session.execute('read_glyphs', { glyphIds: [B, A], includePaths: false });
		expect(read.glyphs.map((item) => [item.source, item.pathCount])).toEqual([
			['draft', 0],
			['font', 2],
		]);
		expect(session.execute('render_glyphs', { glyphIds: [A, B] }).drafts).toEqual([B]);
		expect(session.execute('render_text', { text: 'AB' }).drafts).toEqual([B]);
		expect(session.execute('check_outlines', { glyphId: B })).toMatchObject({
			source: 'draft',
			contours: [],
		});
		expect(session.execute('check_outlines', { glyphId: A }).source).toBe('font');
		expect(glyph(B).shapes.length).toBe(1);
		expect(saved()).toContain('Bowl');
	});

	it('renders a created glyph from its draft before it exists', () => {
		const create = run('create_glyph', { codePoint: 0x62 });
		const result = session.execute('render_glyphs', { glyphIds: [create.glyphId] });
		expect(result.drafts).toEqual([create.glyphId]);
	});
});

describe('an external (local) agent session', () => {
	it('never says Send, and its render limit is the one it was given', () => {
		session.dispose();
		session = createNativeToolSession({ grantOpen: false, renderLimit: 2 });
		session.execute('render_glyphs', { glyphIds: [A] });
		session.execute('render_glyphs', { glyphIds: [A] });
		const limit = session.execute('render_glyphs', { glyphIds: [A] });
		expect(limit.error.code).toBe('RENDER_LIMIT');
		const scope = run('set_spacing', { glyphId: A, metric: 'advanceWidth', value: 500 });
		expect(scope.error.code).toBe('OUT_OF_SCOPE');
		session.dispose();
		const closed = session.execute('get_context', {});
		for (const message of [limit.error.message, scope.error.message, closed.error.message])
			expect(message).not.toMatch(/\bsend\b/i);
	});
});

describe('QA round 1: exclude islands, copied contours, island hints', () => {
	// Counter-clockwise in y-up font units: a hole.
	const hole = (x1, y1, x2, y2, name = 'Counter') => ({
		name,
		pathPoints: [corner(x1, y1), corner(x2, y1), corner(x2, y2), corner(x1, y2)],
	});

	it('exclude through a letter with counters leaves islands in the counters that submit clean', async () => {
		// A B-like letter: one outer contour and two counters; the slash crosses both counters.
		addGlyph(B, [
			rect(50, 0, 550, 700, 'Bowl'),
			hole(150, 100, 450, 300, 'Lower counter'),
			hole(150, 400, 450, 600, 'Upper counter'),
		]);
		addGlyph(A, [
			rect(0, 0, 600, 700, 'Stem'),
			{
				name: 'Slash',
				pathPoints: [corner(-50, 150), corner(650, 550), corner(650, 350), corner(-50, 250)],
			},
		]);
		run('begin_glyph', { glyphId: B });
		run('copy_paths', { glyphId: B, sourceGlyphId: A, sourcePathIndices: [1] });
		const cut = await run('boolean_paths', {
			glyphId: B,
			operation: 'exclude',
			pathIndices: [0, 1, 2],
			withPathIndices: [3],
		});
		expect(cut.ok).toBe(true);
		const check = session.execute('check_outlines', { glyphId: B });
		expect(check.issues.filter((issue) => issue.code === 'WINDING_SAME_AS_CONTAINER')).toEqual([]);
		expect(check.submitWouldPass).toBe(true);
		const submit = run('submit_glyph', { glyphId: B });
		expect(submit.ok).toBe(true);
		// Islands exist: some contour sits inside a counter and runs opposite to it.
		expect(glyph(B).shapes.length).toBeGreaterThan(3);
	});

	it('flags a solid island that runs the same way as its hole, with a hint that does not say cut it out', () => {
		const island = hole(250, 150, 350, 250, 'Island');
		const check = checkGlyphOutlines(
			new Glyph({ id: B, shapes: [rect(50, 0, 550, 700), hole(150, 100, 450, 300), island] }),
			{ upm: 1000, ascent: 800, descent: -200, capHeight: 700, xHeight: 500, overshoot: 10 }
		);
		const issues = check.issues.filter((item) => item.code === 'WINDING_SAME_AS_CONTAINER');
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ pathIndex: 2, containerIndex: 1, shouldBe: 'solid' });
		expect(issues[0].hint).toMatch(/solid island/);
		expect(issues[0].hint).not.toMatch(/cut it out/);
	});

	it('a correctly wound island inside a counter is clean, though the outer contour bounds it too', () => {
		const check = checkGlyphOutlines(
			new Glyph({
				id: B,
				shapes: [rect(50, 0, 550, 700), hole(150, 100, 450, 300), rect(250, 150, 350, 250)],
			}),
			{ upm: 1000, ascent: 800, descent: -200, capHeight: 700, xHeight: 500, overshoot: 10 }
		);
		expect(check.issues).toEqual([]);
	});

	it('a contour copied in is new even when it matches one the glyph already had', () => {
		run('begin_glyph', { glyphId: A });
		const copied = run('copy_paths', { glyphId: A, sourceGlyphId: A, sourcePathIndices: [1] });
		expect(copied.newPathIndices).toEqual([2]);
		const submit = run('submit_glyph', { glyphId: A });
		expect(submit.error.code).toBe('INVALID_OUTLINES');
		const crossings = submit.error.details.issues.filter(
			(item) => item.code === 'SELF_INTERSECTION'
		);
		expect(crossings.map((item) => item.pathIndex)).toContain(2);
	});
});
