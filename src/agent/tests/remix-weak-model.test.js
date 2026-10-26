// PR D: a weak (free) model following the Remix loop literally, through the built-in agent's
// controller and the real native tools. No provider, no key: a scripted transport plays the
// model, one tool call per step, reading only what the tools returned.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { createAgentController } from '../agent-controller.js';
import { resetAgentControlsForTests, setMode } from '../agent-controls.js';
import { contourArea, reverseContour, toShapeData } from '../chaos/geometry.js';
import { CURVY_O, SANS_H } from '../chaos/tests/fixtures.js';
import { createNativeToolSession } from '../native-tools.js';
import { remixSeedFor, resetRemixRun } from '../remix/remix-run.js';

const A = 'glyph-0x41';
const H = 'glyph-0x48';
const O = 'glyph-0x4F';
const copy = (value) => JSON.parse(JSON.stringify(value));
let editor;

function slash() {
	const a = (-50 * Math.PI) / 180;
	const p = (along, across) => ({
		x: Math.round(300 + Math.cos(a) * along - Math.sin(a) * across),
		y: Math.round(350 + Math.sin(a) * along + Math.cos(a) * across),
		h1: null,
		h2: null,
	});
	const contour = { points: [p(-500, -45), p(500, -45), p(500, 45), p(-500, 45)] };
	// Drawn the opposite way of the letter: it cuts (the graffiti slash).
	return contourArea(contour) < 0 ? reverseContour(contour) : contour;
}

function setUp() {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	try {
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
	const add = (id, contours) =>
		(editor.project.glyphs[id] = new Glyph({
			id,
			parent: editor.project,
			advanceWidth: 600,
			shapes: toShapeData(contours, 'Path'),
		}));
	add(A, [...CURVY_O, slash()]);
	add(H, SANS_H);
	add(O, CURVY_O);
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	setMode(editor, 'remix');
}

/**
 * The scripted weak model: describe_mark on A, then for each target draw_cards, play every
 * card, render_glyphs, op_history revert (the regret), submit_glyph; TOO_SIMILAR → draw again
 * with seed + 1. It only ever looks at the last tool result.
 */
function weakModel(targets) {
	const plan = [];
	let target = 0;
	let hand = [];
	let seed = 100;
	return vi.fn(async (payload) => {
		const results = payload.messages.filter((m) => m.role === 'tool');
		const last = results.at(-1)?.content?.[0]?.output?.value;
		const revision = last?.revision || payload.context.revision;
		const step = results.length;
		const call = (toolName, input) => {
			plan.push(toolName);
			return {
				text: '',
				messages: [
					{
						role: 'assistant',
						content: [{ type: 'tool-call', toolCallId: `c${step}`, toolName, input }],
					},
				],
				toolCalls: [{ toolCallId: `c${step}`, toolName, input }],
				usage: { inputTokens: 100, outputTokens: 20 },
			};
		};
		const glyphId = targets[target];
		const previous = plan.at(-1);
		if (!previous) return call('describe_mark', { glyphId: A, pathIndices: [2] });
		if (previous === 'submit_glyph' && last?.ok) target++;
		if (target >= targets.length)
			return {
				text: 'Remixed.',
				messages: [{ role: 'assistant', content: 'Remixed.' }],
				toolCalls: [],
				usage: null,
			};
		const id = targets[target];
		if (
			previous === 'describe_mark' ||
			(previous === 'submit_glyph' && last?.ok) ||
			(previous === 'submit_glyph' && last?.error?.code === 'TOO_SIMILAR')
		) {
			seed++;
			return call('draw_cards', { glyphId: id, expectedRevision: revision, seed, count: 2 });
		}
		if (previous === 'draw_cards') hand = [...last.cards];
		if (hand.length) {
			const card = hand.shift();
			return call('apply_chaos', { ...card.play.input, expectedRevision: revision });
		}
		if (previous === 'apply_chaos') return call('render_glyphs', { glyphIds: [id] });
		if (previous === 'render_glyphs')
			return call('op_history', { glyphId: id, revert: true, reason: 'too much at once' });
		return call('submit_glyph', {
			glyphId: glyphId ?? id,
			expectedRevision: revision,
			note: `seed ${seed}`,
		});
	});
}

beforeEach(setUp);
afterEach(() => {
	resetRemixRun(editor);
	getGlyphrStudioApp().projectEditors = [];
});

describe('a weak model follows the Remix loop', () => {
	it('lands every target as a Draft with a seed, each its own take', async () => {
		const transport = weakModel([O, H]);
		const events = [];
		const controller = createAgentController({
			createSession: (options) => createNativeToolSession(options),
			transport,
			onEvent: (event) => events.push(event),
		});
		controller.connect({ provider: 'openrouter', model: 'x/free:free', apiKey: 'not-a-key' });
		await controller.run('Remix O and H from the slash on A', [], { requireGlyph: false });
		expect(events.filter((event) => event.type === 'error')).toEqual([]);
		const failed = events.filter((e) => e.type === 'tool' && e.state === 'error');
		// Only the recoverable Remix refusals may fail: a card the guard turned down, a regret
		// of the only move, a take too close to a sibling (re-rolled). Nothing else.
		for (const event of failed)
			expect(['GUARD_REJECTED', 'LAST_MOVE', 'TOO_SIMILAR']).toContain(event.result?.error?.code);
		for (const id of [O, H]) {
			expect(editor.glyphStatus.getStatus(id)).toBe('draft');
			expect(Number.isInteger(remixSeedFor(editor, id))).toBe(true);
		}
		// The first payload carried Remix mode to the relay (where the loop text is added).
		expect(transport.mock.calls[0][0].context.mode).toBe('remix');
	});
});
