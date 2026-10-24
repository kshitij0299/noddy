import { describe, expect, it, vi } from 'vitest';
import { createAgentController } from '../agent-controller.js';

const context = {
	projectId: 'font-1',
	projectName: 'Font',
	glyphId: 'glyph-0x41',
	revision: 'r1',
	selection: { pathIndices: [0], pointIndices: [] },
	unitsPerEm: 1000,
	writable: true,
};
const config = {
	provider: 'openai',
	protocol: 'responses',
	model: 'test-model',
	apiKey: 'not-a-real-key',
};
const reply = (text = 'Done') => ({
	text,
	messages: [{ role: 'assistant', content: text }],
	toolCalls: [],
});
const tool = (id = 'call-1') => ({
	text: '',
	messages: [
		{
			role: 'assistant',
			content: [
				{
					type: 'tool-call',
					toolCallId: id,
					toolName: 'set_spacing',
					input: { rightSideBearing: 60 },
				},
			],
		},
	],
	toolCalls: [{ toolCallId: id, toolName: 'set_spacing', input: { rightSideBearing: 60 } }],
});

function setup(transport, options = {}) {
	const events = [];
	const session = {
		getContext: vi.fn(() => context),
		execute: vi.fn(() => ({ ok: true, changed: true, context })),
		undoLast: vi.fn(() => ({ ok: true })),
		dispose: vi.fn(),
	};
	const controller = createAgentController({
		createSession: () => session,
		transport,
		onEvent: (event) => events.push(event),
		...options,
	});
	controller.connect(config);
	return { controller, session, events };
}

