// PR B: agent panel controls (Model, Mode, Target chips, New chat, tabs shell, empty state,
// per-glyph receipts) and what they put in get_context.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import {
	CONTROLS_STORAGE_PREFIX,
	getTarget,
	readAgentControls,
	resetAgentControlsForTests,
	setChaos,
	setMode,
	setPicks,
	setScope,
	togglePick,
} from '../agent-controls.js';
import { createAgentController } from '../agent-controller.js';
import { createNativeToolSession } from '../native-tools.js';
import { keepGlyphs } from '../run/review.js';
import { createAgentPanel } from '../ui/agent-panel.js';
import { registerChaosTool, resetChaosToolsForTests } from '../ui/agent-panel-tabs.js';
import { CARD_ACTION_EVENT } from '../ui/cards/index.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const copy = (value) => JSON.parse(JSON.stringify(value));
const corner = (x, y) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } });
const rect = (x1, y1, x2, y2) => ({
	name: 'Rect',
	pathPoints: [corner(x1, y1), corner(x1, y2), corner(x2, y2), corner(x2, y1)],
});

const A = 'glyph-0x41';
const B = 'glyph-0x42';

/** A real editor with a project; `glyphs` get one box each. */
function makeEditor({ id = 'font-1', glyphs = [] } = {}) {
	const editor = new ProjectEditor();
	editor.project.settings.project.id = id;
	editor.project.settings.app.autoSave = false;
	for (const glyphId of glyphs)
		editor.project.glyphs[glyphId] = new Glyph({
			id: glyphId,
			parent: editor.project,
			advanceWidth: 600,
			shapes: [rect(50, 0, 550, 500)],
		});
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	return editor;
}

const keyDown = (target, key, init = {}) =>
	target.dispatchEvent(
		new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
	);

/** A controller stand-in. */
function fakeController({ connected = true, running = false } = {}) {
	return {
		connected,
		running,
		references: [],
		stop: vi.fn(),
		run: vi.fn(async () => {}),
		connect: vi.fn(),
		disconnect: vi.fn(),
		clear: vi.fn(),
	};
}

const panels = [];
function panelFixture(options = {}) {
	const panel = createAgentPanel({
		getEditor: () => null,
		probe: async () => true,
		loadLocalAgent: null,
		...options,
	});
	document.body.append(panel.host);
	panels.push(panel);
	return panel;
}

beforeEach(() => {
	document.body.innerHTML = '';
	sessionStorage.clear();
	resetAgentControlsForTests();
	resetChaosToolsForTests();
});

afterEach(() => {
	panels.forEach((panel) => panel.dispose());
	panels.length = 0;
	document.body.innerHTML = '';
	sessionStorage.clear();
	resetAgentControlsForTests();
	resetChaosToolsForTests();
	setCurrentProjectEditor(undefined);
	vi.restoreAllMocks();
});

