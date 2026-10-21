import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AGENT_PANEL_SLOT_ID,
	getAgentPanelMode,
	getAgentPanelSlot,
	makeWorkspace,
	resetAgentPanelSlotForTests,
	unmountAgentPanel,
} from '../../app/agent_panel_slot.js';
import { createAgentController } from '../agent-controller.js';
import {
	createAgentPanel,
	ensureAgentPanel,
	guardPanelKey,
	isAgentRunning,
	resetAgentPanelForTests,
	threadCopyFor,
} from '../ui/agent-panel.js';
import { CARD_ACTION_EVENT } from '../ui/cards/index.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const context = {
	projectId: 'test-font',
	projectName: 'Test',
	glyphId: 'glyph-0x61',
	writable: true,
};

function sessionStub(execute = vi.fn(async () => ({ ok: true, changed: true }))) {
	return { getContext: () => context, execute, undoLast: vi.fn(), dispose: vi.fn() };
}

/** A controller stand-in whose run state the test controls. */
function fakeController({ connected = true, running = false } = {}) {
	return {
		connected,
		running,
		references: [],
		stop: vi.fn(),
		run: vi.fn(async () => {}),
		connect: vi.fn(),
		disconnect: vi.fn(),
	};
}

const panels = [];
function panelFixture(options = {}) {
	const panel = createAgentPanel({ getEditor: () => null, probe: async () => true, ...options });
	document.body.append(panel.host);
	panels.push(panel);
	return panel;
}

beforeEach(() => {
	document.body.innerHTML = '<div id="app__wrapper"></div>';
	resetAgentPanelSlotForTests();
});

afterEach(() => {
	panels.forEach((panel) => panel.dispose());
	panels.length = 0;
	resetAgentPanelForTests();
	unmountAgentPanel();
	resetAgentPanelSlotForTests();
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

describe('agent panel shell (#19)', () => {
	it('mounts once in the persistent slot and opens the second column', () => {
		const workspace = makeWorkspace(document.createElement('div'));
		document.querySelector('#app__wrapper').append(workspace);
		const panel = ensureAgentPanel({ getEditor: () => null });
		expect(getAgentPanelSlot().contains(panel.host)).toBe(true);
		expect(workspace.querySelector(`#${AGENT_PANEL_SLOT_ID} #agent-panel`)).toBe(panel.panel);
		expect(workspace.getAttribute('data-agent-panel')).toBe('open');
		expect(ensureAgentPanel()).toBe(panel);
		expect(getAgentPanelSlot().querySelectorAll('#agent-panel')).toHaveLength(1);
	});

	it('header has a minimize button and no close control', () => {
		const panel = panelFixture({ controller: fakeController() });
		const buttons = [...panel.panel.querySelectorAll('header button')];
		expect(buttons).toHaveLength(1);
		expect(buttons[0].getAttribute('aria-label')).toBe('Minimize agent');
		expect(buttons[0].textContent).toBe('remove');
		const labels = [...panel.host.querySelectorAll('button')].map((b) =>
			`${b.getAttribute('aria-label')} ${b.textContent}`.toLowerCase()
		);
		expect(labels.some((text) => /close|hide/.test(text))).toBe(false);
	});

	it('empty state asks "What are we drawing?" with the connect card until a model is connected', () => {
		const panel = panelFixture({ controller: fakeController({ connected: false }) });
		expect(panel.thread.textContent).toContain('What are we drawing?');
		expect(panel.thread.querySelector('.agent-connect').hidden).toBe(false);
		expect(panel.thread.querySelector('.agent-panel__chips').hidden).toBe(true);
	});

	it('suggestion chips fill the composer; Add a sketch opens the file chooser', () => {
		const panel = panelFixture({ controller: fakeController({ connected: true }) });
		const chips = [...panel.thread.querySelectorAll('.agent-suggestion')];
		expect(chips.map((chip) => chip.textContent)).toEqual([
			'Clean simple sans',
			'Geometric',
			'imageAdd a sketch',
		]);
		chips[0].click();
		expect(panel.composer.input.value).toBe('Clean simple sans');
		const chooser = panel.composer.root.querySelector('input[type=file]');
		const click = vi.spyOn(chooser, 'click').mockImplementation(() => {});
		chips[2].click();
		expect(click).toHaveBeenCalled();
	});

	it('thread content is anchored at the bottom of the scroller', () => {
		const panel = panelFixture({ controller: fakeController() });
		const log = panel.thread.querySelector('.agent-panel__log');
		expect(log.parentElement).toBe(panel.thread);
		expect(panel.thread.getAttribute('role')).toBe('log');
	});
});

describe('composer (#19)', () => {
	it('Enter sends to the controller; Shift+Enter does not', async () => {
		const controller = fakeController();
		const panel = panelFixture({ controller });
		const { input } = panel.composer;
		input.value = 'Clean simple sans';
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
		);
		await flush();
		expect(controller.run).not.toHaveBeenCalled();
		input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
		);
		await flush();
		expect(controller.run).toHaveBeenCalledWith('Clean simple sans', []);
	});

	it('send is disabled while the input is empty', () => {
		const panel = panelFixture({ controller: fakeController() });
		expect(panel.composer.send.disabled).toBe(true);
		panel.composer.input.value = 'a';
		panel.composer.input.dispatchEvent(new Event('input'));
		expect(panel.composer.send.disabled).toBe(false);
	});

	it('attachments are read locally, shown as a removable chip and sent with the prompt', async () => {
		const controller = fakeController();
		const panel = panelFixture({ controller });
		const sketch = {
			id: 's1',
			kind: 'image',
			name: 'sketch.png',
			dataURL: 'data:image/png;base64,AA==',
		};
		const composer = panel.composer;
		// Swap the reader through addFiles' public surface: feed a prepared file.
		const read = vi.fn(async () => sketch);
		const { createPanelComposer } = await import('../ui/agent-panel-composer.js');
		const local = createPanelComposer({ onSubmit: vi.fn(), readAttachment: read });
		await local.addFiles([new File(['x'], 'sketch.png', { type: 'image/png' })]);
		expect(local.root.querySelector('.agent-attachment').textContent).toContain('sketch.png');
		local.root.querySelector('.agent-attachment__remove').click();
		expect(local.root.querySelector('.agent-attachment')).toBeNull();
		composer.setValue('Use this', [sketch]);
		composer.root.requestSubmit();
		await flush();
		expect(controller.run).toHaveBeenCalledWith('Use this', [sketch]);
	});

	it('without a model, send shows "Connect a model first" and keeps the draft', async () => {
		const panel = panelFixture({ controller: fakeController({ connected: false }) });
		panel.composer.setValue('Geometric');
		panel.composer.root.requestSubmit();
		await flush();
		await flush();
		expect(panel.thread.querySelector('.agent-bubble--error').textContent).toContain(
			'Connect a model first'
		);
		expect(panel.composer.input.value).toBe('Geometric');
	});

	it('with the relay offline, send shows the relay bubble instead', async () => {
		const panel = panelFixture({
			controller: fakeController({ connected: false }),
			probe: async () => false,
		});
		panel.composer.setValue('Geometric');
		panel.composer.root.requestSubmit();
		await flush();
		await flush();
		expect(panel.thread.querySelector('.agent-bubble--error').textContent).toContain(
			'Noddy relay is off · drawing by hand still works'
		);
	});
});

