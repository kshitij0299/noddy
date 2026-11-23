// #126: the agent composer island on ui-sdk (agent-panel-composer.js + composer/agent-composer.jsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAgentControlsForTests } from '../agent-controls.js';
import { createPanelComposer } from '../ui/agent-panel-composer.js';
import { composerCommands } from '../ui/composer/agent-composer.jsx';
import { createAgentPanel } from '../ui/agent-panel.js';
import { resetChaosToolsForTests } from '../ui/agent-panel-tabs.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle() {
	for (let i = 0; i < 4; i++) await flush();
}

const keyDown = (target, key, init = {}) =>
	target.dispatchEvent(
		new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
	);

/** Types text at the end of the textarea, as a user would (one input event). */
function type(input, text) {
	input.focus();
	input.value += text;
	input.setSelectionRange(input.value.length, input.value.length);
	input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
}

function fakeController() {
	return {
		connected: true,
		running: false,
		references: [],
		stop: vi.fn(),
		run: vi.fn(async () => {}),
		connect: vi.fn(),
		disconnect: vi.fn(),
		clear: vi.fn(),
	};
}

const cleanups = [];
function composerFixture(options = {}) {
	const composer = createPanelComposer({ onSubmit: vi.fn(), getEditor: () => null, ...options });
	document.body.append(composer.root);
	cleanups.push(() => composer.dispose());
	return composer;
}

function panelFixture(options = {}) {
	const panel = createAgentPanel({
		getEditor: () => null,
		probe: async () => true,
		loadLocalAgent: null,
		controller: fakeController(),
		...options,
	});
	document.body.append(panel.host);
	cleanups.push(() => panel.dispose());
	return panel;
}

beforeEach(() => {
	document.body.innerHTML = '';
	sessionStorage.clear();
	resetAgentControlsForTests();
	resetChaosToolsForTests();
});

afterEach(() => {
	cleanups.splice(0).forEach((dispose) => dispose());
	document.body.innerHTML = '';
	resetAgentControlsForTests();
	vi.restoreAllMocks();
});

describe('textarea', () => {
	it('is 16px-ready, spellchecked, one line to start, named by its placeholder', () => {
		const { input } = composerFixture();
		expect(input.tagName).toBe('TEXTAREA');
		expect(input.placeholder).toBe('Ask the agent');
		expect(input.getAttribute('aria-label')).toBe('Ask the agent');
		expect(input.getAttribute('spellcheck')).toBe('true');
		expect(input.rows).toBe(1);
		expect(input.className).toContain('agent-composer__input');
	});

	it('Enter submits, Shift+Enter does not', async () => {
		const onSubmit = vi.fn();
		const { input } = composerFixture({ onSubmit });
		type(input, 'Hello');
		keyDown(input, 'Enter', { shiftKey: true });
		await flush();
		expect(onSubmit).not.toHaveBeenCalled();
		keyDown(input, 'Enter');
		await flush();
		expect(onSubmit).toHaveBeenCalledWith({ prompt: 'Hello', attachments: [] });
	});

	it('the placeholder follows the local agent', () => {
		const composer = composerFixture();
		composer.setPlaceholder('Message Claude Code');
		expect(composer.input.placeholder).toBe('Message Claude Code');
		expect(composer.input.getAttribute('aria-label')).toBe('Message Claude Code');
	});
});

describe('Send and Stop', () => {
	it('Send is ready only with text; during a run it is Stop and typing still works', async () => {
		const onStop = vi.fn();
		const onSubmit = vi.fn();
		const composer = composerFixture({ onStop, onSubmit });
		const { input, send } = composer;
		expect(send.disabled).toBe(true);
		expect(send.getAttribute('aria-label')).toBe('Send');
		type(input, 'Draw a');
		expect(send.disabled).toBe(false);
		composer.setBusy(true);
		expect(send.getAttribute('aria-label')).toBe('Stop the agent');
		expect(send.classList.contains('is-stop')).toBe(true);
		expect(send.disabled).toBe(false);
		expect(input.disabled).toBe(false);
		// Typing while it runs queues the next message; Enter does not stop or send.
		type(input, ' and b');
		keyDown(input, 'Enter');
		await flush();
		expect(onStop).not.toHaveBeenCalled();
		expect(onSubmit).not.toHaveBeenCalled();
		send.click();
		await flush();
		expect(onStop).toHaveBeenCalledTimes(1);
		composer.setBusy(false);
		expect(send.getAttribute('aria-label')).toBe('Send');
		expect(input.value).toBe('Draw a and b');
	});

	it('the + menu cannot add a sketch during a run', async () => {
		const composer = composerFixture();
		composer.setBusy(true);
		const chooser = composer.root.querySelector('input[type=file]');
		const click = vi.spyOn(chooser, 'click').mockImplementation(() => {});
		composer.openChooser();
		expect(click).not.toHaveBeenCalled();
		composer.plus.click();
		await settle();
		const add = document
			.getElementById(composer.plus.getAttribute('aria-controls'))
			.querySelector('[role="menuitem"]');
		expect(add.getAttribute('aria-disabled')).toBe('true');
	});
});

