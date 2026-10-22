// M7 runs in the agent panel (#28, #29): gates, pill, run bar, receipts.
// The provider is a fake relay transport (fake-provider.js): no key.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { resetAgentPanelSlotForTests, unmountAgentPanel } from '../../app/agent_panel_slot.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { createAgentPanel, resetAgentPanelForTests } from '../ui/agent-panel.js';
import { runBarText } from '../ui/agent-run-bar.js';
import { RETRY_GLYPHS_EVENT } from '../run/review.js';
import { glyphIdOfChar as id } from '../run/run-order.js';
import { fakeGlyphTransport } from './fake-provider.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let editor;
const panels = [];

function setup(transportOptions = {}) {
	const transport = fakeGlyphTransport({
		exists: (glyphId) => !!editor.project.glyphs[glyphId],
		...transportOptions,
	});
	const openGlyph = vi.fn();
	const panel = createAgentPanel({
		getEditor: () => editor,
		transport,
		probe: async () => true,
		openGlyph,
		initialMode: 'open',
	});
	document.body.append(panel.host);
	panels.push(panel);
	panel.controller.connect({
		provider: 'openai',
		protocol: 'responses',
		model: 'test-model',
		apiKey: 'not-a-real-key',
	});
	return { panel, transport, openGlyph };
}

async function send(panel, text) {
	panel.composer.setValue(text);
	panel.composer.root.requestSubmit();
	await tick();
}

const button = (root, action) =>
	/** @type {HTMLButtonElement} */ (root.querySelector(`button[data-action="${action}"]`));
const lastCard = (panel, tag) => [...panel.thread.querySelectorAll(tag)].at(-1);

beforeEach(() => {
	document.body.innerHTML = '<div id="app__wrapper"></div>';
	resetAgentPanelSlotForTests();
	try {
		localStorage.clear();
	} catch {
		// optional
	}
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	Object.assign(editor.project.settings.font, {
		upm: 1000,
		ascent: 800,
		descent: -200,
		capHeight: 700,
		xHeight: 500,
	});
	editor.project.settings.app.autoSave = false;
	editor.nav.page = 'Workspace';
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
});

afterEach(() => {
	panels.forEach((panel) => panel.dispose());
	panels.length = 0;
	resetAgentPanelForTests();
	unmountAgentPanel();
	resetAgentPanelSlotForTests();
	getGlyphrStudioApp().projectEditors = [];
	vi.restoreAllMocks();
});

describe('whole-set run in the panel', () => {
	it('a style brief shows the Plan card and waits: nothing is sent before Start', async () => {
		const { panel, transport } = setup();
		await send(panel, 'Clean simple sans, open curves');
		const plan = lastCard(panel, 'agent-plan-card');
		expect(plan).toBeTruthy();
		expect(plan.textContent).toContain('x-height 500');
		expect(plan.textContent).toContain('up to $1.20');
		expect(plan.textContent).toContain('noHO');
		expect(transport).not.toHaveBeenCalled();
		panel.minimize();
		expect(panel.pill.root.textContent).toContain('Needs you · plan ready');
	});

	it('Start drafts n o H O, records "Before run", then waits at Approve the style', async () => {
		const { panel } = setup();
		await send(panel, 'Clean simple sans');
		button(lastCard(panel, 'agent-plan-card'), 'start').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('style'));
		expect(panel.thread.textContent).toContain('Before run · checkpoint saved');
		const gate = lastCard(panel, 'agent-approval-card');
		expect(gate.textContent).toContain('Style check');
		expect(panel.thread.textContent).toContain('Drew n o H O. Does this feel right?');
		expect(editor.glyphStatus.getStatus(id('n'))).toBe('draft');
		expect(editor.glyphStatus.getStatus(id('h'))).toBe('empty');
		panel.minimize();
		expect(panel.pill.root.textContent).toContain('Needs you · approve the style');
	});

	it('Edit by hand opens the glyph and keeps the gate open for Approve', async () => {
		const { panel, openGlyph } = setup();
		await send(panel, 'Clean simple sans');
		button(lastCard(panel, 'agent-plan-card'), 'start').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('style'));
		const gate = lastCard(panel, 'agent-approval-card');
		button(gate, 'edit-by-hand').click();
		expect(openGlyph).toHaveBeenCalledWith(id('n'));
		expect(panel.runs.state).toBe('style');
		expect(button(gate, 'approve').disabled).toBe(false);
	});

	it('Tweak: the next message redraws the controls and the gate comes back', async () => {
		const { panel, transport } = setup();
		await send(panel, 'Clean simple sans');
		button(lastCard(panel, 'agent-plan-card'), 'start').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('style'));
		const calls = transport.mock.calls.length;
		button(lastCard(panel, 'agent-approval-card'), 'tweak').click();
		expect(panel.composer.input.value).toBe('Tweak: ');
		await send(panel, 'Tweak: rounder');
		await vi.waitFor(() =>
			expect(panel.thread.querySelectorAll('agent-approval-card')).toHaveLength(2)
		);
		expect(transport.mock.calls.length).toBeGreaterThan(calls);
		expect(transport.mock.calls.at(-1)[0].messages[0].content[0].text).toContain('rounder');
	});

	it('Approve drafts the queue; the pill shows "Drafting g · n/62"; receipts per group', async () => {
		let release;
		let hold = false;
		const { panel } = setup({
			delay: () => (hold ? new Promise((resolve) => (release = resolve)) : Promise.resolve()),
		});
		await send(panel, 'Clean simple sans');
		button(lastCard(panel, 'agent-plan-card'), 'start').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('style'));
		hold = true;
		button(lastCard(panel, 'agent-approval-card'), 'approve').click();
		await vi.waitFor(() => expect(release).toBeTypeOf('function'));
		panel.minimize();
		expect(panel.pill.root.dataset.phase).toBe('running');
		expect(panel.pill.root.textContent).toContain('Drafting h · 4/62');
		expect(editor.glyphStatus.getStatus(id('n'))).toBe('kept');
		hold = false;
		release();
		await vi.waitFor(() => expect(panel.runs.state).toBe('done'), { timeout: 10000 });
		const receipts = panel.thread.querySelectorAll('agent-receipt-card');
		expect(receipts).toHaveLength(3);
		expect(receipts[0].textContent).toContain('24 new');
		expect(button(receipts[0], 'keep').textContent).toContain('Keep 24');
		expect(panel.pill.root.textContent).toContain('Needs you · 58 to review');
	});
});

