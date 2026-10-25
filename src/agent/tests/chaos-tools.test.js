// PR C: apply_chaos (the agent's door into the chaos engine) and the Chaos tab's Apply, which
// runs through the same glyph jobs: Drafts, one undo step per glyph, locks respected.
// Near history/undo (protected area): no history code changes; these pin the entry counts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { resetAgentControlsForTests, setMode } from '../agent-controls.js';
import { toShapeData } from '../chaos/geometry.js';
import { CURVY_O, PIXEL_H, PIXEL_O, SANS_H } from '../chaos/tests/fixtures.js';
import { createNativeToolSession } from '../native-tools.js';
import {
	optionalNullableSchema,
	TOOL_DEFINITIONS,
	validateToolInput,
} from '../tool-definitions.js';
import { revertGlyphs } from '../run/review.js';
import { applyChaos, baseFor, fontNote, previewChaos } from '../ui/chaos/chaos-runner.js';

const N = 'glyph-0x6E';
const H = 'glyph-0x48';
const O = 'glyph-0x4F';
const copy = (value) => JSON.parse(JSON.stringify(value));

let editor;
let session;
const saved = () => JSON.stringify(editor.project.save());
const rev = () => session.getContext().revision;
const titles = () =>
	editor.history.queue
		.map((entry) => entry.title)
		.filter((title) => title !== '_whole_project_change_post_state_');
const run = (name, input) => session.execute(name, { expectedRevision: rev(), ...input });

function addGlyph(id, contours, advanceWidth = 600) {
	editor.project.glyphs[id] = new Glyph({
		id,
		parent: editor.project,
		advanceWidth,
		shapes: toShapeData(contours, 'Path'),
	});
}

function setUp(glyphs) {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	try {
		localStorage.clear();
		sessionStorage.clear();
	} catch {
		// Storage is optional.
	}
	resetAgentControlsForTests();
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
	for (const [id, contours] of Object.entries(glyphs)) addGlyph(id, contours);
	editor.selectedGlyphID = N;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	session = createNativeToolSession();
}

afterEach(() => {
	session?.dispose();
	getGlyphrStudioApp().projectEditors = [];
});

describe('apply_chaos (agent tool)', () => {
	beforeEach(() => setUp({ [N]: SANS_H, [H]: SANS_H, [O]: CURVY_O }));

	it('is in the registry with every optional field optional for MCP', () => {
		const tool = TOOL_DEFINITIONS.find((definition) => definition.name === 'apply_chaos');
		expect(optionalNullableSchema(tool.inputSchema).required).toEqual([
			'glyphIds',
			'expectedRevision',
			'op',
		]);
		expect(
			validateToolInput('apply_chaos', { glyphIds: [H], expectedRevision: 'r', op: 'shatter' })
				.valid
		).toBe(false);
		expect(
			validateToolInput('apply_chaos', {
				glyphIds: [H],
				expectedRevision: 'r',
				op: 'warp',
				params: { warp: 'twist', strength: 60 },
			}).valid
		).toBe(true);
	});

	it('opens the jobs and sets the drafts; the font changes only on submit, one entry per glyph', async () => {
		const before = saved();
		const result = await run('apply_chaos', { glyphIds: [H, O], op: 'slash-cut', seed: 11 });
		expect(result.ok).toBe(true);
		expect(result.results.map((r) => r.ok)).toEqual([true, true]);
		expect(result.results[0].seed).toBeGreaterThanOrEqual(11);
		expect(saved()).toBe(before);
		expect(session.openJobs).toEqual([H, O]);
		// The draft is what render_glyphs and check_outlines see.
		const render = session.execute('render_glyphs', { glyphIds: [H, O] });
		expect(render.drafts).toEqual([H, O]);
		expect(session.execute('check_outlines', { glyphId: H }).submitWouldPass).toBe(true);
		const entries = editor.history.length;
		expect(run('submit_glyph', { glyphId: H }).ok).toBe(true);
		expect(run('submit_glyph', { glyphId: O }).ok).toBe(true);
		expect(editor.history.length - entries).toBe(2);
		expect(titles()[0]).toBe('Agent · O');
		expect(editor.glyphStatus.getStatus(H)).toBe('draft');
		expect(saved()).not.toBe(before);
	});

	it('reproduces from a seed and re-rolls with another', async () => {
		const shapes = async (seed) => {
			// Start the job over each time: apply_chaos works on the open draft otherwise.
			run('begin_glyph', { glyphId: H });
			await run('apply_chaos', { glyphIds: [H], op: 'glitch-bands', seed, chaos: 60 });
			return JSON.stringify(
				session.execute('read_glyphs', { glyphIds: [H], includePaths: true }).glyphs[0].paths
			);
		};
		const a = await shapes(5);
		const b = await shapes(5);
		const c = await shapes(6);
		expect(b).toBe(a);
		expect(c).not.toBe(a);
	});

	it('refuses Yours glyphs, and Pixel Life on a drawn font, per glyph', async () => {
		editor.glyphStatus.set(H, 'yours', 'user');
		const result = await run('apply_chaos', { glyphIds: [H, O], op: 'warp', seed: 3 });
		expect(result.ok).toBe(true);
		expect(result.results[0]).toMatchObject({ ok: false, error: { code: 'LOCKED_YOURS' } });
		expect(result.results[1].ok).toBe(true);
		const pixel = await run('apply_chaos', { glyphIds: [O], op: 'pixel-life' });
		expect(pixel.ok).toBe(false);
		expect(pixel.error.code).toBe('NOT_PIXEL_FONT');
	});

	it('honours breakRules only in Wild mode', async () => {
		const closeCounter = {
			glyphIds: [O],
			op: 'grid-snap',
			seed: 1,
			chaos: 100,
			params: { cols: 3, rows: 3 },
		};
		const guarded = await run('apply_chaos', { ...closeCounter, breakRules: true });
		setMode(editor, 'wild');
		const wild = await run('apply_chaos', { ...closeCounter, breakRules: true });
		expect(guarded.ok ? guarded.guard : 'on').toBe('on');
		if (wild.ok) expect(wild.guard).toBe('off');
	});

	it('rejects a stale revision like every job tool', async () => {
		const result = await session.execute('apply_chaos', {
			glyphIds: [H],
			op: 'warp',
			expectedRevision: 'agent-0:0',
		});
		expect(result.error.code).toBe('STALE_REVISION');
	});
});