describe('agent controls store', () => {
	it('mode and chaos default to Exact 50 and are kept per project in sessionStorage', () => {
		const one = makeEditor({ id: 'one' });
		const two = makeEditor({ id: 'two' });
		expect(readAgentControls(one)).toMatchObject({ mode: 'exact', chaos: 50 });
		setMode(one, 'wild');
		setChaos(one, 83);
		expect(readAgentControls(one)).toMatchObject({ mode: 'wild', chaos: 83 });
		expect(readAgentControls(two)).toMatchObject({ mode: 'exact', chaos: 50 });
		expect(JSON.parse(sessionStorage.getItem(`${CONTROLS_STORAGE_PREFIX}one`))).toEqual({
			mode: 'wild',
			chaos: 83,
			telephone: false,
		});
		// A reload reads it back.
		resetAgentControlsForTests();
		expect(readAgentControls(one)).toMatchObject({ mode: 'wild', chaos: 83 });
	});

	it('chaos is clamped to whole numbers from 0 to 100; unknown modes are ignored', () => {
		const editor = makeEditor();
		setChaos(editor, 140);
		expect(readAgentControls(editor).chaos).toBe(100);
		setChaos(editor, -3.4);
		expect(readAgentControls(editor).chaos).toBe(0);
		setMode(editor, 'chaotic');
		expect(readAgentControls(editor).mode).toBe('exact');
	});

	it('target follows the selection: open glyph, picks, else the whole set', () => {
		const editor = makeEditor();
		expect(getTarget(editor).scope).toBe('set');
		expect(getTarget(editor).glyphIds).toHaveLength(116);
		setPicks([B]);
		expect(getTarget(editor)).toEqual({ scope: 'glyph', glyphIds: [B] });
		togglePick(A);
		expect(getTarget(editor)).toEqual({ scope: 'selected', glyphIds: [B, A] });
		// The glyph open in the editor wins.
		editor.nav.focus = true;
		editor.selectedGlyphID = A;
		expect(getTarget(editor)).toEqual({ scope: 'glyph', glyphIds: [A] });
	});

	it('a scope the user chose sticks until the selection changes; an empty scope is not used', () => {
		const editor = makeEditor();
		setPicks([A, B]);
		setScope(editor, 'set');
		expect(getTarget(editor).scope).toBe('set');
		setPicks([A]);
		expect(getTarget(editor).scope).toBe('glyph');
		setScope(editor, 'selected');
		expect(getTarget(editor).scope).toBe('glyph');
	});
});

describe('get_context reports mode, chaos and target (native, so MCP sees it too)', () => {
	it('includes mode, chaos and target, and stays inside the relay context limit', async () => {
		const editor = makeEditor({ glyphs: [A] });
		editor.nav.page = 'Characters';
		editor.selectedGlyphID = A;
		setCurrentProjectEditor(editor);
		setMode(editor, 'remix');
		setChaos(editor, 70);
		setPicks([A, B]);
		const session = createNativeToolSession({ getEditor: () => editor });
		try {
			const result = await session.execute('get_context', {}, { callId: 'c1' });
			expect(result.ok).toBe(true);
			expect(result.context).toMatchObject({
				mode: 'remix',
				chaos: 70,
				target: { scope: 'selected', glyphIds: [A, B] },
			});
			setPicks([]);
			const whole = session.getContext();
			expect(whole.target.scope).toBe('set');
			// boundedJSON(context, 8000) in server/agent/validation.js
			expect(JSON.stringify(whole).length).toBeLessThan(8000);
		} finally {
			session.dispose();
		}
	});

	it("the built-in agent's request carries them in its captured context", async () => {
		const editor = makeEditor({ glyphs: [A] });
		editor.nav.page = 'Characters';
		editor.selectedGlyphID = A;
		setCurrentProjectEditor(editor);
		setMode(editor, 'wild');
		const transport = vi.fn(async () => ({
			text: 'ok',
			messages: [{ role: 'assistant', content: 'ok' }],
			toolCalls: [],
		}));
		const controller = createAgentController({
			createSession: () => createNativeToolSession({ getEditor: () => editor }),
			transport,
		});
		controller.connect({ provider: 'openai', model: 'gpt-5', apiKey: 'test-key-not-real' });
		await controller.run('hi');
		expect(transport.mock.calls[0][0].context).toMatchObject({
			mode: 'wild',
			chaos: 50,
			target: { scope: 'set' },
		});
	});
});

