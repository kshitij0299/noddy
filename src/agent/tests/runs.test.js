// M7 runs (#28) and review (#29). Regression tests near history/undo: every
// glyph job, Keep, Keep all and Revert must be exactly one history entry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { createAgentController } from '../agent-controller.js';
import { createNativeToolSession } from '../native-tools.js';
import { classifyAsk } from '../run/intent.js';
import { createGlyphDrafter } from '../run/glyph-job.js';
import { keepGlyphs, revertGlyph, revertRun } from '../run/review.js';
import { createRunController } from '../run/run-controller.js';
import { glyphIdOfChar, runOrder } from '../run/run-order.js';
import { estimateCost } from '../run/spend.js';

const id = glyphIdOfChar;
const copy = (value) => JSON.parse(JSON.stringify(value));
const corner = (x, y) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } });
const rect = (x1, y1, x2, y2) => ({
	name: 'Rect',
	pathPoints: [corner(x1, y1), corner(x1, y2), corner(x2, y2), corner(x2, y1)],
});
// SVG y-down about the ascender (800): a box from the baseline to 500.
const BOX = 'M100 300 L400 300 L400 800 L100 800 Z';

let editor;

function addGlyph(glyphId, shapes, advanceWidth = 600) {
	editor.project.glyphs[glyphId] = new Glyph({
		id: glyphId,
		parent: editor.project,
		advanceWidth,
		shapes,
	});
}

/** A real glyph job through the native tools (no model): one history entry. */
async function drawWithTools({ id: glyphId }) {
	const session = createNativeToolSession({ jobScope: [glyphId] });
	const rev = () => session.getContext().revision;
	try {
		const exists = !!editor.project.glyphs[glyphId];
		const opened = exists
			? session.execute('begin_glyph', { glyphId, expectedRevision: rev() })
			: session.execute('create_glyph', {
					codePoint: parseInt(glyphId.slice(8), 16),
					expectedRevision: rev(),
			  });
		if (!opened.ok) return { ok: false, error: opened.error };
		const count = editor.project.glyphs[glyphId]?.shapes.length || 0;
		if (count) {
			// A redraw: clear the old contours, then draw.
			const cleared = session.execute('delete_paths', {
				glyphId,
				expectedRevision: rev(),
				pathIndices: [...Array(count).keys()],
			});
			if (!cleared.ok) return { ok: false, error: cleared.error };
		}
		const drawn = session.execute('add_svg_path', {
			glyphId,
			expectedRevision: rev(),
			d: BOX,
			baselineY: null,
		});
		if (!drawn.ok) return { ok: false, error: drawn.error };
		const submitted = session.execute('submit_glyph', {
			glyphId,
			expectedRevision: rev(),
			note: null,
		});
		return submitted.ok ? { ok: true, cost: 0 } : { ok: false, error: submitted.error };
	} finally {
		session.dispose();
	}
}

/** A drafter that records the order and draws for real. */
function recordingDrafter(extra = {}) {
	const calls = [];
	const draft = vi.fn(async (job) => {
		calls.push(job.char);
		if (extra.before) await extra.before(job);
		const result = await drawWithTools(job);
		return { ...result, cost: extra.cost ?? 0 };
	});
	return { calls, draft };
}

function deferred() {
	let resolve;
	const promise = new Promise((r) => (resolve = r));
	return { promise, resolve };
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
	editor.nav.page = 'Workspace';
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
});

afterEach(() => {
	vi.restoreAllMocks();
	getGlyphrStudioApp().projectEditors = [];
});

// --------------------------------------------------------------
// Queue order and small asks
// --------------------------------------------------------------

describe('run order (DESIGN-BRIEF)', () => {
	it('controls, lowercase families, capitals, figures; 62 letters and figures', () => {
		const order = runOrder();
		const chars = order.map((item) => item.char).join('');
		expect(chars.slice(0, 4)).toBe('noHO');
		expect(chars.slice(4, 28)).toBe('hmulijrbdpqceagsftvwyxkz');
		expect(chars.slice(28, 52)).toBe('ILEFTCGDQBPRJUSVAWXYKNMZ');
		expect(chars.slice(52)).toBe('0123456789');
		expect(order).toHaveLength(62);
		expect(new Set(order.map((item) => item.id)).size).toBe(62);
	});

	it('the rest comes last in an All 116 run', () => {
		const order = runOrder('all');
		expect(order).toHaveLength(116);
		expect(order.slice(62).every((item) => item.group === 'rest')).toBe(true);
	});
});