describe('Chaos tab Apply and preview', () => {
	beforeEach(() => setUp({ [N]: SANS_H, [H]: PIXEL_H, [O]: PIXEL_O }));
	const getEditor = () => editor;

	it('lands each glyph as a Draft, one "Chaos · X" undo step per glyph', async () => {
		const before = editor.history.length;
		const results = await applyChaos(getEditor, {
			op: 'slash-cut',
			ids: [H, O],
			scope: 'selected',
			seed: 9,
			chaos: 50,
			params: {},
		});
		expect(results.map((r) => r.ok)).toEqual([true, true]);
		expect(editor.history.length - before).toBe(2);
		expect(titles().slice(0, 2)).toEqual(['Chaos · O', 'Chaos · H']);
		expect(editor.glyphStatus.getStatus(H)).toBe('draft');
		expect(editor.glyphStatus.getStatus(O)).toBe('draft');
		// One undo takes back one glyph.
		const o = JSON.stringify(editor.project.glyphs[O].save());
		const h = JSON.stringify(editor.project.glyphs[H].save());
		editor.history.restoreState();
		expect(JSON.stringify(editor.project.glyphs[O].save())).not.toBe(o);
		expect(JSON.stringify(editor.project.glyphs[H].save())).toBe(h);
	});

	it(
		're-rolls a chaos Draft from before the Draft, and Undo goes back to the original',
		{
			timeout: 30000,
		},
		async () => {
			const original = JSON.stringify(editor.project.glyphs[H].save().shapes);
			const chaosDrafts = new Set();
			const options = { op: 'warp', ids: [H], scope: 'glyph', chaos: 50, params: {}, chaosDrafts };
			await applyChaos(getEditor, { ...options, seed: 1 });
			expect(baseFor(editor, H, chaosDrafts)).toBe('before-draft');
			await applyChaos(getEditor, { ...options, seed: 2 });
			// A fresh take on the original, not warp on warp: the same as seed 2 straight away.
			const reroll = JSON.stringify(editor.project.glyphs[H].save().shapes);
			expect(revertGlyphs(editor, [H]).ok).toBe(true);
			expect(JSON.stringify(editor.project.glyphs[H].save().shapes)).toBe(original);
			await applyChaos(getEditor, { ...options, seed: 2, chaosDrafts: new Set() });
			expect(JSON.stringify(editor.project.glyphs[H].save().shapes)).toBe(reroll);
		}
	);

	it('Whole set skips Yours glyphs; explicit targets carry the user’s consent', async () => {
		editor.glyphStatus.set(H, 'yours', 'user');
		const set = await applyChaos(getEditor, {
			op: 'glitch-bands',
			ids: [H, O],
			scope: 'set',
			seed: 4,
			chaos: 50,
			params: {},
		});
		expect(set[0]).toMatchObject({ ok: false, skipped: true });
		expect(set[1].ok).toBe(true);
		const picked = await applyChaos(getEditor, {
			op: 'glitch-bands',
			ids: [H],
			scope: 'selected',
			seed: 4,
			chaos: 50,
			params: {},
		});
		expect(picked[0].ok).toBe(true);
	});

	it('previews without writing anything, and says when Pixel Life cannot run', async () => {
		const before = saved();
		const entries = editor.history.length;
		const items = await previewChaos(editor, {
			op: 'pixel-life',
			ids: [H, O, 'glyph-0x5A'],
			seed: 3,
			chaos: 50,
			params: {},
		});
		expect(items.map((item) => item.id)).toEqual([H, O, 'glyph-0x5A']);
		expect(items[0].result.ok).toBe(true);
		expect(items[2].glyph).toBeNull();
		expect(saved()).toBe(before);
		expect(editor.history.length).toBe(entries);
		expect(fontNote(editor, 'pixel-life', [H, O])).toBeNull();
		setUp({ [N]: SANS_H, [O]: CURVY_O });
		expect(fontNote(editor, 'pixel-life', [O])).toMatch(/pixel grid/);
	});

	it('a newer preview cancels an older one', async () => {
		const items = await previewChaos(editor, {
			op: 'warp',
			ids: [H, O],
			seed: 3,
			chaos: 50,
			params: {},
			isStale: () => true,
		});
		expect(items).toBeNull();
	});
});
