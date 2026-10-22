import { attachmentParts, validateAttachmentSet } from './attachments.js';
import { resolveProviderProtocol } from './provider-config.js';

/**
 * An Error carrying a short machine code ('RELAY_OFFLINE', or the relay's
 * public error code such as 'PROVIDER_AUTH') so the panel can pick its copy.
 * @param {String} message
 * @param {String} code
 * @returns {Error & {code: String}}
 */
export function agentError(message, code) {
	return Object.assign(new Error(message), { code });
}

export function requireSelectedGlyph(context) {
	if (!context?.glyphId || !context.writable) {
		throw agentError(
			'Select a glyph in Characters before sending. This agent edits the current glyph only. Your message and attachments are still here.',
			'NO_GLYPH'
		);
	}
	return context;
}

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Tool result for the model. A render result carries its PNG as an image
 * part (so a vision model can look at it), not as base64 text in the JSON.
 * @param {Object} value - native tool result
 */
export function toolOutput(value) {
	const match =
		value?.ok && typeof value.image === 'string' ? PNG_DATA_URL.exec(value.image) : null;
	if (!match) return { type: 'json', value };
	const rest = { ...value };
	delete rest.image;
	return {
		type: 'content',
		value: [
			{ type: 'text', text: JSON.stringify(rest) },
			{ type: 'file', mediaType: 'image/png', data: { type: 'data', data: match[1] } },
		],
	};
}

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
		throw agentError(
			'Cannot reach the agent relay. Run Noddy with its agent server and try again.',
			'RELAY_OFFLINE'
		);
	}
	let result;
	try {
		result = await response.json();
	} catch {
		throw agentError(
			'The agent relay is unavailable. Run Noddy with its agent server.',
			'RELAY_OFFLINE'
		);
	}
	if (!response.ok)
		throw agentError(
			result.error?.message || 'The provider could not complete this request.',
			result.error?.code || 'PROVIDER_UNAVAILABLE'
		);
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
				!['auto', 'responses', 'chat', 'messages'].includes(value.protocol || 'auto') ||
				!value.model?.trim() ||
				!value.apiKey?.trim()
			) {
				throw new Error('Choose a provider and enter a model ID and API key.');
			}
			const protocol = value.protocol || 'auto';
			const effectiveProtocol = resolveProviderProtocol(
				value.provider,
				value.model.trim(),
				protocol
			);
			connection = {
				provider: value.provider,
				protocol,
				model: value.model.trim(),
				apiKey: value.apiKey.trim(),
			};
			emit('connection', {
				connected: true,
				provider: connection.provider,
				model: connection.model,
				effectiveProtocol,
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
		/**
		 * One request. A job resolves to a summary once it ends:
		 * { completed, changed, submitted: [glyph IDs], usage: [per step], error };
		 * a chat request resolves to undefined.
		 * @param {String} prompt
		 * @param {Array} [attachments]
		 * @param {Object} [options]
		 * @param {Boolean} [options.job] - a run job (M7): no chat memory, no
		 *   'start'/'text'/'finish' events on the panel's listener (they go to
		 *   options.onEvent), and the session is scoped to options.scope
		 * @param {Array<String>} [options.scope] - glyph IDs the job may write
		 * @param {Boolean} [options.requireGlyph] - false: no selected glyph needed
		 *   (job tools write by glyph ID)
		 * @param {Number} [options.maxTools]
		 * @param {AbortSignal} [options.signal] - aborts like Stop
		 * @param {(event: Object) => void} [options.onEvent] - job events
		 */
		async run(prompt, attachments = [], options = {}) {
			const job = options.job === true;
			const requireGlyph = options.requireGlyph !== false && !job;
			const toolLimit = Number.isInteger(options.maxTools) ? options.maxTools : maxTools;
			const send = job ? (type, data = {}) => options.onEvent?.({ type, ...data }) : emit;
			if (active) throw new Error('An agent request is already running.');
			if (!connection)
				throw new Error('Connect a model before sending. Your prompt and files are still here.');
			if (!prompt.trim() && !attachments.length) return;
			if (prompt.length > 12000) throw new Error('Keep the message under 12,000 characters.');
			const session = job ? createSession({ jobScope: options.scope || [] }) : createSession();
			let context;
			try {
				context = session.getContext();
				if (requireGlyph) requireSelectedGlyph(context);
			} catch (error) {
				session.dispose();
				throw error;
			}
			if (!job && context.projectId !== projectId) {
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
			if (!job) references = nextReferences;
			const abort = new AbortController();
			active = abort;
			const onOuterAbort = () => abort.abort('stopped');
			if (options.signal?.aborted) abort.abort('stopped');
			else options.signal?.addEventListener('abort', onOuterAbort, { once: true });
			const config = { ...connection };
			const timer = setTimeout(() => abort.abort('timeout'), timeoutMs);
			const userText = prompt.trim() || 'Please inspect the attached reference files.';
			const messages = [
				...(job ? [] : conversation.flat()),
				{
					role: 'user',
					content: [
						{ type: 'text', text: userText },
						...attachmentParts(job ? attachments : references),
					],
				},
			];
			send('start', { prompt: userText, attachments, context });
			let calls = 0;
			let finalText = '';
			let completed = false;
			let changed = false;
			let failure = null;
			const submitted = [];
			const usage = [];
			try {
				for (let step = 0; step <= toolLimit; step++) {
					abort.signal.throwIfAborted();
					const result = await transport({ ...config, messages, context }, abort.signal);
					abort.signal.throwIfAborted();
					usage.push(result.usage || null);
					messages.push(...result.messages);
					if (result.text) {
						finalText += `${result.text}\n`;
						send('text', { text: result.text });
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
					if (calls + result.toolCalls.length > toolLimit)
						throw new Error(
							'This request reached its tool limit. Completed edits are kept; send a follow-up to continue.'
						);
					const outputs = [];
					for (const call of result.toolCalls) {
						abort.signal.throwIfAborted();
						calls++;
						send('tool', { name: call.toolName, state: 'running' });
						const value = await session.execute(call.toolName, call.input, {
							callId: call.toolCallId,
							signal: abort.signal,
						});
						if (value.ok && value.changed) changed = true;
						if (
							call.toolName === 'submit_glyph' &&
							value.ok &&
							value.changed &&
							value.glyph?.glyphId
						)
							submitted.push(value.glyph.glyphId);
						if (!value.ok && value.error?.code) failure = value.error;
						send('tool', {
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
							output: toolOutput(value),
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
					send('text', { text: finalText });
				}
			} catch (error) {
				const message = abort.signal.aborted
					? abort.signal.reason === 'timeout'
						? 'The request timed out. Completed edits are kept and can be undone.'
						: 'Stopped. Completed edits are kept and can be undone.'
					: error.message || 'The agent request failed.';
				const code = abort.signal.aborted
					? abort.signal.reason === 'timeout'
						? 'TIMEOUT'
						: 'STOPPED'
					: error.code;
				finalText += message;
				failure = { message, code };
				send('error', { message, code });
			} finally {
				clearTimeout(timer);
				options.signal?.removeEventListener('abort', onOuterAbort);
				config.apiKey = '';
				active = undefined;
				let finalContext;
				try {
					finalContext = session.getContext();
				} catch {
					/* Project may have closed while the model was running. */
				}
				if (changed && !job) {
					undoSession?.dispose();
					undoSession = session;
				} else session.dispose();
				if (!job) {
					// Keep a small text-only conversation. References are attached once per request.
					conversation.push([
						{ role: 'user', content: userText },
						{ role: 'assistant', content: finalText.slice(0, 6000) },
					]);
					conversation = conversation.slice(-3);
				}
				send('finish', { context: finalContext });
			}
			// Chat requests keep their old contract (resolve to undefined).
			if (!job) return undefined;
			return {
				completed,
				changed,
				submitted,
				usage,
				error: completed ? null : failure,
				lastError: failure,
			};
		},
	};
}