describe('small ask or run', () => {
	it('a message that names one glyph is a small ask', () => {
		expect(classifyAsk('fix the g')).toEqual({ kind: 'small', char: 'g' });
		expect(classifyAsk('Make the letter A narrower')).toEqual({ kind: 'small', char: 'A' });
	});

	it('a style or font brief is a run', () => {
		expect(classifyAsk('Clean simple sans, open curves').kind).toBe('run');
		expect(classifyAsk('Geometric').kind).toBe('run');
		expect(classifyAsk('Draw a whole font for a bakery').kind).toBe('run');
	});

	it('anything else stays a small ask', () => {
		expect(classifyAsk('what can you do?')).toEqual({ kind: 'small', char: null });
	});
});

// --------------------------------------------------------------
// Gates
// --------------------------------------------------------------

describe('gates', () => {
	it('gate 1: nothing is drawn until Start; the plan carries spec and spend cap', async () => {
		const { draft } = recordingDrafter();
		const runs = createRunController({ getEditor: () => editor, draft });
		const plan = runs.propose({ brief: 'Clean sans' });
		expect(runs.state).toBe('plan');
		expect(plan.spec.map((s) => s.label)).toEqual(['x-height', 'cap', 'stems', 'overshoot']);
		expect(plan.spec[0].value).toBe(500);
		expect(plan.spendLabel).toBe('up to $1.20');
		expect(plan.groups.map((g) => g.label)).toEqual(['noHO', 'a–z', 'A–Z', '0–9']);
		await runs.settle();
		expect(draft).not.toHaveBeenCalled();
		expect(editor.history.length).toBe(0);
	});

	it('gate 2: n o H O are drawn, then the run waits for Approve', async () => {
		const { calls, draft } = recordingDrafter();
		const events = [];
		const runs = createRunController({
			getEditor: () => editor,
			draft,
			onEvent: (e) => events.push(e),
		});
		runs.propose({ brief: 'Clean sans' });
		await runs.start();
		expect(calls).toEqual(['n', 'o', 'H', 'O']);
		expect(runs.state).toBe('style');
		expect(events.find((e) => e.type === 'gate')).toMatchObject({
			gate: 'style',
			ids: ['n', 'o', 'H', 'O'].map(id),
		});
		await runs.settle();
		expect(calls).toHaveLength(4);
		// Drafts land as Draft, never Kept automatically.
		expect(['n', 'o', 'H', 'O'].map((c) => editor.glyphStatus.getStatus(id(c)))).toEqual([
			'draft',
			'draft',
			'draft',
			'draft',
		]);
		// One history entry per glyph job.
		expect(editor.history.length).toBe(4);
	});

	it('Approve keeps the controls in one entry and drafts the queue in order', async () => {
		const { calls, draft } = recordingDrafter();
		const runs = createRunController({ getEditor: () => editor, draft });
		runs.propose({ brief: 'Clean sans' });
		await runs.start();
		await runs.approve();
		expect(runs.state).toBe('done');
		expect(calls.join('')).toBe(runOrder().map((item) => item.char).join(''));
		expect(editor.glyphStatus.getStatus(id('n'))).toBe('kept');
		expect(editor.glyphStatus.getStatus(id('h'))).toBe('draft');
		// 62 jobs + 1 Keep of the controls.
		expect(editor.history.length).toBe(63);
		expect(editor.history.queue.some((e) => e.title === 'Keep · 4 glyphs')).toBe(true);
	});

	it('Tweak redraws the control Drafts and waits at the gate again', async () => {
		const { calls, draft } = recordingDrafter();
		const runs = createRunController({ getEditor: () => editor, draft });
		runs.propose({ brief: 'Clean sans' });
		await runs.start();
		await runs.tweak('rounder');
		expect(calls).toEqual(['n', 'o', 'H', 'O', 'n', 'o', 'H', 'O']);
		expect(draft.mock.calls[4][0].note).toBe('rounder');
		expect(runs.state).toBe('style');
	});
});

// --------------------------------------------------------------
// Queue: statuses, pause, stop, cap, ownership
// --------------------------------------------------------------

async function toQueue(runs) {
	runs.propose({ brief: 'Clean sans' });
	await runs.start();
}

