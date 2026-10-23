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
		input.value = 'What can you do?';
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
		expect(controller.run).toHaveBeenCalledWith('What can you do?', []);
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
		expect(panel.pill.root.textContent).toContain('Needs you · 4 to review');
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
		// The "Connected" line stays: the first request has no old chat to clear.
		const kept = [...thread.querySelectorAll('agent-step-line[data-tone="kept"]')];
		expect(kept.map((line) => line.textContent).join('|')).toContain('set spacing');
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
		expect(threadCopyFor({ code: 'PROVIDER_UNAVAILABLE' }, 'openrouter')).toBe(
			"502 · OpenRouter isn't responding — try again, or pick another model."
		);
		expect(threadCopyFor({ code: 'CANCELLED' })).toBe('Provider not responding · try again');
	});

	it('a provider failure in the thread says what the connect flow says: status, plain words, the fix', () => {
		expect(threadCopyFor({ code: 'PROVIDER_AUTH', status: 401 }, 'openrouter')).toBe(
			'401 · Key not accepted — check you copied the whole key.'
		);
		expect(threadCopyFor({ code: 'PROVIDER_CREDITS', status: 402 }, 'openrouter')).toBe(
			'402 · Out of credits — add credits, or pick a free model.'
		);
		expect(threadCopyFor({ code: 'PROVIDER_LIMIT', status: 429 }, 'openrouter')).toBe(
			'429 · Rate limited — try another free model or wait a minute.'
		);
		expect(threadCopyFor({ code: 'NO_MODEL' })).toBe('Connect a model first');
		expect(threadCopyFor({ message: 'Something odd' })).toBe('Something odd');
	});

	it('card actions reach the controller, the composer or the review actions', async () => {
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
		expect(panel.thread.textContent).not.toContain('coming in M7');
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

	it('Keep reports what was actually kept (nothing without a project), in one line', () => {
		const panel = panelFixture({ controller: fakeController() });
		const card = panel.addCard('agent-receipt-card', {
			cardId: 'r1',
			glyphs: [{ char: 'a', status: 'changed' }],
		});
		card.querySelector('button[data-action="keep"]').click();
		const lines = [...panel.thread.querySelectorAll('agent-step-line')].map((l) => l.textContent);
		expect(lines.filter((text) => /Kept/.test(text))).toEqual(['check_circleDone: Kept 0 glyphs']);
		expect(lines.some((text) => /coming in M7/.test(text))).toBe(false);
	});

	describe('connect flow in the panel (#82)', () => {
		const model = (id, overrides = {}) => ({
			id,
			tools: true,
			vision: false,
			price: { input: 3, output: 15 },
			released: '2025-01-01',
			context: 200_000,
			text: true,
			deprecated: false,
			...overrides,
		});
		const free = { input: 0, output: 0 };
		const LIST = [
			model('vendor/free-one:free', { price: free }),
			model('vendor/paid-one'),
			model('vendor/paid-two'),
			model('vendor/no-tools', { tools: false }),
		];
		const memory = (initial = {}) => {
			const data = new Map(Object.entries(initial));
			return {
				data,
				getItem: (key) => (data.has(key) ? data.get(key) : null),
				setItem: vi.fn((key, value) => data.set(key, String(value))),
				removeItem: (key) => data.delete(key),
			};
		};
		const listOf = (models = LIST) => vi.fn(async () => ({ ok: true, models, freeRequests: null }));
		const host = (panel) => panel.thread.querySelector('.agent-connect-host');
		const option = (panel, id) =>
			[...host(panel).querySelectorAll('[role="option"]')].find((node) => node.dataset.id === id);
		const primary = (panel) => host(panel).querySelector('.agent-connect__primary');

		/** Drives the three steps: OpenRouter, a key, the pre-selected model. */
		async function connectedPanel({
			loadModels = listOf(),
			storage = memory(),
			check,
			key,
			controller,
		} = {}) {
			const panel = panelFixture({
				...(controller ? { controller } : {}),
				check: check ?? vi.fn(async () => ({ ok: true })),
				loadModels,
				storage,
				createSession: () => sessionStub(),
			});
			host(panel).querySelector('button[data-provider="openrouter"]').click();
			host(panel).querySelector('input.agent-field__input').value = key ?? 'sk-or-panel-secret';
			primary(panel).click();
			await flush();
			primary(panel).click();
			await flush();
			return { panel, loadModels, storage };
		}

		it('starts on the provider step: the mark, the title and the first step, with no model', () => {
			const panel = panelFixture({ controller: fakeController({ connected: false }) });
			expect(panel.thread.querySelector('.agent-panel__empty-title').textContent).toBe(
				'What are we drawing?'
			);
			expect(host(panel).querySelector('.agent-connect__title').textContent).toBe(
				'Choose a provider'
			);
			expect(panel.thread.querySelector('.agent-panel__chips').hidden).toBe(true);
			expect(
				panel.thread.querySelector('.agent-panel__empty').hasAttribute('data-connecting')
			).toBe(true);
		});

		it('hands the key to the controller once, blanks the panel’s copy, and never renders or stores it', async () => {
			const controller = fakeController({ connected: false });
			const seen = {};
			controller.connect = vi.fn((config) => {
				seen.connect = { ...config };
			});
			const check = vi.fn(async (config) => {
				seen.check = { ...config };
				return { ok: true };
			});
			const storage = memory();
			const setItem = vi.spyOn(Storage.prototype, 'setItem');
			const { panel } = await connectedPanel({ controller, check, storage, key: 'sk-very-secret' });
			expect(seen.check).toEqual({
				provider: 'openrouter',
				model: 'vendor/free-one:free',
				apiKey: 'sk-very-secret',
			});
			expect(seen.connect).toEqual(seen.check);
			// The panel drops its own copy once the controller has it.
			expect(controller.connect.mock.calls[0][0].apiKey).toBe('');
			expect(panel.host.outerHTML).not.toContain('sk-very-secret');
			expect(panel.host.textContent).not.toContain('sk-very-secret');
			// Only the provider and model are remembered, and never in the browser's real storage.
			expect(JSON.stringify([...storage.data.values()])).not.toContain('sk-very-secret');
			expect(setItem).not.toHaveBeenCalled();
		});

		it('once connected the card steps aside as one Connected row; the suggestions appear', async () => {
			const { panel } = await connectedPanel();
			expect(panel.controller.connected).toBe(true);
			expect(panel.model).toBe('vendor/free-one:free');
			const row = host(panel).querySelector('.agent-connected');
			expect(row.querySelector('.agent-connected__head').textContent).toContain('OpenRouter');
			expect(row.querySelector('.agent-connected__model').textContent).toBe('vendor/free-one:free');
			expect(host(panel).querySelector('form')).toBe(null);
			expect(panel.thread.querySelector('.agent-panel__chips').hidden).toBe(false);
			expect(
				panel.thread.querySelector('.agent-panel__empty').hasAttribute('data-connecting')
			).toBe(false);
			// The chip drops the vendor prefix; the Connected row keeps the whole ID.
			expect(panel.panel.querySelector('.agent-panel__model').textContent).toBe('free-one:free');
			// No step line is added: the Connected row is the feedback.
			expect(panel.thread.querySelectorAll('agent-step-line')).toHaveLength(0);
		});

		it('focus goes to the composer once connected', async () => {
			const { panel } = await connectedPanel();
			expect(document.activeElement).toBe(panel.composer.input);
		});

		it('Change opens the model step; choosing another model reconnects with it', async () => {
			const { panel } = await connectedPanel();
			host(panel).querySelector('.agent-connected button').click();
			expect(host(panel).querySelector('[role="listbox"]')).not.toBe(null);
			// Only models that work with Noddy's tools are offered.
			expect(option(panel, 'vendor/no-tools')).toBe(undefined);
			option(panel, 'vendor/paid-two').click();
			primary(panel).click();
			await flush();
			expect(panel.controller.connected).toBe(true);
			expect(panel.model).toBe('vendor/paid-two');
			expect(panel.panel.querySelector('.agent-panel__model').textContent).toBe('paid-two');
			expect(host(panel).querySelector('.agent-connected').textContent).toContain(
				'vendor/paid-two'
			);
		});

		it('Change brings the card back and the suggestions step aside until a model is connected again', async () => {
			const { panel } = await connectedPanel();
			const chips = panel.thread.querySelector('.agent-panel__chips');
			expect(chips.hidden).toBe(false);
			host(panel).querySelector('.agent-connected button').click();
			expect(chips.hidden).toBe(true);
			expect(
				panel.thread.querySelector('.agent-panel__empty').hasAttribute('data-connecting')
			).toBe(true);
			primary(panel).click();
			await flush();
			expect(chips.hidden).toBe(false);
		});

		it('a disconnect returns the card: the key is gone, the remembered model waits for a new key', async () => {
			const { panel } = await connectedPanel();
			panel.controller.disconnect();
			expect(panel.controller.connected).toBe(false);
			expect(host(panel).querySelector('form')).not.toBe(null);
			expect(host(panel).querySelector('.agent-connect__title').textContent).toBe(
				'Reconnect to OpenRouter'
			);
			expect(host(panel).querySelector('input.agent-field__input').value).toBe('');
			expect(host(panel).querySelector('[role="listbox"]')).toBe(null);
			expect(panel.thread.querySelector('.agent-panel__chips').hidden).toBe(true);
		});

		it('after the first message the card leaves the thread; clearing the chat brings the Connected row back', async () => {
			const { panel } = await connectedPanel();
			const root = host(panel);
			panel.handleEvent({ type: 'start', prompt: 'Draw a', attachments: [], context });
			panel.handleEvent({ type: 'finish' });
			expect(panel.thread.contains(root)).toBe(false);
			panel.handleEvent({ type: 'clear' });
			expect(panel.thread.contains(root)).toBe(true);
			expect(root.querySelector('.agent-connected')).not.toBe(null);
		});

		it('a reload asks only for the key: the remembered provider and model are offered', async () => {
			const storage = memory();
			const first = await connectedPanel({ storage });
			first.panel.dispose();
			panels.splice(panels.indexOf(first.panel), 1);
			const check = vi.fn(async () => ({ ok: true }));
			const panel = panelFixture({
				check,
				loadModels: listOf(),
				storage,
				createSession: () => sessionStub(),
			});
			expect(host(panel).querySelector('.agent-connect__title').textContent).toBe(
				'Reconnect to OpenRouter'
			);
			expect(host(panel).querySelector('.agent-connect__line').textContent).toBe(
				'Model: vendor/free-one:free'
			);
			host(panel).querySelector('input.agent-field__input').value = 'sk-or-panel-secret';
			primary(panel).click();
			await flush();
			expect(check).toHaveBeenCalledTimes(1);
			expect(check.mock.calls[0][0].model).toBe('vendor/free-one:free');
			expect(panel.model).toBe('vendor/free-one:free');
		});

		it('the fixes for a failed request appear when the request has ended, not while it is still open', async () => {
			const controller = fakeController({ connected: true, running: true });
			const panel = panelFixture({ controller });
			panel.handleEvent({
				type: 'connection',
				connected: true,
				provider: 'openrouter',
				model: 'a/b:free',
			});
			panel.handleEvent({ type: 'start', prompt: 'Draw a', attachments: [], context });
			panel.handleEvent({ type: 'error', message: 'x', code: 'PROVIDER_AUTH', status: 401 });
			const bubble = panel.thread.querySelector('.agent-bubble--error');
			expect(bubble.textContent).toContain('401 · Key not accepted');
			// The agent is still running: the buttons would do nothing yet, so they are not there.
			expect(bubble.querySelector('button')).toBe(null);
			controller.running = false;
			panel.handleEvent({ type: 'finish' });
			const labels = [...bubble.querySelectorAll('button')].map((button) => button.textContent);
			expect(labels).toEqual(['Change model', 'Re-enter key']);
			expect(bubble.textContent).toContain('This starts a new chat.');
		});

		it('Esc inside the card does not minimize the panel', async () => {
			const panel = panelFixture({ controller: fakeController({ connected: false }) });
			const row = host(panel).querySelector('button[data-provider="openrouter"]');
			row.focus();
			row.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			);
			expect(panel.mode).toBe('open');
		});

		it('a run error from the provider names the status and offers Change model; Change starts a new chat', async () => {
			const { panel } = await connectedPanel();
			panel.handleEvent({ type: 'start', prompt: 'Draw a', attachments: [], context });
			panel.handleEvent({
				type: 'error',
				message: 'The provider account is out of credits.',
				code: 'PROVIDER_CREDITS',
				status: 402,
			});
			const bubble = panel.thread.querySelector('.agent-bubble--error');
			expect(bubble.textContent).toContain(
				'402 · Out of credits — add credits, or pick a free model.'
			);
			const change = [...bubble.querySelectorAll('button')].find(
				(button) => button.textContent === 'Change model'
			);
			expect(bubble.textContent).toContain('This starts a new chat.');
			panel.handleEvent({ type: 'finish' });
			change.click();
			expect(host(panel).querySelector('[role="listbox"]')).not.toBe(null);
		});
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

describe('layout clear of the pill and panel (QA #60)', () => {
	const css = (file) => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');
	it('the minimized grid takes its full height so the 76px page padding sits below the last row', () => {
		const text = css('src/pages/workspace.css');
		expect(text).toMatch(
			/\[data-agent-panel='minimized'\] \.workspace__page \{\s*padding-bottom: 76px;/
		);
		expect(text).toMatch(
			/\[data-agent-panel='minimized'\] \.workspace__grid \{\s*flex-shrink: 0;\s*min-height: max-content;/
		);
	});
	it('old editor page chrome is positioned inside the left column and lifted above the pill', () => {
		const text = css('src/app/app.css');
		expect(text).toMatch(/#app__main-content \{[^}]*position: relative;/);
		expect(text).toMatch(
			/\[data-agent-panel='minimized'\] \.editor-page__zoom-area \{\s*bottom: calc\(52px/
		);
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
