import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentComposer } from '../agent-composer.js';

afterEach(() => document.body.replaceChildren());

describe('agent composer', () => {
	it.each(['clear', 'setValue', 'dispose'])(
		'ignores an attachment that finishes after %s',
		async (action) => {
			let finishRead;
			const readAttachment = vi.fn(
				() =>
					new Promise((resolve) => {
						finishRead = resolve;
					})
			);
			const composer = createAgentComposer({ onSubmit: vi.fn(), readAttachment });
			const reading = composer.addFiles([new File(['pending'], 'font.ttf')]);
			if (action === 'setValue') composer.setValue('New draft', []);
			else composer[action]();
			finishRead({ id: 'late', kind: 'font', name: 'font.ttf', size: 7, summary: {} });
			await reading;
			expect(composer.getDraft().attachments).toEqual([]);
			expect(composer.root.querySelector('.agent-composer__status').textContent).not.toContain(
				'Ready.'
			);
			if (action === 'setValue') expect(composer.getDraft().prompt).toBe('New draft');
		}
	);

	it('a superseded read cannot re-enable Send while a newer file is still reading', async () => {
		const resolvers = [];
		const composer = createAgentComposer({
			onSubmit: vi.fn(),
			readAttachment: () => new Promise((resolve) => resolvers.push(resolve)),
		});
		const first = composer.addFiles([new File(['first'], 'first.ttf')]);
		composer.clear();
		const second = composer.addFiles([new File(['second'], 'second.ttf')]);
		resolvers[0]({ id: 'first', kind: 'font', name: 'first.ttf', size: 5 });
		await first;
		expect(composer.root.querySelector('[type=submit]').disabled).toBe(true);
		resolvers[1]({ id: 'second', kind: 'font', name: 'second.ttf', size: 6 });
		await second;
		expect(composer.getDraft().attachments.map((file) => file.id)).toEqual(['second']);
		expect(composer.root.querySelector('[type=submit]').disabled).toBe(false);
	});
	it('requires explicit Send, supports Shift+Enter, and submits the welcome draft intact', async () => {
		const onSubmit = vi.fn();
		const composer = createAgentComposer({ onSubmit, submitLabel: 'Start with agent' });
		document.body.append(composer.root);
		composer.input.value = 'Draw a geometric A';
		composer.input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
		);
		expect(onSubmit).not.toHaveBeenCalled();
		composer.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(onSubmit).toHaveBeenCalledWith({ prompt: 'Draw a geometric A', attachments: [] });
	});

	it('owns drops so the existing page cannot import a reference font inadvertently', () => {
		const pageDrop = vi.fn();
		document.body.addEventListener('drop', pageDrop, { once: true });
		const composer = createAgentComposer({ onSubmit: vi.fn() });
		document.body.append(composer.root);
		const event = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'dataTransfer', { value: { files: [] } });
		composer.root.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(pageDrop).not.toHaveBeenCalled();
		document.body.removeEventListener('drop', pageDrop);
	});

	it('keeps focus on the input while running and turns Send into Stop', () => {
		const onStop = vi.fn();
		const onSubmit = vi.fn();
		const composer = createAgentComposer({ onSubmit, onStop });
		document.body.append(composer.root);
		composer.input.focus();
		composer.setBusy(true);
		expect(document.activeElement).toBe(composer.input);
		expect(composer.input.readOnly).toBe(true);
		composer.root.querySelector('[type=submit]').click();
		expect(onStop).toHaveBeenCalledOnce();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('renders untrusted attachment names as text and supports removal', () => {
		const composer = createAgentComposer({ onSubmit: vi.fn() });
		composer.setValue('Inspect', [
			{ id: 'f', name: '<img src=x onerror=alert(1)>.ttf', kind: 'font' },
		]);
		expect(composer.root.querySelectorAll('img')).toHaveLength(0);
		composer.root.querySelector('[aria-label^=Remove]').click();
		expect(composer.getDraft().attachments).toEqual([]);
	});

	it('rejects unsupported files without losing the prompt', async () => {
		const composer = createAgentComposer({ onSubmit: vi.fn() });
		composer.input.value = 'My original prompt';
		await composer.addFiles([new File(['invalid'], 'notes.txt', { type: 'text/plain' })]);
		expect(composer.input.value).toBe('My original prompt');
		expect(composer.getDraft().attachments).toEqual([]);
		expect(composer.root.textContent).toContain('Attach a PNG');
	});
});
