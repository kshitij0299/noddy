import { attachmentParts, validateAttachmentSet } from './attachments.js';

export async function requestAgentStep(payload, signal) {
	const body = JSON.stringify(payload);
	if (new Blob([body]).size > 8 * 1024 * 1024)
		throw new Error(
			'This conversation is too large to send. Clear the chat and use smaller reference files.'
		);
	let response;
	try {
		response = await fetch('/api/agent/step', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			signal,
		});
	} catch (error) {
		if (signal.aborted) throw error;
		throw new Error('Cannot reach the agent relay. Run Noddy with its agent server and try again.');
	}
	let result;
	try {
		result = await response.json();
	} catch {
		throw new Error('The agent relay is unavailable. Run Noddy with its agent server.');
	}
	if (!response.ok)
		throw new Error(result.error?.message || 'The provider could not complete this request.');
	if (!Array.isArray(result.messages) || !Array.isArray(result.toolCalls))
		throw new Error('The agent relay returned an invalid response.');
	return result;
}

/** Provider credentials, conversation, and images exist in memory only. */
export function createAgentController({
	createSession,
	transport = requestAgentStep,
	onEvent = () => {},
	maxTools = 8,
	timeoutMs = 120_000,
}) {
	let connection;
	let active;
	let undoSession;
	let projectId;
	let conversation = [];
	let references = [];
	const emit = (type, data = {}) => onEvent({ type, ...data });
	const stop = () => active?.abort();
	const clear = () => {
		if (active) throw new Error('Stop the request before clearing this chat.');
		conversation = [];
		references = [];
		projectId = undefined;
		undoSession?.dispose();
		undoSession = undefined;
		emit('clear');
	};

	return {
		get connected() {
			return !!connection;
		},
		get running() {
			return !!active;
		},
		get references() {
			return references;
		},
		connect(value) {
			if (active) throw new Error('Stop the request before changing models.');
			if (
				!['openai', 'opencode-zen'].includes(value.provider) ||
				!['responses', 'chat', 'messages'].includes(value.protocol) ||
				!value.model?.trim() ||
				!value.apiKey?.trim()
			) {
				throw new Error('Choose a provider and enter a model ID and API key.');
			}
			if (value.provider === 'openai' && value.protocol === 'messages')
				throw new Error('OpenAI supports the Responses or Chat Completions protocol.');
			connection = {
				provider: value.provider,
				protocol: value.protocol,
				model: value.model.trim(),
				apiKey: value.apiKey.trim(),
			};
			emit('connection', {
				connected: true,
				provider: connection.provider,
				model: connection.model,
			});
		},
		disconnect() {
			stop();
			connection = undefined;
			emit('connection', { connected: false });
		},
		stop,
		clear,
		undo() {
			if (active) return { ok: false, error: { message: 'Stop the request before undoing.' } };
			return (
				undoSession?.undoLast() || {
					ok: false,
					error: {
						message:
							'No agent edit is available to undo. Use the editor history for earlier changes.',
					},
				}
			);
		},
		async run(prompt, attachments = []) {
			if (active) throw new Error('An agent request is already running.');
			if (!connection)
				throw new Error('Connect a model before sending. Your prompt and files are still here.');
			if (!prompt.trim() && !attachments.length) return;
			if (prompt.length > 12000) throw new Error('Keep the message under 12,000 characters.');
			const session = createSession();
			let context;
			try {
				context = session.getContext();
			} catch (error) {
				session.dispose();
				throw error;
			}
			if (context.projectId !== projectId) {
				conversation = [];
				references = [];
				projectId = context.projectId;
				emit('clear');
			}
			const nextReferences = [...references, ...attachments];
			try {
				validateAttachmentSet(nextReferences);
			} catch (error) {
				session.dispose();
				throw error;
			}
			references = nextReferences;
			const abort = new AbortController();
			active = abort;
			const config = { ...connection };
			const timer = setTimeout(() => abort.abort('timeout'), timeoutMs);
			const userText = prompt.trim() || 'Please inspect the attached reference files.';
			const messages = [
				...conversation.flat(),
				{
					role: 'user',
					content: [{ type: 'text', text: userText }, ...attachmentParts(references)],
				},
			];
			emit('start', { prompt: userText, attachments, context });
			let calls = 0;
			let finalText = '';
			let completed = false;
			let changed = false;
			try {
				for (let step = 0; step <= maxTools; step++) {
					abort.signal.throwIfAborted();
					const result = await transport({ ...config, messages, context }, abort.signal);
					abort.signal.throwIfAborted();
					messages.push(...result.messages);
					if (result.text) {
						finalText += `${result.text}\n`;
						emit('text', { text: result.text });
					}
					if (result.finishReason === 'length')
						throw new Error(
							'The model reached its response limit. Completed edits are kept; send a follow-up to continue.'
						);
					if (result.finishReason === 'content-filter')
						throw new Error('The provider filtered this response. No further edits were made.');
					if (!result.toolCalls.length) {
						completed = true;
						break;
					}
					if (calls + result.toolCalls.length > maxTools)
						throw new Error(
							'This request reached its tool limit. Completed edits are kept; send a follow-up to continue.'
						);
					const outputs = [];
					for (const call of result.toolCalls) {
						abort.signal.throwIfAborted();
						calls++;
						emit('tool', { name: call.toolName, state: 'running' });
						const value = await session.execute(call.toolName, call.input, {
							callId: call.toolCallId,
							signal: abort.signal,
						});
						if (value.ok && value.changed) changed = true;
						emit('tool', {
							name: call.toolName,
							state: value.ok ? 'done' : 'error',
							result: value,
						});
						if (['PROJECT_CHANGED', 'SESSION_CLOSED'].includes(value.error?.code))
							throw new Error(value.error.message);
						outputs.push({
							type: 'tool-result',
							toolCallId: call.toolCallId,
							toolName: call.toolName,
							output: { type: 'json', value },
						});
					}
					messages.push({ role: 'tool', content: outputs });
				}
				if (!completed)
					throw new Error('This request reached its step limit. Send a follow-up to continue.');
				if (!finalText) {
					finalText = changed
						? 'The tool edits were applied. The model returned no explanation.'
						: 'The model returned no message. No font edits were made.';
					emit('text', { text: finalText });
				}
			} catch (error) {
				const message = abort.signal.aborted
					? abort.signal.reason === 'timeout'
						? 'The request timed out. Completed edits are kept and can be undone.'
						: 'Stopped. Completed edits are kept and can be undone.'
					: error.message || 'The agent request failed.';
				finalText += message;
				emit('error', { message });
			} finally {
				clearTimeout(timer);
				config.apiKey = '';
				active = undefined;
				let finalContext;
				try {
					finalContext = session.getContext();
				} catch {
					/* Project may have closed while the model was running. */
				}
				if (changed) {
					undoSession?.dispose();
					undoSession = session;
				} else session.dispose();
				// Keep a small text-only conversation. References are attached once per request.
				conversation.push([
					{ role: 'user', content: userText },
					{ role: 'assistant', content: finalText.slice(0, 6000) },
				]);
				conversation = conversation.slice(-3);
				emit('finish', { context: finalContext });
			}
		},
	};
}
