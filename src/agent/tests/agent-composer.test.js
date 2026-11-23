// #126: the agent composer island on ui-sdk (agent-panel-composer.js + composer/agent-composer.jsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModeSettings, resetAgentControlsForTests, setMode } from '../agent-controls.js';
import { createPanelComposer } from '../ui/agent-panel-composer.js';
import {
	composerCommands,
	runComposerCommand,
	selectFromSlash,
} from '../ui/composer/agent-composer.jsx';
import { createAgentPanel } from '../ui/agent-panel.js';
import { registerChaosTool, resetChaosToolsForTests } from '../ui/agent-panel-tabs.js';

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
	input.dispatchEvent(
		new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })
	);
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

const file = (name) => new File(['x'], name, { type: 'image/png' });

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

	it('Enter while an IME is composing does not send', async () => {
		const onSubmit = vi.fn();
		const { input } = composerFixture({ onSubmit });
		type(input, 'にほん');
		keyDown(input, 'Enter', { isComposing: true });
		keyDown(input, 'Enter', { keyCode: 229 });
		await flush();
		expect(onSubmit).not.toHaveBeenCalled();
		keyDown(input, 'Enter');
		await flush();
		expect(onSubmit).toHaveBeenCalledTimes(1);
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
	const sketch = {
		id: 's1',
		kind: 'image',
		name: 'sketch.png',
		dataURL: 'data:image/png;base64,AA==',
	};

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

	/** A reader whose reads finish when the test says. */
	function deferredReader() {
		const pending = new Map();
		const read = vi.fn(
			(file) =>
				new Promise((resolve) => {
					pending.set(file.name, () =>
						resolve({ id: file.name, kind: 'image', name: file.name, dataURL: 'data:,' })
					);
				})
		);
		return { read, finish: (name) => pending.get(name)() };
	}
	const names = (composer) => composer.getDraft().attachments.map((item) => item.name);

	it('removing a file while another is read keeps it removed', async () => {
		const { read, finish } = deferredReader();
		const composer = composerFixture({ readAttachment: read });
		const first = composer.addFiles([file('a.png')]);
		finish('a.png');
		await first;
		const second = composer.addFiles([file('b.png')]);
		composer.root.querySelector('[aria-label="Remove a.png"]').click();
		expect(names(composer)).toEqual([]);
		finish('b.png');
		await second;
		expect(names(composer)).toEqual(['b.png']);
	});

	it('two batches that overlap both land, and Send waits for both', async () => {
		const { read, finish } = deferredReader();
		const composer = composerFixture({ readAttachment: read });
		const first = composer.addFiles([file('a.png'), file('c.png')]);
		const second = composer.addFiles([file('b.png')]);
		finish('b.png');
		await flush();
		finish('a.png');
		await flush();
		// The first batch is still reading c.png.
		expect(composer.send.disabled).toBe(true);
		finish('c.png');
		await Promise.all([first, second]);
		expect(names(composer)).toEqual(['b.png', 'a.png', 'c.png']);
		expect(composer.send.disabled).toBe(false);
	});

	it('clear() drops a file still being read', async () => {
		const { read, finish } = deferredReader();
		const composer = composerFixture({ readAttachment: read });
		const pending = composer.addFiles([file('a.png')]);
		composer.clear();
		finish('a.png');
		await pending;
		expect(names(composer)).toEqual([]);
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

	it('a drop on the Tools tab shows the Agent tab, so the file is not attached out of sight', async () => {
		registerChaosTool({ id: 'test-tool', label: 'Test tool', mount() {} });
		const panel = panelFixture();
		panel.tabs.select('chaos');
		const agentTab = panel.panel.querySelector('.agent-panel__tab--agent');
		expect(agentTab.hidden).toBe(true);
		const event = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'dataTransfer', {
			value: { types: ['Files'], files: [file('sketch.png')] },
		});
		panel.panel.querySelector('.agent-panel__tab--chaos').dispatchEvent(event);
		expect(panel.tabs.current).toBe('agent');
		expect(agentTab.hidden).toBe(false);
		await settle();
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

// jsdom cannot open the `/` list by typing, but the controller opens it for real (it types the
// `/`). The panel's key guard stops keys at the panel, so these run inside the real panel.
describe('the / list keys inside the panel', () => {
	it('Esc closes the list and only the list; typing on keeps it closed; the next Esc leaves the field', async () => {
		const panel = panelFixture();
		const { composer } = panel;
		composer.input.focus();
		composer.slashMenu.open({ trigger: '/' });
		await settle();
		expect(composer.slashMenu.isOpen()).toBe(true);
		keyDown(composer.input, 'Escape');
		await settle();
		expect(composer.slashMenu.isOpen()).toBe(false);
		expect(panel.mode).toBe('open');
		expect(document.activeElement).toBe(composer.input);
		type(composer.input, 'x');
		await settle();
		expect(composer.slashMenu.isOpen()).toBe(false);
		keyDown(composer.input, 'Escape');
		expect(document.activeElement).not.toBe(composer.input);
		expect(panel.mode).toBe('open');
	});

	it('Enter sends when nothing matches', async () => {
		const onSubmit = vi.fn();
		const composer = composerFixture({ onSubmit });
		// The panel's guard: keys stop at the panel and never reach `document`.
		composer.root.addEventListener('keydown', (event) => event.stopPropagation());
		composer.input.focus();
		composer.slashMenu.open({ trigger: '/' });
		await settle();
		const empty = composer.root.querySelector('.agent-menu--slash .agent-menu__empty');
		empty.setAttribute('data-empty', '');
		keyDown(composer.input, 'Enter');
		await flush();
		expect(composer.slashMenu.isOpen()).toBe(false);
		expect(onSubmit).toHaveBeenCalledWith({ prompt: '/', attachments: [] });
	});

	it('Esc on a keyboard-opened tooltip closes the tooltip, not the panel', async () => {
		const panel = panelFixture();
		const { composer } = panel;
		composer.plus.focus();
		composer.plus.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		await settle();
		const tip = document.getElementById(composer.plus.getAttribute('aria-describedby'));
		expect(tip.hasAttribute('data-open')).toBe(true);
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		composer.plus.dispatchEvent(event);
		await settle();
		expect(composer.handledEscape(event)).toBe(true);
		expect(panel.mode).toBe('open');
		expect(tip.hasAttribute('data-open')).toBe(false);
	});
});

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

describe('running a command from the + menu or the / list', () => {
	function context(overrides = {}) {
		const queued = [];
		return {
			queued,
			getEditor: () => null,
			settings: getModeSettings(null),
			actions: { openChooser: vi.fn(), useStarter: vi.fn() },
			openChaos: vi.fn(),
			afterMenuClose: (after) => queued.push(after),
			...overrides,
		};
	}

	it('from /, a starter replaces the typed word; other commands leave nothing behind', () => {
		const insert = vi.fn();
		const ctx = context();
		selectFromSlash('starter:Make it bolder', { insert }, ctx);
		expect(insert).toHaveBeenLastCalledWith('Make it bolder ');
		expect(ctx.actions.useStarter).not.toHaveBeenCalled();
		selectFromSlash('mode:wild', { insert }, ctx);
		expect(insert).toHaveBeenLastCalledWith('');
		expect(getModeSettings(null).mode).toBe('wild');
		selectFromSlash('attach', { insert }, ctx);
		expect(ctx.actions.openChooser).toHaveBeenCalledTimes(1);
	});

	it('Telephone toggles from what the list showed; Chaos opens at once from /', () => {
		setMode(null, 'remix');
		const insert = vi.fn();
		selectFromSlash('telephone', { insert }, context({ settings: getModeSettings(null) }));
		expect(getModeSettings(null).telephone).toBe(true);
		selectFromSlash('telephone', { insert }, context({ settings: getModeSettings(null) }));
		expect(getModeSettings(null).telephone).toBe(false);
		const ctx = context();
		selectFromSlash('chaos', { insert }, ctx);
		expect(ctx.openChaos).toHaveBeenCalledTimes(1);
	});

	it('from the + menu, Chaos and starters wait until the menu has closed', () => {
		const ctx = context();
		runComposerCommand('chaos', 'menu', ctx);
		runComposerCommand('starter:Fix spacing', 'menu', ctx);
		expect(ctx.openChaos).not.toHaveBeenCalled();
		expect(ctx.actions.useStarter).not.toHaveBeenCalled();
		ctx.queued.forEach((after) => after());
		expect(ctx.openChaos).toHaveBeenCalledTimes(1);
		expect(ctx.actions.useStarter).toHaveBeenCalledWith('Fix spacing');
	});
});

describe('starters from the + menu', () => {
	it('go in at the caret and keep the draft', async () => {
		const composer = composerFixture();
		composer.setStarters(['Make it bolder']);
		type(composer.input, 'Draw A with');
		composer.plus.click();
		await settle();
		const row = [...document.querySelectorAll('[role="menuitem"]')].find((item) =>
			item.textContent.includes('Make it bolder')
		);
		row.click();
		await settle();
		expect(composer.input.value).toBe('Draw A with Make it bolder');
		expect(composer.send.disabled).toBe(false);
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

	it('removes the drop zone and its overlay, drops reads in flight, and never submits after', async () => {
		const read = vi.fn(async () => ({ id: 'a', kind: 'image', name: 'a.png', dataURL: 'data:,' }));
		const onSubmit = vi.fn();
		const composer = createPanelComposer({ onSubmit, readAttachment: read });
		document.body.append(composer.root);
		const zone = document.createElement('div');
		document.body.append(zone);
		composer.bindDropZone(zone);
		const remove = vi.spyOn(zone, 'removeEventListener');
		composer.dispose();
		expect(zone.querySelector('.agent-drop-overlay')).toBe(null);
		expect(remove.mock.calls.map(([type]) => type).sort()).toEqual([
			'dragenter',
			'dragleave',
			'dragover',
			'drop',
		]);
		const drop = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(drop, 'dataTransfer', {
			value: { types: ['Files'], files: [file('a.png')] },
		});
		zone.dispatchEvent(drop);
		expect(drop.defaultPrevented).toBe(false);
		await composer.addFiles([file('a.png')]);
		expect(read).not.toHaveBeenCalled();
		composer.root.requestSubmit();
		await flush();
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