describe('attachments', () => {
	const sketch = { id: 's1', kind: 'image', name: 'sketch.png', dataURL: 'data:image/png;base64,AA==' };

	it('show above the input with an always-visible, labelled remove button', async () => {
		const composer = composerFixture({ readAttachment: vi.fn(async () => sketch) });
		await composer.addFiles([new File(['x'], 'sketch.png', { type: 'image/png' })]);
		const chip = composer.root.querySelector('.agent-attachment');
		expect(chip.textContent).toContain('sketch.png');
		// Above the textarea, inside the same box.
		expect(
			chip.compareDocumentPosition(composer.input) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		const remove = chip.querySelector('button');
		expect(remove.getAttribute('aria-label')).toBe('Remove sketch.png');
		expect(composer.send.disabled).toBe(false);
		remove.click();
		expect(composer.root.querySelector('.agent-attachment')).toBe(null);
		expect(document.activeElement).toBe(composer.input);
		expect(composer.send.disabled).toBe(true);
	});

	it('dropping an image anywhere on the panel attaches it, with an overlay while dragging', async () => {
		const read = vi.fn(async () => sketch);
		const panel = panelFixture();
		// The panel's own composer reads files through its default reader: swap in a fake one.
		const composer = createPanelComposer({ onSubmit: vi.fn(), readAttachment: read });
		cleanups.push(() => composer.dispose());
		const zone = document.createElement('div');
		document.body.append(zone);
		composer.bindDropZone(zone);
		const overlay = zone.querySelector('.agent-drop-overlay');
		expect(overlay.hidden).toBe(true);
		const file = new File(['x'], 'sketch.png', { type: 'image/png' });
		const drag = (type) => {
			const event = new Event(type, { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'dataTransfer', {
				value: { types: ['Files'], files: [file], dropEffect: 'none' },
			});
			zone.dispatchEvent(event);
			return event;
		};
		expect(drag('dragenter').defaultPrevented).toBe(true);
		expect(overlay.hidden).toBe(false);
		drag('drop');
		expect(overlay.hidden).toBe(true);
		await settle();
		expect(read).toHaveBeenCalledWith(file);
		expect(composer.root.querySelector('.agent-attachment').textContent).toContain('sketch.png');
		// The panel binds its own drop zone too.
		expect(panel.panel.querySelector('.agent-drop-overlay')).not.toBe(null);
	});

	it('a text drag is not a file drop: no overlay', () => {
		const composer = composerFixture();
		const zone = document.createElement('div');
		document.body.append(zone);
		composer.bindDropZone(zone);
		const event = new Event('dragenter', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'dataTransfer', { value: { types: ['text/plain'] } });
		zone.dispatchEvent(event);
		expect(zone.querySelector('.agent-drop-overlay').hidden).toBe(true);
	});
});

// Opening the `/` list needs real typing (jsdom cannot drive ui-sdk's trigger menu); the browser
// check in the PR covers typing, filtering, Enter and Esc. Here: the wiring and the shared list.
describe('the / list (same commands as the + menu)', () => {
	it('the textarea is the trigger menu input', () => {
		const { input } = composerFixture();
		expect(input.getAttribute('aria-haspopup')).toBe('listbox');
		expect(input.getAttribute('aria-autocomplete')).toBe('list');
	});

	it('lists the sketch, the modes and the starters; Chaos and Telephone only in Remix and Wild', () => {
		const exact = composerCommands({
			busy: false,
			settings: { mode: 'exact', chaos: 50, telephone: false },
			starters: ['Make it bolder'],
		});
		expect(exact.map((command) => command.value)).toEqual([
			'attach',
			'mode:exact',
			'mode:remix',
			'mode:wild',
			'starter:Make it bolder',
		]);
		expect(exact.map((command) => command.group)).toEqual([
			'Add',
			'Mode',
			'Mode',
			'Mode',
			'Start with',
		]);
		const remix = composerCommands({
			busy: true,
			settings: { mode: 'remix', chaos: 70, telephone: true },
			starters: [],
		});
		expect(remix.find((command) => command.value === 'attach').disabled).toBe(true);
		expect(remix.filter((command) => command.group === 'Mode').map((c) => c.label)).toEqual([
			'Exact mode',
			'Remix mode',
			'Wild mode',
			'Chaos 70',
			'Telephone on',
		]);
	});
});

describe('icon-only buttons', () => {
	it('are named and have a tooltip', () => {
		const composer = composerFixture();
		for (const button of [composer.plus, composer.send]) {
			expect(button.getAttribute('aria-label')).toBeTruthy();
			const tip = document.getElementById(button.getAttribute('aria-describedby'));
			expect(tip?.getAttribute('role')).toBe('tooltip');
		}
	});
});

describe('dispose', () => {
	it('unmounts the island and stops listening to the controls', () => {
		const composer = createPanelComposer({ onSubmit: vi.fn() });
		document.body.append(composer.root);
		composer.dispose();
		expect(composer.root.querySelector('textarea')).toBe(null);
		// A controls change after dispose must not throw (no React root left).
		expect(() => resetAgentControlsForTests()).not.toThrow();
	});
});
