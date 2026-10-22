import {
	MODEL_ID_PATTERN,
	PROVIDERS,
	resolveProviderProtocol,
} from '../../src/agent/provider-config.js';

export { MODEL_ID_PATTERN };

export const LIMITS = Object.freeze({
	bodyBytes: 8 * 1024 * 1024,
	imageBytes: 4 * 1024 * 1024,
	images: 4,
	// Rendered glyph PNGs returned by native read tools (render_glyphs / render_text).
	toolImages: 8,
	messages: 96,
	textCharacters: 160000,
	outputTokens: 4096,
	toolCallsPerStep: 8,
	requestTimeoutMs: 90000,
	concurrentRequests: 2,
	// Model-list route (M4, #76): free, so a short timeout and a body that only fits
	// a provider name and one key.
	modelsTimeoutMs: 15000,
	modelsBodyBytes: 2048,
});

export class RelayError extends Error {
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

function invalid(message = 'Invalid agent request.') {
	throw new RelayError('INVALID_REQUEST', message);
}

/** @returns {value is Record<string, any>} */
export function record(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value, allowed) {
	if (!record(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}

function shortString(value, max = 160, empty = false) {
	if (typeof value !== 'string' || value.length > max || (!empty && !value.length)) invalid();
	return value;
}

// Also protects parsing/stringifying nested tool arguments and tool results.
export function boundedJSON(value, maxBytes = 160000) {
	let nodes = 0;
	function visit(item, depth) {
		if (++nodes > 20000 || depth > 16) invalid('Agent data is too complex.');
		if (item === null || typeof item === 'boolean') return;
		if (typeof item === 'number' && Number.isFinite(item)) return;
		if (typeof item === 'string' && item.length <= maxBytes) return;
		if (Array.isArray(item)) return item.forEach((child) => visit(child, depth + 1));
		if (record(item)) {
			for (const [key, child] of Object.entries(item)) {
				if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid();
				visit(child, depth + 1);
			}
			return;
		}
		invalid();
	}
	visit(value, 0);
	if (Buffer.byteLength(JSON.stringify(value)) > maxBytes) invalid('Agent data is too large.');
	return value;
}

function providerOptions(value, fromProvider) {
	if (value === undefined) return undefined;
	const allowed = ['itemId', 'reasoningEncryptedContent', 'signature', 'redactedData', 'phase'];
	if (fromProvider && record(value)) {
		value = Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => ['openai', 'anthropic', 'opencode-zen'].includes(key))
				.map(([key, details]) => [
					key,
					Object.fromEntries(Object.entries(details).filter(([name]) => allowed.includes(name))),
				])
		);
	}
	keys(value, ['openai', 'anthropic', 'opencode-zen']);
	// Only opaque continuation data, not arbitrary provider settings or URLs.
	for (const details of Object.values(value)) {
		keys(details, allowed);
		if (details.phase !== undefined && !['commentary', 'final_answer'].includes(details.phase))
			invalid();
		for (const entry of Object.values(details)) {
			if (entry !== null) shortString(entry, 100000, true);
		}
	}
	return value;
}

function image(part) {
	keys(part, ['type', 'image', 'mediaType']);
	if (typeof part.image !== 'string') invalid('Images must be attached directly.');
	const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(part.image);
	if (!match || (part.mediaType && part.mediaType !== match[1])) {
		invalid('Attach a PNG, JPEG or WebP image. Remote image URLs are not accepted.');
	}
	const bytes = Buffer.from(match[2], 'base64');
	if (bytes.length > LIMITS.imageBytes) invalid('Each image must be 4 MB or smaller.');
	const valid =
		(match[1] === 'image/png' && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') ||
		(match[1] === 'image/jpeg' && bytes.subarray(0, 3).toString('hex') === 'ffd8ff') ||
		(match[1] === 'image/webp' &&
			bytes.subarray(0, 4).toString() === 'RIFF' &&
			bytes.subarray(8, 12).toString() === 'WEBP');
	if (!valid || bytes.toString('base64') !== match[2]) invalid('Invalid image attachment.');
	return { type: 'image', image: part.image, mediaType: match[1] };
}

const PNG_SIGNATURE = '89504e470d0a1a0a';

// A native render result: JSON text plus PNG image parts. PNG only, inline
// bytes only, signature checked, same per-image size cap as attachments.
function toolResultContent(value, count) {
	if (!Array.isArray(value) || !value.length || value.length > 5) invalid();
	let text = 0;
	const parts = value.map((part) => {
		if (!record(part)) invalid();
		if (part.type === 'text') {
			keys(part, ['type', 'text']);
			text += shortString(part.text, 160000, true).length;
			return { type: 'text', text: part.text };
		}
		if (part.type === 'file') {
			keys(part, ['type', 'mediaType', 'data']);
			keys(part.data, ['type', 'data']);
			if (part.mediaType !== 'image/png' || part.data.type !== 'data') invalid();
			if (typeof part.data.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(part.data.data))
				invalid('Invalid rendered image.');
			const bytes = Buffer.from(part.data.data, 'base64');
			if (bytes.length > LIMITS.imageBytes) invalid('Rendered image is too large.');
			if (bytes.subarray(0, 8).toString('hex') !== PNG_SIGNATURE)
				invalid('Invalid rendered image.');
			if (count() > LIMITS.toolImages)
				invalid('Too many rendered images in this conversation. Start a new one.');
			return {
				type: 'file',
				mediaType: 'image/png',
				data: { type: 'data', data: part.data.data },
			};
		}
		invalid('Unsupported tool result content.');
	});
	return { parts, text };
}

export function validateMessages(
	messages,
	toolNames,
	{ completed = true, fromProvider = false } = {}
) {
	if (!Array.isArray(messages) || !messages.length || messages.length > LIMITS.messages) {
		invalid('Conversation is too long. Start a new agent conversation.');
	}
	let textSize = 0;
	let imageCount = 0;
	let toolImageCount = 0;
	const calls = new Map();
	const unresolved = new Set();
	const result = messages.map((message) => {
		keys(message, ['role', 'content', 'providerOptions']);
		if (!['user', 'assistant', 'tool'].includes(message.role)) invalid();
		// System/developer instructions are owned exclusively by this relay.
		if (message.providerOptions !== undefined) invalid();
		if (message.role !== 'tool' && typeof message.content === 'string') {
			textSize += message.content.length;
			return { role: message.role, content: message.content };
		}
		if (!Array.isArray(message.content) || !message.content.length || message.content.length > 32)
			invalid();
		const content = message.content.map((part) => {
			if (!record(part)) invalid();
			if (part.type === 'text' || (message.role === 'assistant' && part.type === 'reasoning')) {
				if (message.role === 'tool') invalid();
				keys(part, ['type', 'text', 'providerOptions']);
				textSize += shortString(part.text, LIMITS.textCharacters, true).length;
				if (message.role === 'user' && part.providerOptions !== undefined) invalid();
				const metadata = providerOptions(part.providerOptions, fromProvider);
				if (metadata) textSize += JSON.stringify(metadata).length;
				return { ...part, ...(metadata ? { providerOptions: metadata } : {}) };
			}
			if (message.role === 'user' && part.type === 'image') {
				if (++imageCount > LIMITS.images) invalid('Attach at most four images per conversation.');
				return image(part);
			}
			if (message.role === 'assistant' && part.type === 'tool-call') {
				keys(part, [
					'type',
					'toolCallId',
					'toolName',
					'input',
					'providerOptions',
					'providerExecuted',
				]);
				if (part.providerExecuted) invalid();
				shortString(part.toolCallId);
				if (!toolNames.has(part.toolName) || calls.has(part.toolCallId))
					invalid('Unknown or duplicate tool call.');
				calls.set(part.toolCallId, part.toolName);
				unresolved.add(part.toolCallId);
				boundedJSON(part.input);
				textSize += JSON.stringify(part.input).length;
				const metadata = providerOptions(part.providerOptions, fromProvider);
				if (metadata) textSize += JSON.stringify(metadata).length;
				return { ...part, ...(metadata ? { providerOptions: metadata } : {}) };
			}
			if (message.role === 'tool' && part.type === 'tool-result') {
				keys(part, ['type', 'toolCallId', 'toolName', 'output']);
				if (calls.get(part.toolCallId) !== part.toolName || !unresolved.delete(part.toolCallId)) {
					invalid('Tool result does not match a pending call.');
				}
				keys(part.output, ['type', 'value']);
				if (part.output.type === 'content') {
					const content = toolResultContent(part.output.value, () => ++toolImageCount);
					textSize += content.text;
					return { ...part, output: { type: 'content', value: content.parts } };
				}
				if (!['json', 'text', 'error-json', 'error-text'].includes(part.output.type)) invalid();
				if (part.output.type.endsWith('text')) shortString(part.output.value, 160000, true);
				boundedJSON(part.output.value);
				textSize += JSON.stringify(part.output.value).length;
				return part;
			}
			invalid('Unsupported message content.');
		});
		return { role: message.role, content };
	});
	if (textSize > LIMITS.textCharacters)
		invalid('Conversation text is too large. Start a new conversation.');
	if (completed && unresolved.size) invalid('Complete pending tool calls before continuing.');
	return result;
}

export function validateRequest(body, definitions) {
	keys(body, ['provider', 'protocol', 'model', 'apiKey', 'messages', 'context']);
	if (!MODEL_ID_PATTERN.test(shortString(body.model))) invalid('Enter a valid model ID.');
	let protocol;
	try {
		protocol = resolveProviderProtocol(body.provider, body.model, body.protocol);
	} catch (error) {
		throw new RelayError(error.code, error.message);
	}
	if (!/^[\x21-\x7e]{1,512}$/.test(shortString(body.apiKey, 512)))
		invalid('Enter a valid provider API key.');
	if (body.context !== undefined) {
		keys(body.context, [
			'projectId',
			'projectName',
			'glyphId',
			'revision',
			'selection',
			'writable',
			'unitsPerEm',
			'spec',
			'set',
			'lock',
		]);
		if (
			body.context.unitsPerEm !== undefined &&
			(!Number.isFinite(body.context.unitsPerEm) ||
				body.context.unitsPerEm <= 0 ||
				body.context.unitsPerEm > 16384)
		)
			invalid();
		boundedJSON(body.context, 8000);
	}
	return {
		provider: body.provider,
		protocol,
		model: body.model,
		apiKey: body.apiKey,
		messages: validateMessages(body.messages, new Set(definitions.map((tool) => tool.name))),
		context: body.context ?? {},
	};
}

/**
 * Body of POST /api/agent/models: a provider and its key, nothing else. There is
 * no URL, header or option field, so the destination is always the fixed one.
 * @param {any} body
 * @returns {{provider:string, apiKey:string}}
 */
export function validateModelsRequest(body) {
	keys(body, ['provider', 'apiKey']);
	if (typeof body.provider !== 'string' || !Object.hasOwn(PROVIDERS, body.provider))
		invalid('Choose OpenAI, OpenCode Zen or Anthropic.');
	if (!/^[\x21-\x7e]{1,512}$/.test(shortString(body.apiKey, 512)))
		invalid('Enter a valid provider API key.');
	return { provider: body.provider, apiKey: body.apiKey };
}
