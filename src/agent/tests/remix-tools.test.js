// PR D: Remix mode's agent tools. draw_cards (seeded, tabu, Telephone, re-roll from before the
// Draft), op_history (the move log and its regret), describe_mark, novelty pressure at
// submit_glyph, and Exact mode unchanged. The same session serves the built-in agent and MCP.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { resetAgentControlsForTests, setMode, setTelephone } from '../agent-controls.js';
import { contourArea, reverseContour, toShapeData } from '../chaos/geometry.js';
import { CURVY_O, SANS_H } from '../chaos/tests/fixtures.js';
import { createNativeToolSession } from '../native-tools.js';
import { remixSeedFor, resetRemixRun } from '../remix/remix-run.js';
import { revertGlyphs } from '../run/review.js';
import { REMIX_LOOP, validateToolInput } from '../tool-definitions.js';

const N = 'glyph-0x4E';
const H = 'glyph-0x48';
const O = 'glyph-0x4F';
const A = 'glyph-0x41';
const copy = (value) => JSON.parse(JSON.stringify(value));

let editor;
let session;
const rev = () => session.getContext().revision;
const run = (name, input) => session.execute(name, { expectedRevision: rev(), ...input });
const paths = (id) =>
	JSON.stringify(session.execute('read_glyphs', { glyphIds: [id], includePaths: true }).glyphs[0].paths);
const fontPaths = (id) => JSON.stringify(editor.project.glyphs[id].save().shapes);

/** A straight bar at `angle` through (cx, cy); clockwise (solid) unless `cut`. */
function bar(cx, cy, angle, length, width, { cut = false } = {}) {
	const a = (angle * Math.PI) / 180;
	const p = (along, across) => ({
		x: Math.round(cx + Math.cos(a) * along - Math.sin(a) * across),
		y: Math.round(cy + Math.sin(a) * along + Math.cos(a) * across),
		h1: null,
		h2: null,
	});
	let contour = {
		points: [p(-length / 2, -width / 2), p(length / 2, -width / 2), p(length / 2, width / 2), p(-length / 2, width / 2)],
	};
	if (contourArea(contour) < 0 === cut) contour = reverseContour(contour);
	return contour;
}

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

/** Plays every dealt card; returns the results. */
async function playAll(draw) {
	const results = [];
	for (const card of draw.cards) results.push(await run(card.play.tool, card.play.input));
	return results;
}

afterEach(() => {
	session?.dispose();
	resetRemixRun(editor);
	getGlyphrStudioApp().projectEditors = [];
});

describe('Exact mode is unchanged', () => {
	beforeEach(() => setUp({ [N]: SANS_H, [H]: SANS_H, [O]: CURVY_O }));

	it('deals no cards, checks no novelty, reports no remix and no Remix loop', () => {
		const draw = run('draw_cards', { glyphId: H });
		expect(draw.ok).toBe(false);
		expect(draw.error.code).toBe('MODE_EXACT');
		// The same mark added to two glyphs lands on both (a faithful copy is the point).
		for (const id of [H, N]) {
			expect(run('begin_glyph', { glyphId: id }).ok).toBe(true);
			run('add_paths', { glyphId: id, paths: [{ name: 'Dot', points: bar(300, 900, 0, 120, 60).points }] });
			const submit = run('submit_glyph', { glyphId: id });
			expect(submit.ok).toBe(true);
			expect(submit.remix).toBeUndefined();
		}
		expect(remixSeedFor(editor, H)).toBe(null);
		const external = createNativeToolSession({ grantOpen: false });
		expect(external.getContext().remixLoop).toBeUndefined();
		expect(external.getContext().telephone).toBe(false);
		external.dispose();
	});
});