describe('queue', () => {
	it('tiles go Queued → Drafting → Draft', async () => {
		const seen = [];
		const { draft } = recordingDrafter({
			before: async (job) => {
				if (job.char === 'h')
					seen.push(
						editor.glyphStatus.getStatus(id('h')),
						editor.glyphStatus.getStatus(id('m'))
					);
			},
		});
		const runs = createRunController({ getEditor: () => editor, draft });
		await toQueue(runs);
		await runs.approve();
		expect(seen).toEqual(['drafting', 'queued']);
		expect(editor.glyphStatus.getStatus(id('m'))).toBe('draft');
	});

	it('Pause finishes the current glyph, then waits; Resume continues', async () => {
		const gate = deferred();
		const { calls, draft } = recordingDrafter({
			before: async (job) => {
				if (job.char === 'm') await gate.promise;
			},
		});
		const runs = createRunController({ getEditor: () => editor, draft });
		await toQueue(runs);
		const running = runs.approve();
		await vi.waitFor(() => expect(calls).toContain('m'));
		expect(runs.pause()).toBe(true);
		expect(runs.state).toBe('drafting');
		gate.resolve();
		await running;
		expect(runs.state).toBe('paused');
		expect(editor.glyphStatus.getStatus(id('m'))).toBe('draft');
		expect(calls.at(-1)).toBe('m');
		expect(editor.glyphStatus.getStatus(id('u'))).toBe('queued');
		await runs.resume();
		expect(runs.state).toBe('done');
	});

	it('Stop discards only the unfinished draft; finished drafts stay', async () => {
		const { calls, draft } = recordingDrafter();
		const runs = createRunController({
			getEditor: () => editor,
			draft: async (job) => {
				if (job.char !== 'u') return draft(job);
				calls.push('u');
				// The job never submits; it ends when Stop aborts it.
				await new Promise((resolve) => job.signal.addEventListener('abort', resolve));
				return { ok: false, error: { code: 'STOPPED' } };
			},
		});
		await toQueue(runs);
		const running = runs.approve();
		await vi.waitFor(() => expect(calls).toContain('u'));
		const entries = editor.history.length;
		expect(editor.glyphStatus.getStatus(id('u'))).toBe('drafting');
		expect(runs.stop()).toBe(true);
		await running;
		expect(runs.state).toBe('stopped');
		expect(editor.project.glyphs[id('u')]).toBeUndefined();
		expect(editor.glyphStatus.getStatus(id('u'))).toBe('empty');
		expect(editor.glyphStatus.getStatus(id('l'))).toBe('empty');
		expect(editor.glyphStatus.getStatus(id('h'))).toBe('draft');
		expect(editor.glyphStatus.getStatus(id('m'))).toBe('draft');
		expect(editor.history.length).toBe(entries);
	});

	it('the spend cap pauses the run; Resume allows one more cap', async () => {
		const { calls, draft } = recordingDrafter({ cost: 0.25 });
		const events = [];
		const runs = createRunController({
			getEditor: () => editor,
			draft,
			onEvent: (e) => events.push(e),
		});
		runs.propose({ brief: 'Clean sans', spendCap: 1.2 });
		await runs.start();
		await runs.approve();
		// 4 controls + 1 queued glyph = 1.25 ≥ 1.20.
		expect(runs.state).toBe('paused');
		expect(calls).toHaveLength(5);
		expect(events.find((e) => e.type === 'paused')).toMatchObject({ reason: 'cap' });
		await runs.resume();
		expect(runs.view.cap).toBeCloseTo(2.4);
		expect(calls).toHaveLength(10);
		expect(runs.state).toBe('paused');
	});

	it('skips Yours glyphs and comes back once to a glyph open in the editor', async () => {
		const { calls, draft } = recordingDrafter({
			before: async (job) => {
				if (job.char === 'h') {
					// The user takes m by hand and opens u while h is drafting.
					editor.glyphStatus.set(id('m'), 'yours', 'user');
					editor.nav.focus = true;
					editor.selectedGlyphID = id('u');
				}
				if (job.char === 'z') editor.nav.focus = false;
			},
		});
		const events = [];
		const runs = createRunController({
			getEditor: () => editor,
			draft,
			onEvent: (e) => events.push(e),
		});
		await toQueue(runs);
		await runs.approve();
		expect(calls).not.toContain('m');
		expect(editor.glyphStatus.getStatus(id('m'))).toBe('yours');
		expect(events.find((e) => e.phase === 'skipped' && e.id === id('m')).reason).toBe('yours');
		// u was deferred to the end of the queue and drawn once it was closed.
		expect(calls.indexOf('u')).toBeGreaterThan(calls.indexOf('9'));
		expect(editor.glyphStatus.getStatus(id('u'))).toBe('draft');
	});

	it('records a "Before run" checkpoint at Start', async () => {
		const { draft } = recordingDrafter();
		const runs = createRunController({ getEditor: () => editor, draft });
		runs.propose({ brief: 'Clean sans' });
		const head = editor.history.queue[0] || null;
		await runs.start();
		expect(runs.run.checkpoint).toMatchObject({ label: 'Before run', historyRef: head });
		expect(runs.run.checkpoint.statuses[id('a')]).toMatchObject({ status: 'empty' });
	});

	it('a failed glyph is Failed in its group receipt; Retry drafts it again', async () => {
		let failK = true;
		const { calls, draft } = recordingDrafter();
		const events = [];
		const runs = createRunController({
			getEditor: () => editor,
			onEvent: (e) => events.push(e),
			draft: async (job) => {
				if (job.char === 'k' && failK) {
					calls.push('k');
					return { ok: false, error: { code: 'INVALID_OUTLINES', message: 'bad' } };
				}
				return draft(job);
			},
		});
		await toQueue(runs);
		await runs.approve();
		expect(editor.glyphStatus.getStatus(id('k'))).toBe('failed');
		const receipt = events.find((e) => e.type === 'group' && e.group === 'lowercase');
		expect(receipt.rows).toHaveLength(26 - 2);
		expect(receipt.rows.filter((r) => r.status === 'failed').map((r) => r.char)).toEqual(['k']);
		failK = false;
		await runs.retry([id('k')]);
		expect(editor.glyphStatus.getStatus(id('k'))).toBe('draft');
		expect(calls.filter((c) => c === 'k')).toHaveLength(2);
	});
});