describe('switching models keeps the conversation (bugs 1, 14)', () => {
	it('a new connect does not clear the chat; the next request still has the earlier turns', async () => {
		const transport = vi.fn(async () => ({
			text: 'done',
			messages: [{ role: 'assistant', content: 'done' }],
			toolCalls: [],
		}));
		const context = { projectId: 'p', glyphId: A, writable: true };
		const session = () => ({
			getContext: () => context,
			execute: vi.fn(),
			undoLast: vi.fn(),
			dispose: vi.fn(),
		});
		const events = [];
		const controller = createAgentController({
			createSession: session,
			transport,
			onEvent: (event) => events.push(event.type),
		});
		controller.connect({
			provider: 'openrouter',
			model: 'a/one:free',
			apiKey: 'test-key-not-real',
		});
		await controller.run('Make the A bolder');
		controller.connect({ provider: 'openrouter', model: 'b/two', apiKey: 'test-key-not-real' });
		await controller.run('Now the B');
		const second = transport.mock.calls[1][0];
		expect(second.model).toBe('b/two');
		expect(JSON.stringify(second.messages)).toContain('Make the A bolder');
		expect(events).not.toContain('clear');
	});

	it('choosing another model from the chip keeps the thread and closes the list', async () => {
		const panel = panelFixture({ controller: fakeController({ connected: true }) });
		panel.handleEvent({
			type: 'connection',
			connected: true,
			provider: 'openrouter',
			model: 'a/one',
		});
		panel.handleEvent({ type: 'start', prompt: 'Draw a', attachments: [], context: {} });
		panel.handleEvent({ type: 'finish' });
		const bubble = panel.thread.querySelector('.agent-bubble--user');
		panel.modelChip.button.click();
		const popover = panel.panel.querySelector('.agent-popover--model');
		expect(popover.hidden).toBe(false);
		expect(panel.modelChip.button.getAttribute('aria-expanded')).toBe('true');
		expect(popover.textContent).toContain('Change provider');
		expect(popover.textContent).toContain('Re-enter key');
		panel.handleEvent({
			type: 'connection',
			connected: true,
			provider: 'openrouter',
			model: 'b/two',
		});
		expect(popover.hidden).toBe(true);
		expect(panel.thread.contains(bubble)).toBe(true);
		expect(panel.modelChip.label.textContent).toBe('two');
	});

	it('Esc closes the model list and returns focus to the chip, without minimizing', () => {
		const panel = panelFixture({ controller: fakeController({ connected: true }) });
		panel.handleEvent({ type: 'start', prompt: 'x', attachments: [], context: {} });
		panel.handleEvent({ type: 'finish' });
		panel.modelChip.button.focus();
		panel.modelChip.button.click();
		const popover = panel.panel.querySelector('.agent-popover--model');
		keyDown(popover.querySelector('button, input') || popover, 'Escape');
		expect(popover.hidden).toBe(true);
		expect(document.activeElement).toBe(panel.modelChip.button);
		expect(panel.mode).toBe('open');
	});
});

describe('Mode chip', () => {
	it('opens a radio group; arrows choose; chaos shows only in Remix and Wild', () => {
		const editor = makeEditor();
		const panel = panelFixture({ getEditor: () => editor });
		const chip = panel.modeChip.button;
		expect(chip.textContent).toContain('Exact');
		chip.click();
		const popover = panel.modeChip.popover.root;
		expect(popover.hidden).toBe(false);
		const radios = [...popover.querySelectorAll('[role="radio"]')];
		expect(radios.map((r) => r.textContent)).toEqual([
			expect.stringContaining('Exact'),
			expect.stringContaining('Remix'),
			expect.stringContaining('Wild'),
		]);
		expect(document.activeElement).toBe(radios[0]);
		const chaos = popover.querySelector('.agent-chaos');
		expect(chaos.hidden).toBe(true);
		keyDown(document.activeElement, 'ArrowDown');
		expect(readAgentControls(editor).mode).toBe('remix');
		expect(chaos.hidden).toBe(false);
		expect(document.activeElement.textContent).toContain('Remix');
		const slider = popover.querySelector('input[type="range"]');
		slider.value = '80';
		slider.dispatchEvent(new Event('input'));
		expect(readAgentControls(editor).chaos).toBe(80);
		expect(chip.textContent).toContain('Remix 80');
		expect(chip.getAttribute('aria-label')).toBe('Mode: Remix, chaos 80');
		// Enter closes it, back on the chip.
		keyDown(document.activeElement, 'Enter');
		expect(popover.hidden).toBe(true);
		expect(document.activeElement).toBe(chip);
	});

	it('Esc from the chaos slider closes the menu; Exact hides chaos again', () => {
		const editor = makeEditor();
		setMode(editor, 'wild');
		const panel = panelFixture({ getEditor: () => editor });
		panel.modeChip.button.click();
		const popover = panel.modeChip.popover.root;
		const slider = popover.querySelector('input[type="range"]');
		slider.focus();
		keyDown(slider, 'Escape');
		expect(popover.hidden).toBe(true);
		expect(panel.mode).toBe('open');
		setMode(editor, 'exact');
		panel.modeChip.button.click();
		expect(popover.querySelector('.agent-chaos').hidden).toBe(true);
	});
});