describe('minimize and pill (#20)', () => {
	it('minimize ↔ restore keeps the thread and never stops a running request', () => {
		const controller = fakeController({ running: true });
		const panel = panelFixture({ controller });
		panel.addStep('info', 'set spacing…');
		const before = panel.thread.innerHTML;
		panel.panel.querySelector('.agent-panel__minimize').click();
		expect(panel.mode).toBe('minimized');
		expect(getAgentPanelMode()).toBe('minimized');
		expect(panel.panel.hidden).toBe(true);
		expect(panel.pill.root.hidden).toBe(false);
		expect(panel.pill.root.dataset.phase).toBe('running');
		panel.pill.root.click();
		expect(panel.mode).toBe('open');
		expect(panel.thread.innerHTML).toBe(before);
		expect(controller.stop).not.toHaveBeenCalled();
		expect(controller.running).toBe(true);
	});

	it('Esc in the panel minimizes without stopping; Esc in the composer only blurs', () => {
		const controller = fakeController({ running: true });
		const panel = panelFixture({ controller });
		panel.composer.input.focus();
		panel.composer.input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		expect(panel.mode).toBe('open');
		expect(document.activeElement).not.toBe(panel.composer.input);
		const minimize = panel.panel.querySelector('.agent-panel__minimize');
		minimize.focus();
		minimize.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(panel.mode).toBe('minimized');
		expect(document.activeElement).toBe(panel.pill.root);
		expect(controller.stop).not.toHaveBeenCalled();
	});

	it('the pill is one focusable button with an accessible label and no stop control', () => {
		const panel = panelFixture({ controller: fakeController() });
		panel.minimize();
		const pill = panel.pill.root;
		expect(pill.tagName).toBe('BUTTON');
		expect(pill.querySelectorAll('button')).toHaveLength(0);
		expect(pill.getAttribute('aria-label')).toBe('Agent: Ask the agent. Open the agent panel');
	});

	it('pill shows Needs you from the status store when idle', () => {
		const editor = {
			glyphStatus: { listByStatus: () => ['glyph-0x61', 'glyph-0x62', 'glyph-0x63', 'glyph-0x64'] },
		};
		const panel = panelFixture({ controller: fakeController(), getEditor: () => editor });
		panel.minimize();
		expect(panel.pill.root.dataset.phase).toBe('needs-you');
		expect(panel.pill.root.textContent).toContain('4 glyphs to review');
	});

	it('pill shows run progress from setRunStatus', () => {
		const panel = panelFixture({ controller: fakeController({ running: true }) });
		panel.minimize();
		panel.setRunStatus({ glyph: 'h', done: 11, total: 62 });
		expect(panel.pill.root.textContent).toContain('Drafting h · 11/62');
	});

	it('focus mode does not stop a run (the panel never stops on its own)', async () => {
		const controller = fakeController({ running: true });
		const panel = panelFixture({ controller });
		panel.minimize();
		document.body.append(Object.assign(document.createElement('div'), { className: 'focus-mode' }));
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(controller.stop).not.toHaveBeenCalled();
	});
});