// --------------------------------------------------------------
// Review: Keep, Keep all, Revert, Revert run
// --------------------------------------------------------------

describe('review', () => {
	beforeEach(() => {
		addGlyph(id('o'), [rect(40, -10, 560, 510)]);
		editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	});

	it('Keep all keeps only Drafts: Failed and Yours are excluded; one entry', async () => {
		for (const c of 'abcd') await drawWithTools({ id: id(c) });
		editor.glyphStatus.set(id('c'), 'failed', 'agent');
		editor.glyphStatus.set(id('d'), 'yours', 'user');
		const before = editor.history.length;
		const result = keepGlyphs(editor, ['a', 'b', 'c', 'd', 'e'].map(id));
		expect(result.kept).toEqual([id('a'), id('b')]);
		expect(editor.history.length).toBe(before + 1);
		expect(editor.history.queue[1].title).toBe('Keep · 2 glyphs');
		expect(editor.glyphStatus.getStatus(id('c'))).toBe('failed');
		expect(editor.glyphStatus.getStatus(id('d'))).toBe('yours');
		// Undo takes the whole Keep all back.
		editor.history.restoreState();
		await Promise.resolve();
		expect(editor.glyphStatus.getStatus(id('a'))).toBe('draft');
		expect(editor.glyphStatus.getStatus(id('b'))).toBe('draft');
	});

	it('Keep of nothing reviewable adds no entry', () => {
		const before = editor.history.length;
		expect(keepGlyphs(editor, [id('o')]).kept).toEqual([]);
		expect(editor.history.length).toBe(before);
	});

	it('Revert is a forward commit that restores the pre-draft bytes', async () => {
		const before = JSON.stringify(editor.project.glyphs[id('o')].save());
		expect(await drawWithTools({ id: id('o') })).toEqual({ ok: true, cost: 0 });
		expect(JSON.stringify(editor.project.glyphs[id('o')].save())).not.toBe(before);
		const entries = editor.history.length;
		expect(revertGlyph(editor, id('o')).ok).toBe(true);
		expect(JSON.stringify(editor.project.glyphs[id('o')].save())).toBe(before);
		expect(editor.history.length).toBe(entries + 1);
		expect(editor.glyphStatus.getStatus(id('o'))).toBe('kept');
		// Not time travel: the agent entry is still in history, under the revert.
		expect(editor.history.queue.some((e) => e.title === 'Agent · o')).toBe(true);
		editor.history.restoreState();
		await Promise.resolve();
		expect(editor.glyphStatus.getStatus(id('o'))).toBe('draft');
		expect(JSON.stringify(editor.project.glyphs[id('o')].save())).not.toBe(before);
	});

	it('Revert of a glyph the agent created leaves an empty glyph', async () => {
		await drawWithTools({ id: id('b') });
		expect(revertGlyph(editor, id('b')).ok).toBe(true);
		expect(editor.project.glyphs[id('b')].shapes).toHaveLength(0);
		expect(editor.glyphStatus.getStatus(id('b'))).toBe('empty');
	});

	it('a redraw keeps the first pre-draft snapshot', async () => {
		const before = JSON.stringify(editor.project.glyphs[id('o')].save());
		await drawWithTools({ id: id('o') });
		await drawWithTools({ id: id('o') });
		revertGlyph(editor, id('o'));
		expect(JSON.stringify(editor.project.glyphs[id('o')].save())).toBe(before);
	});

	it('Revert run keeps Yours glyphs and glyphs edited after the run', async () => {
		const { draft } = recordingDrafter();
		const runs = createRunController({ getEditor: () => editor, draft });
		runs.propose({ brief: 'Clean sans' });
		await runs.start();
		await runs.approve();
		editor.glyphStatus.set(id('a'), 'yours', 'user');
		const edited = editor.project.glyphs[id('b')];
		edited.advanceWidth = 777;
		const entries = editor.history.length;
		const result = revertRun(editor, runs.run);
		expect(result.ok).toBe(true);
		expect(result.kept).toEqual(expect.arrayContaining([id('a'), id('b')]));
		expect(editor.history.length).toBe(entries + 1);
		expect(editor.project.glyphs[id('a')].shapes.length).toBeGreaterThan(0);
		expect(editor.project.glyphs[id('b')].advanceWidth).toBe(777);
		expect(editor.project.glyphs[id('c')].shapes).toHaveLength(0);
		expect(editor.glyphStatus.getStatus(id('c'))).toBe('empty');
		// o existed before the run: its own outline comes back.
		expect(editor.project.glyphs[id('o')].shapes).toHaveLength(1);
		expect(editor.project.glyphs[id('o')].maxes.yMin).toBe(-10);
	});
});