describe('draw_cards and seeds', () => {
	beforeEach(() => {
		setUp({ [N]: SANS_H, [H]: SANS_H, [O]: CURVY_O });
		setMode(editor, 'remix');
	});

	it('is in the registry; optional fields are optional', () => {
		expect(validateToolInput('draw_cards', { glyphId: H, expectedRevision: 'r' }).valid).toBe(true);
		expect(validateToolInput('draw_cards', { glyphId: H, expectedRevision: 'r', count: 4 }).valid).toBe(
			false
		);
		expect(validateToolInput('op_history', { glyphId: H }).valid).toBe(true);
		expect(validateToolInput('describe_mark', { glyphId: H, pathIndices: [0] }).valid).toBe(true);
	});

	it('starts the job and deals seeded cards with ready apply_chaos calls', async () => {
		const draw = run('draw_cards', { glyphId: H, seed: 77, count: 2 });
		expect(draw.ok).toBe(true);
		expect(draw.seed).toBe(77);
		expect(draw.cards).toHaveLength(2);
		expect(session.openJobs).toEqual([H]);
		for (const card of draw.cards) {
			expect(card.play.tool).toBe('apply_chaos');
			expect(validateToolInput('apply_chaos', { ...card.play.input, expectedRevision: 'r' }).valid).toBe(
				true
			);
		}
		const results = await playAll(draw);
		expect(results.every((result) => result.ok)).toBe(true);
	});

	it('reproduces the same take from the same seed, another from another seed', async () => {
		const take = async (seed) => {
			resetRemixRun(editor);
			const draw = run('draw_cards', { glyphId: O, seed, count: 2 });
			await playAll(draw);
			return { cards: draw.cards.map((card) => card.id), paths: paths(O) };
		};
		const a = await take(5);
		const b = await take(5);
		const c = await take(6);
		expect(b).toEqual(a);
		expect(c.paths).not.toBe(a.paths);
	});

	it('never deals a card the previous 3 glyphs were dealt', () => {
		const dealt = [];
		for (const [index, id] of [H, N, O, H].entries()) {
			const draw = run('draw_cards', { glyphId: id, seed: 10 + index, count: 3 });
			dealt.push(draw.cards.map((card) => card.id));
			if (index < 3) session.execute('op_history', { glyphId: id });
		}
		expect(new Set(dealt.slice(0, 3).flat()).size).toBe(9);
	});

	it('shows the seed on the take, re-rolls from before the Draft, and Undo goes back to the original', async () => {
		const original = fontPaths(O);
		const originalRead = paths(O);
		const first = run('draw_cards', { glyphId: O, seed: 21, count: 2 });
		await playAll(first);
		const submitted = run('submit_glyph', { glyphId: O, note: null });
		expect(submitted.ok).toBe(true);
		expect(submitted.remix.seed).toBe(21);
		expect(remixSeedFor(editor, O)).toBe(21);
		const drafted = fontPaths(O);
		expect(drafted).not.toBe(original);
		// Re-roll: a new seed, starting from the glyph before its Draft (not stacked on it).
		const again = run('draw_cards', { glyphId: O, seed: 22, count: 2 });
		expect(again.startedFrom).toBe('before-draft');
		expect(paths(O)).toBe(originalRead);
		await playAll(again);
		expect(run('submit_glyph', { glyphId: O }).ok).toBe(true);
		expect(remixSeedFor(editor, O)).toBe(22);
		// Undo of the Draft goes back to the glyph before any Remix.
		expect(revertGlyphs(editor, [O]).ok).toBe(true);
		expect(fontPaths(O)).toBe(original);
	});
});

describe('op_history and the regret rule', () => {
	beforeEach(() => {
		setUp({ [N]: SANS_H, [H]: SANS_H, [O]: CURVY_O });
		setMode(editor, 'remix');
	});

	it('lists the moves with their cards and reverts the last one', async () => {
		const draw = run('draw_cards', { glyphId: O, seed: 31, count: 2 });
		const start = paths(O);
		await run(draw.cards[0].play.tool, draw.cards[0].play.input);
		const afterFirst = paths(O);
		run('transform_paths', { glyphId: O, pathIndices: [0], dx: 12, dy: null });
		const list = session.execute('op_history', { glyphId: O });
		expect(list.moves.map((move) => [move.tool, move.card])).toEqual([
			['apply_chaos', draw.cards[0].id],
			['transform_paths', null],
		]);
		const revert = session.execute('op_history', {
			glyphId: O,
			revert: true,
			reason: 'the nudge did nothing',
		});
		expect(revert.reverted).toMatchObject({ tool: 'transform_paths', reason: 'the nudge did nothing' });
		expect(paths(O)).toBe(afterFirst);
		session.execute('op_history', { glyphId: O, revert: true });
		expect(paths(O)).toBe(start);
		const none = session.execute('op_history', { glyphId: O, revert: true });
		expect(none.error.code).toBe('NO_MOVE');
	});

	it('reports kept moves and the regret at submit, and nudges when nothing was regretted', async () => {
		const draw = run('draw_cards', { glyphId: O, seed: 41, count: 2 });
		await playAll(draw);
		session.execute('op_history', { glyphId: O, revert: true, reason: 'too busy' });
		const submit = run('submit_glyph', { glyphId: O });
		expect(submit.ok).toBe(true);
		expect(submit.remix.kept).toEqual([draw.cards[0].id]);
		expect(submit.remix.regret).toEqual([{ move: draw.cards[1].id, reason: 'too busy' }]);
		expect(submit.remix.nudge).toBeUndefined();
		const next = run('draw_cards', { glyphId: H, seed: 42, count: 1 });
		await playAll(next);
		expect(run('submit_glyph', { glyphId: H }).remix.nudge).toMatch(/Regret rule/);
	});

	it('needs a job', () => {
		expect(session.execute('op_history', { glyphId: H }).error.code).toBe('NO_JOB');
	});
});