describe('controller wiring (#21)', () => {
	it('controller events become bubbles, step lines and a receipt card', async () => {
		const transport = vi
			.fn()
			.mockResolvedValueOnce({
				messages: [],
				toolCalls: [{ toolName: 'set_spacing', toolCallId: 'c1', input: {} }],
				text: '',
			})
			.mockResolvedValueOnce({ messages: [], toolCalls: [], text: 'Spacing set' });
		let panel;
		const controller = createAgentController({
			createSession: () => sessionStub(),
			transport,
			onEvent: (event) => panel.handleEvent(event),
		});
		panel = panelFixture({ controller });
		controller.connect({ provider: 'openai', model: 'gpt-5', apiKey: 'sk-secret-123' });
		expect(panel.panel.querySelector('.agent-panel__model').textContent).toBe('GPT-5');
		panel.composer.setValue('Tighten a');
		panel.composer.root.requestSubmit();
		await vi.waitFor(() => expect(controller.running).toBe(false));
		await flush();
		const thread = panel.thread;
		expect(thread.querySelector('.agent-bubble--user').textContent).toContain('Tighten a');
		expect(
			thread.querySelector('.agent-bubble--agent:not(.agent-bubble--typing)').textContent
		).toContain('Spacing set');
		expect(thread.querySelector('agent-step-line[data-tone="kept"]').textContent).toContain(
			'set spacing'
		);
		expect(thread.querySelector('agent-receipt-card')).not.toBeNull();
		expect(thread.querySelector('.agent-bubble--typing')).toBeNull();
		expect(panel.composer.input.value).toBe('');
		expect(thread.innerHTML).not.toContain('sk-secret-123');
	});

	it('relay offline during a run shows the one-line relay bubble', async () => {
		let panel;
		const transport = vi.fn(async () => {
			throw Object.assign(new Error('Cannot reach the agent relay.'), { code: 'RELAY_OFFLINE' });
		});
		const controller = createAgentController({
			createSession: () => sessionStub(),
			transport,
			onEvent: (event) => panel.handleEvent(event),
		});
		panel = panelFixture({ controller });
		controller.connect({ provider: 'openai', model: 'gpt-5', apiKey: 'k' });
		panel.composer.setValue('Draw a');
		panel.composer.root.requestSubmit();
		await vi.waitFor(() =>
			expect(panel.thread.querySelector('.agent-bubble--error')).not.toBeNull()
		);
		expect(panel.thread.querySelector('.agent-bubble--error').textContent).toContain(
			'Noddy relay is off · drawing by hand still works'
		);
	});

	it('relay offline and provider down have distinct copy', () => {
		expect(threadCopyFor({ code: 'RELAY_OFFLINE' })).toBe(
			'Noddy relay is off · drawing by hand still works'
		);
		expect(threadCopyFor({ code: 'PROVIDER_UNAVAILABLE' })).toBe(
			'Provider not responding · try again'
		);
	});

	it('card actions reach the controller, the composer or a visible M7 stub', async () => {
		const controller = fakeController();
		const panel = panelFixture({ controller });
		const fire = (detail) =>
			panel.thread.dispatchEvent(new CustomEvent(CARD_ACTION_EVENT, { bubbles: true, detail }));
		// Retry needs an earlier prompt: run one through the panel first.
		panel.handleEvent({ type: 'start', prompt: 'Draw a', attachments: [], context });
		panel.handleEvent({ type: 'finish' });
		fire({ action: 'retry', glyphIds: ['glyph-0x61'] });
		expect(controller.run).toHaveBeenCalledWith('Draw a', []);
		fire({ action: 'tweak', prefill: 'Tweak: ' });
		expect(panel.composer.input.value).toBe('Tweak: ');
		fire({ action: 'keep', glyphIds: ['glyph-0x61'] });
		expect(panel.thread.textContent).toContain('Keep is coming in M7');
		const openGlyph = vi.fn();
		const other = panelFixture({ controller: fakeController(), openGlyph });
		other.thread.dispatchEvent(
			new CustomEvent(CARD_ACTION_EVENT, {
				bubbles: true,
				detail: { action: 'edit-by-hand', glyphId: 'glyph-0x61' },
			})
		);
		expect(openGlyph).toHaveBeenCalledWith('glyph-0x61');
	});

	it('the connect card hands the key to the controller and never renders or stores it', async () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const controller = fakeController({ connected: false });
		const seen = {};
		controller.connect = vi.fn((config) => {
			seen.connect = { ...config };
		});
		const check = vi.fn(async (config) => {
			seen.check = config.apiKey;
			return { ok: true };
		});
		const panel = panelFixture({ controller, check });
		const card = panel.thread.querySelector('.agent-connect');
		const key = card.querySelector('input[type=password]');
		key.value = 'sk-very-secret';
		card.requestSubmit();
		await flush();
		expect(seen.check).toBe('sk-very-secret');
		expect(seen.connect).toEqual({ provider: 'openai', model: 'gpt-5', apiKey: 'sk-very-secret' });
		// The panel drops its own copy once the controller has it.
		expect(controller.connect.mock.calls[0][0].apiKey).toBe('');
		expect(key.value).toBe('');
		expect(panel.host.outerHTML).not.toContain('sk-very-secret');
		expect(setItem).not.toHaveBeenCalled();
	});

	it('isAgentRunning follows the panel controller', () => {
		expect(isAgentRunning()).toBe(false);
		const controller = fakeController({ running: true });
		ensureAgentPanel({ controller, getEditor: () => null });
		expect(isAgentRunning()).toBe(true);
	});
});