// --------------------------------------------------------------
// One glyph = one scoped agent job (fake provider, no key)
// --------------------------------------------------------------

describe('glyph jobs through the agent controller', () => {
	function fakeProvider({ wander = false } = {}) {
		let step = 0;
		return vi.fn(async (payload) => {
			const text = payload.messages[0].content[0].text;
			const glyphId = /\((glyph-0x[0-9A-F]+),/i.exec(text)[1];
			const last = payload.messages.at(-1);
			const revision =
				(last.role === 'tool' && last.content[0].output.value?.context?.revision) ||
				payload.context.revision;
			step++;
			const call = (toolName, input) => ({
				text: '',
				messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: `c${step}`, toolName, input }] }],
				toolCalls: [{ toolCallId: `c${step}`, toolName, input }],
				usage: { inputTokens: 1000, outputTokens: 100 },
			});
			if (step % 4 === 1)
				return call('create_glyph', {
					codePoint: wander ? 0x7a : parseInt(glyphId.slice(8), 16),
					expectedRevision: revision,
				});
			if (step % 4 === 2)
				return call('add_svg_path', { glyphId, expectedRevision: revision, d: BOX, baselineY: null });
			if (step % 4 === 3) return call('submit_glyph', { glyphId, expectedRevision: revision, note: null });
			return { text: 'Drew it.', messages: [{ role: 'assistant', content: 'Drew it.' }], toolCalls: [], usage: null };
		});
	}

	function controllerWith(transport) {
		const events = [];
		const controller = createAgentController({
			createSession: (options) => createNativeToolSession(options),
			transport,
			onEvent: (e) => events.push(e),
		});
		controller.connect({ provider: 'openai', protocol: 'responses', model: 'm', apiKey: 'not-a-key' });
		return { controller, events };
	}

	it('a job draws its glyph as Draft, stays out of the chat and reports spend', async () => {
		const transport = fakeProvider();
		const { controller, events } = controllerWith(transport);
		const draft = createGlyphDrafter(controller);
		const result = await draft({ id: id('b'), char: 'b', brief: 'sans', spec: [], controls: [] });
		expect(result.ok).toBe(true);
		expect(result.cost).toBeCloseTo(estimateCost([
			{ inputTokens: 1000, outputTokens: 100 },
			{ inputTokens: 1000, outputTokens: 100 },
			{ inputTokens: 1000, outputTokens: 100 },
			null,
		]));
		expect(editor.glyphStatus.getStatus(id('b'))).toBe('draft');
		expect(events.filter((e) => e.type !== 'connection')).toEqual([]);
		expect(editor.history.length).toBe(1);
	});

	it('a job cannot write any other glyph (OUT_OF_SCOPE)', async () => {
		const { controller } = controllerWith(fakeProvider({ wander: true }));
		const result = await createGlyphDrafter(controller)({ id: id('b'), char: 'b' });
		expect(result.ok).toBe(false);
		expect(editor.project.glyphs[id('z')]).toBeUndefined();
		expect(editor.history.length).toBe(0);
	});
});