describe('run controls never stop by accident', () => {
	async function drafting(panel, holdRef) {
		await send(panel, 'Clean simple sans');
		button(lastCard(panel, 'agent-plan-card'), 'start').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('style'));
		holdRef.hold = true;
		button(lastCard(panel, 'agent-approval-card'), 'approve').click();
		await vi.waitFor(() => expect(holdRef.release).toBeTypeOf('function'));
	}

	function holdingSetup() {
		const ref = { hold: false, release: null };
		const { panel } = setup({
			delay: () =>
				ref.hold ? new Promise((resolve) => (ref.release = resolve)) : Promise.resolve(),
		});
		return { panel, ref };
	}

	it('Esc, minimize and opening a glyph never stop a run', async () => {
		const { panel, ref } = holdingSetup();
		await drafting(panel, ref);
		panel.panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(panel.mode).toBe('minimized');
		panel.restore();
		panel.minimize();
		editor.nav.focus = true;
		editor.selectedGlyphID = id('u');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(panel.runs.state).toBe('drafting');
		expect(panel.controller.running).toBe(true);
	});

	it('Stop asks inline; Cancel keeps the run, Stop run discards only the unfinished draft', async () => {
		const { panel, ref } = holdingSetup();
		await drafting(panel, ref);
		const bar = panel.runBar.root;
		expect(bar.hidden).toBe(false);
		button(bar, 'stop').click();
		expect(bar.textContent).toContain('Stop run?');
		expect(panel.runs.state).toBe('drafting');
		// Esc inside the confirm cancels it and does not minimize the panel.
		button(bar, 'confirm-stop').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		expect(bar.textContent).not.toContain('Stop run?');
		expect(panel.mode).toBe('open');
		button(bar, 'stop').click();
		button(bar, 'confirm-stop').click();
		ref.hold = false;
		ref.release();
		await vi.waitFor(() => expect(panel.runs.busy).toBe(false));
		expect(panel.runs.state).toBe('stopped');
		expect(editor.glyphStatus.getStatus(id('h'))).toBe('empty');
		expect(editor.project.glyphs[id('h')]).toBeUndefined();
		expect(editor.glyphStatus.getStatus(id('n'))).toBe('kept');
		expect(panel.thread.textContent).toContain('the unfinished draft was discarded');
	});

	it('Pause finishes the current glyph; the bar offers Resume', async () => {
		const { panel, ref } = holdingSetup();
		await drafting(panel, ref);
		button(panel.runBar.root, 'pause').click();
		expect(panel.runBar.root.textContent).toContain('Pausing after h');
		ref.hold = false;
		ref.release();
		await vi.waitFor(() => expect(panel.runs.state).toBe('paused'));
		expect(editor.glyphStatus.getStatus(id('h'))).toBe('draft');
		expect(button(panel.runBar.root, 'resume')).toBeTruthy();
		expect(panel.thread.textContent).toContain('Paused · 5/62');
	});
});