describe('Telephone switch (PR D)', () => {
	it('shows only in Remix and Wild, toggles the store, and reaches get_context', () => {
		const editor = makeEditor();
		const panel = panelFixture({ getEditor: () => editor });
		panel.modeChip.button.click();
		const popover = panel.modeChip.popover.root;
		const row = popover.querySelector('.agent-telephone');
		const toggle = row.querySelector('[role="switch"]');
		expect(row.hidden).toBe(true);
		setMode(editor, 'remix');
		expect(row.hidden).toBe(false);
		expect(toggle.getAttribute('aria-checked')).toBe('false');
		expect(toggle.getAttribute('aria-labelledby')).toBeTruthy();
		toggle.click();
		expect(toggle.getAttribute('aria-checked')).toBe('true');
		expect(readAgentControls(editor).telephone).toBe(true);
		expect(panel.modeChip.button.getAttribute('aria-label')).toBe(
			'Mode: Remix, chaos 50, Telephone on'
		);
		// Exact never reports it, but remembers it for the next Remix.
		setMode(editor, 'exact');
		expect(readAgentControls(editor).telephone).toBe(false);
		setMode(editor, 'wild');
		expect(readAgentControls(editor).telephone).toBe(true);
	});
});

describe('Target chip', () => {
	it('shows the count, defaults from the selection and disables empty scopes', () => {
		const editor = makeEditor();
		const panel = panelFixture({ getEditor: () => editor });
		const chip = panel.targetChip.button;
		expect(chip.textContent).toContain('Whole set');
		chip.click();
		const radios = () => [...panel.targetChip.popover.root.querySelectorAll('[role="radio"]')];
		expect(radios().map((r) => r.getAttribute('aria-disabled'))).toEqual(['true', 'true', null]);
		expect(radios()[2].textContent).toContain('116');
		expect(radios()[1].textContent).toContain('Cmd-click');
		setPicks([A, B]);
		expect(chip.textContent).toContain('2 glyphs');
		expect(radios()[1].getAttribute('aria-checked')).toBe('true');
		expect(radios()[1].textContent).toContain('2');
		// Arrows skip the disabled "This glyph".
		radios()[1].focus();
		keyDown(radios()[1], 'ArrowDown');
		expect(getTarget(editor).scope).toBe('set');
		keyDown(document.activeElement, 'ArrowDown');
		expect(getTarget(editor).scope).toBe('selected');
		setPicks([A]);
		expect(chip.textContent).toContain('A');
		expect(chip.getAttribute('aria-label')).toBe('Target: This glyph, A');
	});
});

describe('New chat (bug 20)', () => {
	it('is disabled on an empty thread and while working; it clears the thread and the chat', () => {
		const controller = fakeController();
		const panel = panelFixture({ controller });
		const button = panel.newChatButton;
		expect(button.disabled).toBe(true);
		panel.handleEvent({ type: 'start', prompt: 'Draw a', attachments: [], context: {} });
		expect(button.disabled).toBe(true); // working
		panel.handleEvent({ type: 'finish' });
		expect(button.disabled).toBe(false);
		button.click();
		expect(controller.clear).toHaveBeenCalledTimes(1);
		expect(panel.thread.querySelector('.agent-bubble--user')).toBe(null);
		expect(panel.thread.querySelector('.agent-panel__empty')).not.toBe(null);
		expect(button.disabled).toBe(true);
		expect(document.activeElement).toBe(panel.composer.input);
	});

	it('sits in the header next to minimize', () => {
		const panel = panelFixture({ controller: fakeController() });
		const header = panel.panel.querySelector('header');
		expect(panel.newChatButton.parentElement).toBe(header);
		expect(panel.newChatButton.nextElementSibling.getAttribute('aria-label')).toBe(
			'Minimize agent'
		);
	});
});

