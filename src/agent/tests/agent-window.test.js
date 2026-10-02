import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentWindow } from '../agent-window.js';
import { makeOpenProjectTabs } from '../../app/open_project.js';

const windows = [];
const context = {
	projectId: 'test-font',
	projectName: 'My Font',
	glyphId: 'glyph-0x41',
	writable: true,
};
function windowFixture(transport = vi.fn()) {
	const session = {
		getContext: () => context,
		execute: vi.fn(),
		undoLast: vi.fn(),
		dispose: vi.fn(),
	};
	const window = createAgentWindow({ createSession: () => session, transport });
	windows.push(window);
	return window;
}
afterEach(() => {
	windows.forEach((window) => window.dispose());
	windows.length = 0;
	document.body.replaceChildren();
});

describe('additive Agent window', () => {
	it('keeps focus safe when the project closes or session creation fails', () => {
		const dispose = vi.fn();
		const createSession = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new Error('No editor');
			})
			.mockReturnValue({
				getContext: () => {
					throw new Error('Project closed');
				},
				dispose,
			});
		const window = createAgentWindow({ createSession });
		windows.push(window);
		window.show();
		expect(window.root.querySelector('.agent-window__context').textContent).toContain(
			'Open a project'
		);
		window.composer.input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		expect(dispose).toHaveBeenCalledOnce();
		expect(window.root.hidden).toBe(false);
	});

	it('offers Messages only for Zen and resets protocol when switching providers', () => {
		const window = windowFixture();
		const [provider, protocol] = window.root.querySelectorAll('select');
		const messagesOption = protocol.querySelector('[value="messages"]');
		expect(messagesOption.disabled).toBe(true);
		expect(protocol.value).toBe('responses');
		provider.value = 'opencode-zen';
		provider.dispatchEvent(new Event('change'));
		expect(messagesOption.disabled).toBe(false);
		protocol.value = 'messages';
		provider.value = 'openai';
		provider.dispatchEvent(new Event('change'));
		expect(messagesOption.disabled).toBe(true);
		expect(protocol.value).toBe('responses');
	});
	it('welcome action reveals a composer before creating a project', () => {
		const tabs = makeOpenProjectTabs();
		document.body.append(tabs);
		const entry = Array.from(tabs.querySelectorAll('button')).find(
			(button) => button.textContent === 'Start from scratch with an agent'
		);
		const area = tabs.querySelector('#open-project__agent-start');
		expect(area.hidden).toBe(true);
		entry.click();
		expect(area.hidden).toBe(false);
		expect(entry.getAttribute('aria-expanded')).toBe('true');
		expect(document.activeElement).toBe(area.querySelector('textarea'));
		expect(tabs.querySelector('#input__new-project-name')).not.toBeNull();
	});

	it('shows and hides via the same toggle without replacing editor contents', () => {
		const editor = document.createElement('div');
		editor.textContent = 'existing canvas';
		document.body.append(editor);
		const toggle = document.createElement('button');
		toggle.className = 'agent-toggle';
		document.body.append(toggle);
		const window = windowFixture();
		window.toggle(toggle);
		expect(window.root.hidden).toBe(false);
		expect(toggle.getAttribute('aria-pressed')).toBe('true');
		window.toggle(toggle);
		expect(window.root.hidden).toBe(true);
		expect(editor.textContent).toBe('existing canvas');
		expect(document.activeElement).toBe(toggle);
	});

	it('retains a pending prompt and files until a model is configured', () => {
		const transport = vi.fn();
		const window = windowFixture(transport);
		window.start({
			prompt: 'Draw A from this reference',
			attachments: [{ id: 'font', kind: 'font', name: 'Reference.ttf', summary: {} }],
		});
		expect(window.composer.getDraft().prompt).toBe('Draw A from this reference');
		expect(window.composer.getDraft().attachments).toHaveLength(1);
		expect(window.root.querySelector('.agent-connection').hidden).toBe(false);
		expect(transport).not.toHaveBeenCalled();
	});

	it('renders model HTML as literal text and never saves the API key', async () => {
		const storage = vi.spyOn(Storage.prototype, 'setItem');
		const malicious = '<img src=x onerror=alert(1)>';
		const window = windowFixture(async () => ({
			text: malicious,
			messages: [{ role: 'assistant', content: malicious }],
			toolCalls: [],
		}));
		window.controller.connect({
			provider: 'openai',
			protocol: 'responses',
			model: 'fixture',
			apiKey: 'private-key',
		});
		await window.controller.run('Hello');
		expect(window.root.querySelector('.agent-messages img')).toBeNull();
		expect(window.root.querySelector('.agent-messages').textContent).toContain(malicious);
		expect(storage).not.toHaveBeenCalled();
		storage.mockRestore();
	});

	it('Escape closes only while focus is within the window', () => {
		const window = windowFixture();
		window.show();
		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(window.root.hidden).toBe(false);
		window.composer.input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		expect(window.root.hidden).toBe(true);
	});
});