describe('agent runner', () => {
	it('times out per model step, not per run: slow steps that each fit still finish', async () => {
		const later = (value) => () => new Promise((resolve) => setTimeout(() => resolve(value), 40));
		const transport = vi
			.fn()
			.mockImplementationOnce(later(tool('call-1')))
			.mockImplementationOnce(later(tool('call-2')))
			.mockImplementationOnce(later(reply('Done')));
		const { controller, events } = setup(transport, { timeoutMs: 70 });
		await controller.run('Edit this glyph');
		expect(transport).toHaveBeenCalledTimes(3);
		expect(events.some((event) => event.type === 'error')).toBe(false);
	});
	it('still times out one step that takes too long', async () => {
		const transport = vi.fn(
			(_request, signal) =>
				new Promise((_, reject) => {
					signal.addEventListener('abort', () => reject(new Error('aborted')));
				})
		);
		const { controller, events } = setup(transport, { timeoutMs: 30 });
		await controller.run('Edit this glyph');
		expect(events.find((event) => event.type === 'error')?.code).toBe('TIMEOUT');
	});
	it('resolves the Muse automatic route locally and sends Auto for independent server validation', async () => {
		const transport = vi.fn().mockResolvedValue(reply('Ready'));
		const { controller, events } = setup(transport);
		controller.connect({
			provider: 'opencode-zen',
			protocol: 'auto',
			model: 'muse-spark-1.3-contributor-free',
			apiKey: 'not-a-real-key',
		});
		expect(events.at(-1).effectiveProtocol).toBe('responses');
		await controller.run('Read this glyph');
		expect(transport.mock.calls[0][0]).toMatchObject({
			provider: 'opencode-zen',
			model: 'muse-spark-1.3-contributor-free',
			protocol: 'auto',
		});
	});
	it('connects to Anthropic, resolves Messages locally and sends Auto to the relay', async () => {
		const transport = vi.fn().mockResolvedValue(reply('Ready'));
		const { controller, events } = setup(transport);
		controller.connect({
			provider: 'anthropic',
			protocol: 'auto',
			model: 'claude-sonnet-5-5',
			apiKey: 'not-a-real-key',
		});
		expect(events.at(-1)).toMatchObject({
			type: 'connection',
			connected: true,
			provider: 'anthropic',
			model: 'claude-sonnet-5-5',
			effectiveProtocol: 'messages',
		});
		await controller.run('Read this glyph');
		expect(transport.mock.calls[0][0]).toMatchObject({
			provider: 'anthropic',
			model: 'claude-sonnet-5-5',
			protocol: 'auto',
		});
	});
	it('refuses an Anthropic connection with a format Anthropic does not speak, or an unknown provider', () => {
		const { controller } = setup(vi.fn());
		const anthropic = { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'k' };
		expect(() => controller.connect({ ...anthropic, protocol: 'responses' })).toThrow(
			'Choose an API format supported by the selected provider.'
		);
		expect(() => controller.connect({ ...anthropic, provider: 'anthropic-eu' })).toThrow(
			'Choose a provider and enter a model ID and API key.'
		);
		expect(() => controller.connect({ ...anthropic, provider: '__proto__' })).toThrow(
			'Choose a provider and enter a model ID and API key.'
		);
	});
	it('rejects Overview requests before contacting the model or consuming attachments', async () => {
		const transport = vi.fn();
		const { controller, session, events } = setup(transport);
		session.getContext.mockReturnValue({ ...context, glyphId: false, writable: false });
		const references = [{ id: 'font', kind: 'font', name: 'reference.ttf', summary: {} }];
		await expect(controller.run('Edit this font', references)).rejects.toThrow(
			'Select a glyph in Characters'
		);
		expect(session.dispose).toHaveBeenCalledOnce();
		expect(transport).not.toHaveBeenCalled();
		expect(events.some((event) => event.type === 'start')).toBe(false);
		expect(controller.references).toEqual([]);
		expect(references).toHaveLength(1);
	});
	it('always finishes cleanly when the project is closed while the provider is thinking', async () => {
		let resolve;
		const { controller, session, events } = setup(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const run = controller.run('Move A');
		session.getContext.mockImplementation(() => {
			throw new Error('Project closed');
		});
		session.execute.mockReturnValue({
			ok: false,
			error: { code: 'PROJECT_CHANGED', message: 'Project closed' },
		});
		resolve(tool());
		await expect(run).resolves.toBeUndefined();
		expect(controller.running).toBe(false);
		expect(events.at(-1)).toEqual({ type: 'finish', context: undefined });
	});

	it('keeps the previous edit available for undo after a read-only followup', async () => {
		const first = {
			getContext: () => context,
			execute: () => ({ ok: true, changed: true }),
			undoLast: vi.fn(() => ({ ok: true })),
			dispose: vi.fn(),
		};
		const second = { getContext: () => context, execute: () => ({ ok: true }), dispose: vi.fn() };
		const createSession = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
		const transport = vi
			.fn()
			.mockResolvedValueOnce(tool())
			.mockResolvedValueOnce(reply())
			.mockResolvedValueOnce(reply('The spacing looks wider.'));
		const { controller } = setup(transport, { createSession });
		await controller.run('Change spacing');
		await controller.run('What changed?');
		expect(second.dispose).toHaveBeenCalled();
		expect(first.dispose).not.toHaveBeenCalled();
		expect(controller.undo()).toEqual({ ok: true });
	});

	it('reports an empty or truncated response honestly', async () => {
		const { controller, events } = setup(
			vi
				.fn()
				.mockResolvedValueOnce(reply(''))
				.mockResolvedValueOnce({ ...reply(''), finishReason: 'length' })
		);
		await controller.run('Anything?');
		expect(events.find((event) => event.type === 'text').text).toBe(
			'The model returned no message. No font edits were made.'
		);
		await controller.run('Try again');
		expect(events.find((event) => event.type === 'error').message).toContain('response limit');
	});

	it('rejects the Messages protocol for OpenAI before any request', () => {
		const { controller } = setup(vi.fn());
		expect(() => controller.connect({ ...config, protocol: 'messages' })).toThrow(
			'Choose an API format supported by the selected provider.'
		);
	});
	it('does not contact a provider merely by configuring credentials', () => {
		const transport = vi.fn();
		const { controller } = setup(transport);
		expect(controller.connected).toBe(true);
		expect(transport).not.toHaveBeenCalled();
		controller.disconnect();
		expect(controller.connected).toBe(false);
	});

	it('preserves opaque assistant continuation and sends native results before the next step', async () => {
		const first = tool();
		first.messages[0].providerOptions = { openai: { itemId: 'opaque-reasoning' } };
		const transport = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(reply());
		const { controller, session } = setup(transport);
		await controller.run('Give A 20 more units on the right');
		expect(session.execute).toHaveBeenCalledWith(
			'set_spacing',
			{ rightSideBearing: 60 },
			expect.objectContaining({ callId: 'call-1', signal: expect.any(AbortSignal) })
		);
		const messages = transport.mock.calls[1][0].messages;
		expect(messages).toContainEqual(first.messages[0]);
		expect(messages[2]).toEqual({
			role: 'tool',
			content: [
				{
					type: 'tool-result',
					toolCallId: 'call-1',
					toolName: 'set_spacing',
					output: { type: 'json', value: { ok: true, changed: true, context } },
				},
			],
		});
		expect(transport.mock.calls[0][0].context).toEqual(context);
		expect(controller.undo()).toEqual({ ok: true });
	});

	it('does not execute a late tool response after Stop', async () => {
		let resolve;
		const transport = vi.fn(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const { controller, session, events } = setup(transport);
		const run = controller.run('Move A');
		controller.stop();
		resolve(tool());
		await run;
		expect(session.execute).not.toHaveBeenCalled();
		expect(events.find((event) => event.type === 'error').message).toMatch(/^Stopped/);
		expect(controller.running).toBe(false);
	});

	it('caps tool execution even when the provider repeatedly asks for more work', async () => {
		const transport = vi.fn().mockResolvedValue(tool());
		const { controller, session, events } = setup(transport, { maxTools: 2 });
		await controller.run('Keep going');
		expect(session.execute).toHaveBeenCalledTimes(2);
		expect(events.some((event) => event.message?.includes('tool limit'))).toBe(true);
	});

	it('returns native stale/lock rejection to the model without reporting a successful edit', async () => {
		const transport = vi
			.fn()
			.mockResolvedValueOnce(tool())
			.mockResolvedValueOnce(reply('Please select the original glyph.'));
		const { controller, session, events } = setup(transport);
		session.execute.mockReturnValue({
			ok: false,
			error: { code: 'CONTEXT_CHANGED', message: 'The active glyph changed.' },
		});
		await controller.run('Move A');
		expect(events.find((event) => event.type === 'tool' && event.state === 'error').result.ok).toBe(
			false
		);
		expect(transport.mock.calls[1][0].messages[2].content[0].output.value.error.code).toBe(
			'CONTEXT_CHANGED'
		);
	});

	it('retains image and font references for followups but never sends raw font binaries', async () => {
		const captured = [];
		const transport = vi.fn(async (request) => {
			captured.push(JSON.stringify(request));
			return reply();
		});
		const { controller } = setup(transport);
		const image = {
			id: 'image',
			kind: 'image',
			name: 'reference.png',
			size: 12,
			mediaType: 'image/png',
			dataURL: 'data:image/png;base64,AAA=',
		};
		const font = {
			id: 'font',
			kind: 'font',
			name: 'font.ttf',
			size: 14,
			summary: { format: 'TTF', glyphCount: 3 },
			file: { secretBytes: 'RAW_FONT_MUST_STAY_LOCAL' },
		};
		await controller.run('Inspect references', [image, font]);
		await controller.run('Use the same proportions');
		expect(captured[1]).toContain('data:image/png;base64,AAA=');
		expect(captured[1]).toContain('glyphCount');
		expect(captured.join('')).not.toContain('RAW_FONT_MUST_STAY_LOCAL');
		expect(captured[1].match(/data:image\/png/g)).toHaveLength(1);
	});

	it('does not reuse conversation or references after switching projects', async () => {
		const transport = vi.fn().mockResolvedValue(reply());
		const { controller, session } = setup(transport);
		await controller.run('A private first-font request');
		session.getContext.mockReturnValue({ ...context, projectId: 'font-2' });
		await controller.run('A second font');
		expect(JSON.stringify(transport.mock.calls[1][0].messages)).not.toContain('private first-font');
	});

	it('rejects concurrent runs and clears in-memory conversation explicitly', async () => {
		let resolve;
		const { controller } = setup(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const run = controller.run('First');
		await expect(controller.run('Second')).rejects.toThrow('already running');
		expect(() => controller.clear()).toThrow('Stop');
		resolve(reply());
		await run;
		controller.clear();
		expect(controller.references).toEqual([]);
		expect(controller.undo().ok).toBe(false);
	});
});

// PR A: the built-in agent recovers from invalid tool calls (bug 8) and the cap (#73).
const invalid = (id = 'bad-1', toolName = 'render_glyphs', code = 'INVALID_ARGUMENTS') => ({
	text: '',
	messages: [
		{
			role: 'assistant',
			content: [{ type: 'tool-call', toolCallId: id, toolName, input: {} }],
		},
	],
	toolCalls: [],
	rejectedCalls: [
		{
			toolCallId: id,
			toolName,
			code,
			reason: 'input: missing glyphIds',
			hint: 'Fix the input and call the tool again.',
			inHistory: code !== 'UNKNOWN_TOOL',
		},
	],
});

describe('agent runner recovery', () => {
	it('feeds an invalid call back to the model as a tool error and keeps going', async () => {
		const transport = vi
			.fn()
			.mockResolvedValueOnce(invalid())
			.mockResolvedValueOnce(tool('call-2'))
			.mockResolvedValueOnce(reply('Fixed it.'));
		const { controller, session, events } = setup(transport);
		await controller.run('Render A');
		expect(events.some((event) => event.type === 'error')).toBe(false);
		expect(session.execute).toHaveBeenCalledTimes(1);
		// The same array grows during the run: find the feedback by its call.
		const second = transport.mock.calls[1][0].messages;
		const feedback = second.find(
			(message) => message.role === 'tool' && message.content[0].toolCallId === 'bad-1'
		);
		expect(feedback.content[0]).toMatchObject({ toolCallId: 'bad-1', toolName: 'render_glyphs' });
		expect(feedback.content[0].output.value.error).toMatchObject({
			code: 'INVALID_ARGUMENTS',
			message: 'render_glyphs: input: missing glyphIds',
		});
		expect(feedback.content[0].output.value.error.hint).toMatch(/Fix the input/);
		expect(events.find((event) => event.type === 'tool' && event.state === 'error').name).toBe(
			'render_glyphs'
		);
	});

	it('tells the model about a tool that does not exist in a note, not a dangling result', async () => {
		const transport = vi
			.fn()
			.mockResolvedValueOnce({ ...invalid('x', 'eval', 'UNKNOWN_TOOL'), messages: [] })
			.mockResolvedValueOnce(reply('OK.'));
		const { controller } = setup(transport);
		await controller.run('Do it');
		const sent = transport.mock.calls[1][0].messages;
		const note = sent.find(
			(message) => message.role === 'user' && String(message.content).startsWith('Tool error')
		);
		expect(note.content).toMatch(/Tool error: eval/);
		expect(sent.some((message) => message.role === 'tool')).toBe(false);
	});

	it('stops after two corrected retries of the same tool and names the tool and reason', async () => {
		const transport = vi.fn().mockImplementation(async () => invalid(`bad-${Math.random()}`));
		const { controller, events } = setup(transport);
		await controller.run('Render A');
		expect(transport).toHaveBeenCalledTimes(3);
		const error = events.find((event) => event.type === 'error');
		expect(error.code).toBe('INVALID_TOOL_CALL');
		expect(error.message).toMatch(/render_glyphs: input: missing glyphIds/);
	});

	it('runs what fits under the tool limit, answers the rest, and says the limit', async () => {
		const many = {
			...tool('call-1'),
			toolCalls: ['a', 'b', 'c'].map((id) => ({
				toolCallId: id,
				toolName: 'set_spacing',
				input: {},
			})),
		};
		const transport = vi.fn().mockResolvedValue(many);
		const { controller, session, events } = setup(transport, { maxTools: 2 });
		await controller.run('All glyphs');
		expect(session.execute).toHaveBeenCalledTimes(2);
		expect(events.find((event) => event.type === 'error').message).toMatch(
			/tool limit \(2 tool calls\)/
		);
	});

	it('allows 40 tool calls per chat request by default', async () => {
		const transport = vi.fn();
		for (let i = 0; i < 12; i++) transport.mockResolvedValueOnce(tool(`call-${i}`));
		transport.mockResolvedValueOnce(reply('Done with 12 glyphs.'));
		const { controller, session, events } = setup(transport);
		await controller.run('Do it for every glyph');
		expect(session.execute).toHaveBeenCalledTimes(12);
		expect(events.some((event) => event.type === 'error')).toBe(false);
	});
});
