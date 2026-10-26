// #97: tool replies stay small. Only get_context carries the full context; every other reply
// carries revision plus what is specific to that tool. These budgets pin a typical Remix turn
// (whole-set target, MCP session) so the replies cannot creep back up.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { resetAgentControlsForTests, setMode, setPicks, setScope } from '../agent-controls.js';
import { contourArea, reverseContour, toShapeData } from '../chaos/geometry.js';
import { CURVY_O, SANS_H } from '../chaos/tests/fixtures.js';
import { createNativeToolSession } from '../native-tools.js';
import { resetRemixRun } from '../remix/remix-run.js';

const N = 'glyph-0x4E';
const H = 'glyph-0x48';
const O = 'glyph-0x4F';
const copy = (value) => JSON.parse(JSON.stringify(value));
const size = (value) => JSON.stringify(value).length;

let editor;
let session;
const rev = () => session.getContext().revision;
const run = (name, input) => session.execute(name, { expectedRevision: rev(), ...input });

function bar(cx, cy, angle, length, width) {
	const a = (angle * Math.PI) / 180;
	const p = (along, across) => ({
		x: Math.round(cx + Math.cos(a) * along - Math.sin(a) * across),
		y: Math.round(cy + Math.sin(a) * along + Math.cos(a) * across),
		h1: null,
		h2: null,
	});
	let contour = {
		points: [
			p(-length / 2, -width / 2),
			p(length / 2, -width / 2),
			p(length / 2, width / 2),
			p(-length / 2, width / 2),
		],
	};
	if (contourArea(contour) < 0) contour = reverseContour(contour);
	return contour;
}

function addGlyph(id, contours) {
	editor.project.glyphs[id] = new Glyph({
		id,
		parent: editor.project,
		advanceWidth: 600,
		shapes: toShapeData(contours, 'Path'),
	});
}

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
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
	editor.nav.page = 'Overview';
	addGlyph(N, [...SANS_H, bar(300, 350, 35, 700, 60)]);
	addGlyph(H, SANS_H);
	addGlyph(O, CURVY_O);
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	setMode(editor, 'remix');
	setScope(editor, 'set');
	// The MCP door: no Send, so get_context also carries the Remix loop.
	session = createNativeToolSession({ grantOpen: false });
});

afterEach(() => {
	session?.dispose();
	resetRemixRun(editor);
	getGlyphrStudioApp().projectEditors = [];
});

/** One Remix turn on H, the way an agent plays it. Returns each reply. */
async function remixTurn() {
	const replies = {};
	replies.get_context = session.execute('get_context', {});
	replies.describe_mark = session.execute('describe_mark', { glyphId: N, pathIndices: [SANS_H.length] });
	replies.read_glyphs = session.execute('read_glyphs', { glyphIds: [H] });
	replies.draw_cards = run('draw_cards', { glyphId: H, seed: 7 });
	const plays = [];
	for (const card of replies.draw_cards.cards) plays.push(await run(card.play.tool, card.play.input));
	replies.apply_chaos = plays.find((reply) => reply.ok) ?? plays[0];
	replies.op_history = session.execute('op_history', { glyphId: H, revert: true, reason: 'too busy' });
	replies.submit_glyph = run('submit_glyph', { glyphId: H, note: 'seed 7' });
	return replies;
}

// Characters of JSON per reply. The baseline (before #97) was ~3000-4100 for each of these.
const BUDGETS = {
	get_context: 1800,
	describe_mark: 1000,
	read_glyphs: 500,
	draw_cards: 1000,
	apply_chaos: 400,
	op_history: 600,
	submit_glyph: 500,
};

describe('tool reply sizes (#97)', () => {
	it('keeps a Remix turn within its reply budgets', async () => {
		const replies = await remixTurn();
		for (const [name, reply] of Object.entries(replies)) {
			expect(reply.ok, name).toBe(true);
			expect(size(reply), name).toBeLessThanOrEqual(BUDGETS[name]);
		}
	});

	it('only get_context carries the context; every other reply carries the revision', async () => {
		const replies = await remixTurn();
		const { get_context: context, ...rest } = replies;
		expect(context.context.revision).toMatch(/^agent-\d+:\d+$/);
		for (const [name, reply] of Object.entries(rest)) {
			expect(reply.context, name).toBeUndefined();
			expect(reply.revision, name).toMatch(/^agent-\d+:\d+$/);
		}
		// A write reports the revision after it: the next call can use it as is.
		expect(replies.submit_glyph.revision).toBe(session.getContext().revision);
		expect(replies.submit_glyph.revision).not.toBe(replies.draw_cards.revision);
		// Errors keep the revision too.
		const error = session.execute('submit_glyph', { glyphId: O, expectedRevision: 'stale' });
		expect(error.ok).toBe(false);
		expect(error.revision).toBe(session.getContext().revision);
		expect(error.context).toBeUndefined();
	});

	it('get_context sends a whole-set target as a count, a small target as its IDs', () => {
		const whole = session.execute('get_context', {}).context.target;
		expect(whole).toEqual({ scope: 'set', count: 116 });
		setPicks([H, O]);
		setScope(editor, 'selected');
		const small = session.execute('get_context', {}).context.target;
		expect(small).toEqual({ scope: 'selected', glyphIds: [H, O] });
	});

	it('write replies carry a slim glyph summary with floats rounded to 2 dp', async () => {
		const { submit_glyph: submit } = await remixTurn();
		expect(Object.keys(submit.glyph).sort()).toEqual(
			['advanceWidth', 'bounds', 'char', 'glyphId', 'pathCount', 'pointCount'].sort()
		);
		for (const value of Object.values(submit.glyph.bounds))
			expect(Math.round(value * 100) / 100).toBe(value);
		expect(submit.glyph.char).toBe('H');
	});

	it('the reference sentence comes with the first hand only', async () => {
		await remixTurn();
		const next = run('draw_cards', { glyphId: O, seed: 8 });
		expect(next.ok).toBe(true);
		expect(next.reference).toBeUndefined();
		for (const card of next.cards) expect(Object.keys(card).sort()).toEqual(['id', 'idea', 'play']);
	});
});