describe('Agent | Chaos tabs shell', () => {
	it('no tab row ships without a chaos tool; the plain title shows', () => {
		const panel = panelFixture({ controller: fakeController() });
		expect(panel.tabs.root.hidden).toBe(true);
		expect(panel.panel.querySelector('.agent-panel__title').hidden).toBe(false);
		expect(panel.panel.querySelector('.agent-panel__tab--chaos').hidden).toBe(true);
	});

	it('a registered chaos tool shows the tabs; arrows switch; unregistering hides them', () => {
		const panel = panelFixture({ controller: fakeController() });
		const mount = vi.fn((container) => {
			container.textContent = 'Slash knobs';
			return () => {};
		});
		const unregister = registerChaosTool({ id: 'slash', label: 'Slash cut', mount });
		expect(panel.tabs.root.hidden).toBe(false);
		expect(panel.panel.querySelector('.agent-panel__title').hidden).toBe(true);
		const tabs = [...panel.tabs.root.querySelectorAll('[role="tab"]')];
		expect(tabs.map((t) => t.textContent)).toEqual(['Agent', 'Chaos']);
		expect(tabs[0].getAttribute('aria-selected')).toBe('true');
		tabs[0].focus();
		keyDown(tabs[0], 'ArrowRight');
		expect(panel.tabs.current).toBe('chaos');
		expect(document.activeElement).toBe(tabs[1]);
		expect(panel.panel.querySelector('.agent-panel__tab--agent').hidden).toBe(true);
		expect(panel.panel.querySelector('.agent-panel__tab--chaos').textContent).toContain(
			'Slash knobs'
		);
		unregister();
		expect(panel.tabs.root.hidden).toBe(true);
		expect(panel.tabs.current).toBe('agent');
	});
});

describe('empty state on a loaded font (bug 16)', () => {
	it('suggests edits, not "What are we drawing?", when the set already has glyphs', () => {
		const editor = makeEditor({ glyphs: [A, B] });
		const panel = panelFixture({ getEditor: () => editor, controller: fakeController() });
		expect(panel.thread.querySelector('.agent-panel__empty-title').textContent).toBe(
			'What should we change?'
		);
		const chips = [...panel.thread.querySelectorAll('.agent-suggestion')].map((b) => b.textContent);
		expect(chips).toEqual(['Make it bolder', 'Restyle from A', 'Fix spacing', 'imageAdd a sketch']);
	});

	it('an empty font still asks what we are drawing', () => {
		const editor = makeEditor();
		const panel = panelFixture({ getEditor: () => editor, controller: fakeController() });
		expect(panel.thread.querySelector('.agent-panel__empty-title').textContent).toBe(
			'What are we drawing?'
		);
	});
});