describe('novelty pressure and Telephone', () => {
	beforeEach(() => {
		setUp({ [N]: SANS_H, [H]: SANS_H, [O]: CURVY_O });
		setMode(editor, 'remix');
	});

	it('rejects a take that pastes a sibling’s mark (TOO_SIMILAR) and keeps the job open', () => {
		const slash = { name: 'Slash', points: bar(300, 350, 40, 760, 70, { cut: true }).points };
		run('begin_glyph', { glyphId: H });
		run('add_paths', { glyphId: H, paths: [slash] });
		expect(run('submit_glyph', { glyphId: H }).ok).toBe(true);
		run('begin_glyph', { glyphId: N });
		run('add_paths', { glyphId: N, paths: [slash] });
		const copyPaste = run('submit_glyph', { glyphId: N });
		expect(copyPaste.ok).toBe(false);
		expect(copyPaste.error.code).toBe('TOO_SIMILAR');
		expect(copyPaste.error.details.sibling).toBe(H);
		expect(session.openJobs).toContain(N);
		// The glyph's own move lands.
		run('replace_paths', {
			glyphId: N,
			pathIndices: [1],
			paths: [{ name: 'Kick', points: bar(560, 20, -30, 240, 60).points }],
		});
		expect(run('submit_glyph', { glyphId: N }).ok).toBe(true);
	});

	it('Telephone hands the previous glyph’s kept moves on, with one mutation', async () => {
		setTelephone(editor, true);
		expect(session.getContext().telephone).toBe(true);
		const first = run('draw_cards', { glyphId: O, seed: 51, count: 2 });
		await playAll(first);
		session.execute('op_history', { glyphId: O, revert: true, reason: 'keep one' });
		expect(run('submit_glyph', { glyphId: O }).ok).toBe(true);
		const kept = first.cards[0].id;
		const second = run('draw_cards', { glyphId: H, seed: 52 });
		expect(second.telephone.from).toBe('O');
		expect(second.telephone.mutation).toBeTruthy();
		const ids = second.cards.map((card) => card.id);
		// One mutation: the kept card is still there unless it was the one swapped out.
		if (!/swapped/.test(second.telephone.mutation)) expect(ids).toContain(kept);
	});
});

describe('describe_mark and the Remix loop', () => {
	beforeEach(() => {
		setUp({ [N]: SANS_H, [O]: CURVY_O, [A]: [...CURVY_O, bar(300, 350, -50, 1000, 90, { cut: true })] });
		setMode(editor, 'remix');
	});

	it('measures the user’s slash and makes it the reference for the cards', () => {
		const result = session.execute('describe_mark', { glyphId: A, pathIndices: [2] });
		expect(result.ok).toBe(true);
		expect(Math.abs(result.mark.angle - -50)).toBeLessThanOrEqual(3);
		expect(result.mark.combines).toBe('cut');
		expect(result.mark.countersCrossed).toBe(1);
		const draw = run('draw_cards', { glyphId: O, seed: 3, count: 3 });
		expect(draw.reference).toBe(result.mark.summary);
		expect(session.execute('describe_mark', { glyphId: A, pathIndices: [9] }).error.code).toBe(
			'MISSING_PATH'
		);
	});

	it('gives a local agent the Remix loop in get_context', () => {
		const external = createNativeToolSession({ grantOpen: false });
		expect(external.getContext().remixLoop).toBe(REMIX_LOOP);
		expect(REMIX_LOOP).toMatch(/describe_mark.*draw_cards.*render_glyphs.*op_history.*submit_glyph/s);
		external.dispose();
	});
});