describe('keyboard isolation', () => {
	const fire = (init) => {
		const event = new KeyboardEvent('keydown', { bubbles: true, ...init });
		const stop = vi.spyOn(event, 'stopPropagation');
		guardPanelKey(event);
		return stop.mock.calls.length > 0;
	};
	it('stops plain keys from reaching canvas shortcuts', () => {
		expect(fire({ key: 'v' })).toBe(true);
		expect(fire({ key: 'Delete' })).toBe(true);
		expect(fire({ key: ' ' })).toBe(true);
	});
	it('lets modifier keys and Ctrl/Cmd combos through', () => {
		expect(fire({ key: 'Shift', shiftKey: true })).toBe(false);
		expect(fire({ key: 'Control', ctrlKey: true })).toBe(false);
		expect(fire({ key: 'Meta', metaKey: true })).toBe(false);
		expect(fire({ key: 'z', ctrlKey: true })).toBe(false);
		expect(fire({ key: 's', metaKey: true })).toBe(false);
	});
	it('the panel host applies the guard to keydown and keyup', () => {
		const panel = panelFixture({ controller: fakeController() });
		const outside = vi.fn();
		document.addEventListener('keydown', outside);
		document.addEventListener('keyup', outside);
		panel.composer.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
		panel.composer.input.dispatchEvent(new KeyboardEvent('keyup', { key: 'v', bubbles: true }));
		expect(outside).not.toHaveBeenCalled();
		panel.composer.input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
		expect(outside).toHaveBeenCalledTimes(1);
		document.removeEventListener('keydown', outside);
		document.removeEventListener('keyup', outside);
	});
});

describe('Codex UI removed (#21)', () => {
	const root = path.resolve(__dirname, '../../..');
	it('the floating window, its CSS and the old composer are gone', () => {
		for (const file of [
			'src/agent/agent-window.js',
			'src/agent/agent-window.css',
			'src/agent/agent-composer.js',
		])
			expect(fs.existsSync(path.join(root, file))).toBe(false);
	});
	it('no source references the floating window, top-bar toggle or welcome composer', () => {
		const sources = [
			'src/app/menu.js',
			'src/app/open_project.js',
			'src/app/leave_guard.js',
			'src/app/top_bar.js',
		];
		for (const file of sources) {
			const text = fs.readFileSync(path.join(root, file), 'utf8');
			expect(text).not.toMatch(
				/agent-window|makeAgentToggle|createAgentComposer|agent-start|getAgentWindow/
			);
		}
	});
});