describe('small asks and review', () => {
	it('"fix the g" gets no plan and no gate, only a receipt', async () => {
		const { panel } = setup();
		await send(panel, 'fix the g: draw it (glyph-0x67, please)');
		await vi.waitFor(() => expect(panel.thread.querySelector('agent-receipt-card')).toBeTruthy());
		expect(panel.thread.querySelector('agent-plan-card')).toBeNull();
		expect(panel.thread.querySelector('agent-approval-card')).toBeNull();
		expect(editor.glyphStatus.getStatus(id('g'))).toBe('draft');
	});

	it('Keep N follows live statuses and keeps Drafts only, in one entry', async () => {
		const { panel } = setup({ fail: (glyphId) => glyphId === id('k') });
		await send(panel, 'Clean simple sans');
		button(lastCard(panel, 'agent-plan-card'), 'start').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('style'));
		button(lastCard(panel, 'agent-approval-card'), 'approve').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('done'), { timeout: 10000 });
		const receipt = panel.thread.querySelector('agent-receipt-card');
		expect(receipt.textContent).toContain('23 new · 1 failed');
		expect(button(receipt, 'keep').textContent).toContain('Keep 23');
		expect(button(receipt, 'retry').textContent).toContain('Retry k');
		// The user marks b Yours by hand: the label follows.
		editor.glyphStatus.set(id('b'), 'yours', 'user');
		panel.refreshStatus();
		expect(button(receipt, 'keep').textContent).toContain('Keep 22');
		const before = editor.history.length;
		button(receipt, 'keep').click();
		expect(editor.history.length).toBe(before + 1);
		expect(editor.glyphStatus.getStatus(id('a'))).toBe('kept');
		expect(editor.glyphStatus.getStatus(id('b'))).toBe('yours');
		expect(editor.glyphStatus.getStatus(id('k'))).toBe('failed');
		expect(receipt.textContent).toContain('Kept 22 glyphs');
	});

	it('Retry from a Failed tile re-queues the glyph', async () => {
		let failK = true;
		const { panel } = setup({ fail: (glyphId) => failK && glyphId === id('k') });
		await send(panel, 'Clean simple sans');
		button(lastCard(panel, 'agent-plan-card'), 'start').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('style'));
		button(lastCard(panel, 'agent-approval-card'), 'approve').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('done'), { timeout: 10000 });
		failK = false;
		document.dispatchEvent(new CustomEvent(RETRY_GLYPHS_EVENT, { detail: { ids: [id('k')] } }));
		await vi.waitFor(() => expect(editor.glyphStatus.getStatus(id('k'))).toBe('draft'));
		expect(panel.thread.textContent).toContain('Retrying k');
	});

	it('Revert run keeps Yours glyphs', async () => {
		const { panel } = setup();
		await send(panel, 'Clean simple sans');
		button(lastCard(panel, 'agent-plan-card'), 'start').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('style'));
		button(lastCard(panel, 'agent-approval-card'), 'approve').click();
		await vi.waitFor(() => expect(panel.runs.state).toBe('done'), { timeout: 10000 });
		editor.glyphStatus.set(id('a'), 'yours', 'user');
		const revert = panel.thread.querySelector('.agent-checkpoint button');
		expect(revert.disabled).toBe(false);
		revert.click();
		expect(editor.project.glyphs[id('a')].shapes.length).toBe(1);
		expect(editor.project.glyphs[id('b')].shapes.length).toBe(0);
		expect(panel.thread.textContent).toContain('Run reverted · 61 glyphs · 1 kept');
	});
});

describe('run bar copy', () => {
	it('says what the run is doing, never colour alone', () => {
		expect(runBarText({ state: 'drafting', glyph: 'g', done: 10, total: 62 })).toBe(
			'Drafting g · 10/62'
		);
		expect(runBarText({ state: 'paused', done: 10, total: 62, pauseReason: 'cap' })).toBe(
			'Paused · spend cap reached · 10/62'
		);
		expect(runBarText({ state: 'drafting', glyph: 'g' }, { pausing: true })).toBe('Pausing after g');
	});
});