describe('per-glyph receipts: Keep / Retry / Undo on each edited glyph', () => {
	function draftEditor() {
		const editor = makeEditor({ glyphs: [A, B] });
		// A and B are Drafts the agent drew (A was empty before, B had a box).
		editor.glyphStatus.set(A, 'draft', 'agent', { preDraft: { glyph: null } });
		editor.glyphStatus.set(B, 'draft', 'agent', {
			preDraft: { glyph: copy(editor.project.glyphs[B].save()) },
		});
		return editor;
	}

	it('a multi-glyph receipt offers Keep N and Undo N, and each glyph its own row', () => {
		const editor = draftEditor();
		setCurrentProjectEditor(editor);
		const panel = panelFixture({ getEditor: () => editor, controller: fakeController() });
		const card = panel.addCard('agent-receipt-card', {
			cardId: 'chat-receipt-x',
			glyphs: [
				{ char: 'A', status: 'new' },
				{ char: 'B', status: 'changed' },
			],
		});
		const below = [...card.querySelectorAll('.agent-receipt__actions button')].map((b) =>
			b.textContent.trim()
		);
		expect(below).toEqual(['checkKeep 2', 'undoUndo 2']);
		const glyphs = [...card.querySelectorAll('.agent-glyph-pick')];
		expect(glyphs.map((b) => b.tabIndex)).toEqual([0, -1]);
		glyphs[0].focus();
		keyDown(glyphs[0], 'ArrowRight');
		expect(document.activeElement).toBe(glyphs[1]);
		glyphs[1].click();
		const row = card.querySelector('.agent-receipt__glyph-actions');
		expect(row.textContent).toContain('B · draft');
		expect([...row.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual([
			'checkKeep',
			'refreshRetry',
			'undoUndo',
		]);
		const events = [];
		panel.host.addEventListener(CARD_ACTION_EVENT, (event) => events.push(event.detail));
		row.querySelector('[data-action="undo-one"]').click();
		expect(events[0]).toMatchObject({ action: 'undo', glyphIds: [B] });
	});

	it('Undo puts a Draft back in one history entry; Keep keeps it', () => {
		const editor = draftEditor();
		setCurrentProjectEditor(editor);
		const panel = panelFixture({ getEditor: () => editor, controller: fakeController() });
		const card = panel.addCard('agent-receipt-card', {
			cardId: 'chat-receipt-y',
			glyphs: [
				{ char: 'A', status: 'new' },
				{ char: 'B', status: 'changed' },
			],
		});
		// One review action is one history step: the same as a single Keep.
		const other = draftEditor();
		const keepBefore = other.history.queue.length;
		keepGlyphs(other, [A]);
		const oneStep = other.history.queue.length - keepBefore;
		const before = editor.history.queue.length;
		card.querySelector('[data-action="undo"]').click();
		expect(editor.glyphStatus.getStatus(A)).toBe('empty');
		expect(editor.glyphStatus.getStatus(B)).toBe('kept');
		expect(editor.history.queue.length - before).toBe(oneStep);
		expect(panel.thread.textContent).toContain('Undid A B');
	});

	it('Retry on a Draft asks the agent for another take of that glyph', async () => {
		const editor = draftEditor();
		setCurrentProjectEditor(editor);
		const controller = fakeController();
		const panel = panelFixture({ getEditor: () => editor, controller });
		const card = panel.addCard('agent-receipt-card', {
			cardId: 'chat-receipt-z',
			glyphs: [{ char: 'B', status: 'changed' }],
		});
		const buttons = [...card.querySelectorAll('.agent-receipt__actions button')].map((b) =>
			b.textContent.trim()
		);
		expect(buttons).toEqual(['checkKeep B', 'refreshRetry B', 'undoUndo']);
		card.querySelector('[data-action="retry-one"]').click();
		await flush();
		expect(controller.run).toHaveBeenCalledWith('Redraw B: try a different take, same style.', [], {
			requireGlyph: false,
		});
	});

	it('Re-roll on a Remix take asks for that glyph again with a new seed (PR D)', async () => {
		const editor = draftEditor();
		setCurrentProjectEditor(editor);
		const controller = fakeController();
		const panel = panelFixture({ getEditor: () => editor, controller });
		const card = panel.addCard('agent-receipt-card', {
			cardId: 'chat-receipt-r',
			glyphs: [{ char: 'B', status: 'changed', seed: 12 }],
		});
		card.querySelector('[data-action="reroll"]').click();
		await flush();
		const [prompt] = controller.run.mock.calls[0];
		const seed = Number(/B with seed (\d+)/.exec(prompt)?.[1]);
		expect(Number.isInteger(seed)).toBe(true);
		expect(prompt).toMatch(/draw_cards with that seed/);
	});
});
