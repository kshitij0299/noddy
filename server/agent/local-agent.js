/**
 * Local agent bridge: lets a coding agent on this machine (Claude Code, Codex, Cursor,
 * OpenCode) drive Noddy's native agent tools over MCP. Dev server only: vite-plugin.js
 * loads this module from `configureServer`, never from the preview server, serve.js or the
 * build.
 *
 *   coding agent ──POST/GET/DELETE /mcp──▶ this module ──SSE `call`──▶ the Noddy tab
 *                ◀──── tool result ──────             ◀─POST result──  (native-tools.js)
 *
 * - `/mcp` is MCP Streamable HTTP (official SDK, stateful sessions). Tools are the native
 *   TOOL_DEFINITIONS; input is validated here (validateToolInput) before it is forwarded.
 * - `/api/agent/bridge`: POST {type:'enable'} (same-origin page only) turns the switch on and
 *   returns the pairing token; GET with the token is the tab's event stream (`ready`,
 *   `call`, `cancel`, `client`, `replaced`); POST {type:'result'} answers a call and
 *   POST {type:'stop'} turns the switch off.
 * - Both reuse assertLocalRequest (loopback, Host, Origin) and need the token, which is random
 *   per server start, kept in memory and never logged.
 * - One tab at a time: a new stream replaces the old one. Turning the switch off, Stop or
 *   closing the tab rejects pending calls; later calls get NO_TAB. A call the tab does not
 *   answer within `timeoutMs` (60 s) becomes a TIMEOUT tool error.
 * - The panel can talk to the coding agent (bug 30): POST {type:'message'} queues what the user
 *   typed; the MCP tool `wait_for_user_message` long-polls for it (at most 60 s, then
 *   `timedOut`), `reply_to_user` shows the agent's answer in the thread. The tab hears
 *   `listening`, `delivered` and `reply`. Stop or a closed tab drops the queue and fails a
 *   waiting call with LOCAL_AGENT_OFF.
 * Every failure a coding agent can recover from is a tool result with isError, never a
 * protocol error.
 */
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { loadNativeRegistry } from './agent.js';
import { errorEnvelope, publicError } from './errors.js';
import { assertLocalRequest, readBody, sendJSON } from './relay.js';
import { RelayError } from './validation.js';

export const LOCAL_AGENT_TIMEOUT_MS = 60_000;
const MAX_MCP_SESSIONS = 8;
const MCP_BODY_BYTES = 1024 * 1024;
// A result may carry a rendered PNG (render_glyphs / render_text).
const RESULT_BODY_BYTES = 8 * 1024 * 1024;
const KEEPALIVE_MS = 20_000;
const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

// The panel's chat with the coding agent (bug 30).
export const WAIT_MAX_SECONDS = 60;
// Under the 60 s request timeout most MCP clients use by default.
export const WAIT_DEFAULT_SECONDS = 45;
const MAX_QUEUED = 20;
const MESSAGE_CHARS = 12_000;
const REPLY_CHARS = 8_000;

const LOOP =
	'Loop: call wait_for_user_message, act on the message with the Noddy tools, answer with reply_to_user, then call wait_for_user_message again.';

/** MCP-only tools: the user's messages from the Noddy panel and the agent's replies. */
export const CHAT_TOOLS = [
	{
		name: 'wait_for_user_message',
		description: `Wait for the next message the user types in the Noddy agent panel (long poll, up to timeoutSeconds: default ${WAIT_DEFAULT_SECONDS}, at most ${WAIT_MAX_SECONDS}). Returns {message: {id, text, attachments: [{name, kind, size}], target: {scope, glyphIds}, mode, chaos}} or {message: null, timedOut: true}; on a timeout just call it again. Messages sent while you were busy wait in a queue and come one per call. ${LOOP} Mode: exact = follow the user's reference faithfully; remix = keep the vibe, vary each glyph through its anatomy, look and redraw; wild = big swings, still readable unless told otherwise. Chaos 0-100 scales the variation. Target says which glyphs the user means.`,
		inputSchema: {
			type: 'object',
			properties: {
				timeoutSeconds: {
					type: 'integer',
					minimum: 1,
					maximum: WAIT_MAX_SECONDS,
					description: `Seconds to wait before returning timedOut (default ${WAIT_DEFAULT_SECONDS}).`,
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: 'reply_to_user',
		description: `Show a message to the user in the Noddy agent panel thread, as the agent's reply. Keep it short and concrete: what you changed, or what you need. ${LOOP}`,
		inputSchema: {
			type: 'object',
			properties: {
				text: { type: 'string', minLength: 1, maxLength: REPLY_CHARS },
			},
			required: ['text'],
			additionalProperties: false,
		},
	},
];
const CHAT_TOOL_NAMES = new Set(CHAT_TOOLS.map((tool) => tool.name));

/**
 * A panel message as the tab posts it; anything else is refused.
 * @param {any} value
 */
export function validatePanelMessage(value) {
	const bad = (why) => {
		throw new RelayError('INVALID_MESSAGE', why, 400);
	};
	if (!value || typeof value !== 'object' || Array.isArray(value)) bad('Send a message object.');
	const allowed = ['text', 'attachments', 'target', 'mode', 'chaos'];
	if (Object.keys(value).some((key) => !allowed.includes(key))) bad('Unknown message field.');
	const text = typeof value.text === 'string' ? value.text : '';
	if (text.length > MESSAGE_CHARS) bad('The message is too long.');
	const attachments = Array.isArray(value.attachments) ? value.attachments : [];
	if (attachments.length > 8) bad('Too many attachments.');
	const files = attachments.map((file) => ({
		name: String(file?.name ?? '').slice(0, 200),
		kind: ['image', 'font'].includes(file?.kind) ? file.kind : 'file',
		size: Number.isFinite(file?.size) ? Math.max(0, Math.round(file.size)) : null,
	}));
	if (!text.trim() && !files.length) bad('The message is empty.');
	const mode = ['exact', 'remix', 'wild'].includes(value.mode) ? value.mode : 'exact';
	const chaos = Number.isInteger(value.chaos) ? Math.min(100, Math.max(0, value.chaos)) : 50;
	const scope = ['glyph', 'selected', 'set'].includes(value.target?.scope)
		? value.target.scope
		: 'set';
	const glyphIds = Array.isArray(value.target?.glyphIds)
		? value.target.glyphIds.filter((id) => typeof id === 'string' && id.length <= 64).slice(0, 256)
		: [];
	return { text, attachments: files, target: { scope, glyphIds }, mode, chaos };
}

const MESSAGES = {
	NO_TAB:
		'No Noddy tab is connected. Ask the user to open Noddy, open the agent panel and turn on Local agent.',
	LOCAL_AGENT_OFF:
		'The user turned off Local agent in Noddy (Stop, the switch, or closing the tab). This call was not applied. Ask the user before trying again.',
	TAB_REPLACED:
		'Another Noddy tab took over Local agent. This call was not applied; call get_context again.',
	TIMEOUT:
		'Noddy did not answer within 60 seconds. The tab may be busy or in the background; call get_context before retrying.',
};

/** @param {string} code @param {string} message */
export function toolError(code, message) {
	return {
		isError: true,
		content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code, message } }) }],
	};
}

/**
 * Native tool result → MCP CallTool result. A render's PNG becomes image content; a native
 * error (validation, locks, stale revision, NO_PROJECT …) keeps its code and message.
 * @param {any} result
 */
export function toMcpResult(result) {
	if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
		return toolError('INVALID_RESULT', 'Noddy returned an invalid tool result.');
	}
	if (!result.ok) {
		return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }] };
	}
	const match = typeof result.image === 'string' ? PNG_DATA_URL.exec(result.image) : null;
	if (!match) return { content: [{ type: 'text', text: JSON.stringify(result) }] };
	const rest = { ...result };
	delete rest.image;
	return {
		content: [
			{ type: 'text', text: JSON.stringify(rest) },
			{ type: 'image', data: match[1], mimeType: 'image/png' },
		],
	};
}

function sendHttpError(res, error) {
	const safe = publicError(error);
	sendJSON(res, safe.status, { error: errorEnvelope(safe) });
}

/**
 * @param {{timeoutMs?: number, loadRegistry?: typeof loadNativeRegistry, token?: string}} [options]
 */
export function createLocalAgentBridge(options = {}) {
	const timeoutMs = options.timeoutMs ?? LOCAL_AGENT_TIMEOUT_MS;
	const loadRegistry = options.loadRegistry ?? loadNativeRegistry;
	const token = options.token ?? randomBytes(32).toString('base64url');
	const tokenBytes = Buffer.from(`Bearer ${token}`);

	/** @type {{res: import('node:http').ServerResponse, keepalive: NodeJS.Timeout} | null} */
	let tab = null;
	/** @type {Map<string, {tab: object, finish: (result: object) => void}>} */
	const pending = new Map();
	/** @type {Map<string, {transport: StreamableHTTPServerTransport, client: string, server: Server}>} */
	const sessions = new Map();
	/** Panel messages no wait_for_user_message has taken yet (bug 30). */
	/** @type {Array<{id: string, text: string, attachments: object[], target: object, mode: string, chaos: number}>} */
	let queue = [];
	/** @type {Set<{deliver: (message: object) => void, fail: (code: string) => void}>} */
	const waiters = new Set();

	/** Hands the oldest queued message to the oldest waiting agent, and tells the tab. */
	function pump() {
		while (queue.length && waiters.size) {
			const [waiter] = waiters;
			waiters.delete(waiter);
			const message = queue.shift();
			waiter.deliver(message);
			sendEvent(tab, 'delivered', { id: message.id });
		}
	}

	function listening() {
		sendEvent(tab, 'listening', { on: waiters.size > 0, queued: queue.length });
	}

	/** Long poll for the next panel message (wait_for_user_message). */
	function waitForMessage(input, signal) {
		if (!tab) return toolError('NO_TAB', MESSAGES.NO_TAB);
		const seconds = Number.isInteger(input?.timeoutSeconds)
			? input.timeoutSeconds
			: WAIT_DEFAULT_SECONDS;
		return new Promise((resolve) => {
			let timer;
			const done = (result) => {
				clearTimeout(timer);
				signal?.removeEventListener('abort', onAbort);
				waiters.delete(waiter);
				listening();
				resolve(result);
			};
			const waiter = {
				deliver: (message) =>
					done({ content: [{ type: 'text', text: JSON.stringify({ ok: true, message }) }] }),
				fail: (code) => done(toolError(code, MESSAGES[code])),
			};
			const onAbort = () => done(toolError('CANCELLED', 'The coding agent cancelled this call.'));
			timer = setTimeout(
				() =>
					done({
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									ok: true,
									message: null,
									timedOut: true,
									hint: 'No message yet. Call wait_for_user_message again to keep listening.',
								}),
							},
						],
					}),
				seconds * 1000
			);
			signal?.addEventListener('abort', onAbort, { once: true });
			waiters.add(waiter);
			pump();
			if (waiters.has(waiter)) listening();
		});
	}

	function replyToUser(input) {
		if (!tab) return toolError('NO_TAB', MESSAGES.NO_TAB);
		const text = typeof input?.text === 'string' ? input.text.slice(0, REPLY_CHARS) : '';
		if (!text.trim()) return toolError('INVALID_ARGUMENTS', 'reply_to_user needs text.');
		sendEvent(tab, 'reply', { text });
		return { content: [{ type: 'text', text: JSON.stringify({ ok: true, shown: true }) }] };
	}

	function assertToken(req) {
		const header = Buffer.from(String(req.headers.authorization ?? ''));
		if (header.length !== tokenBytes.length || !timingSafeEqual(header, tokenBytes)) {
			throw new RelayError(
				'UNAUTHORIZED',
				'Pair with the token shown under Local agent in the Noddy agent panel.',
				401
			);
		}
	}

	function sendEvent(target, type, data) {
		if (!target || target.res.writableEnded || target.res.destroyed) return;
		target.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
	}

	/**
	 * The newest active MCP client's name, for the panel's "<name> · connected" chip. A session
	 * goes inactive when the tab turns Local agent off or closes, and active again on its next
	 * call, so a re-enabled tab says "waiting" until the coding agent is actually back.
	 */
	function clientName() {
		const last = [...sessions.values()].filter((entry) => entry.active).at(-1);
		return last ? last.client : null;
	}

	function markActive(entry) {
		if (!entry || entry.active) return;
		entry.active = true;
		sendEvent(tab, 'client', { name: clientName() });
	}

	/** Ends a tab's stream and fails the calls it still owed. */
	function dropTab(target, code) {
		if (!target) return;
		if (tab === target) {
			tab = null;
			for (const entry of sessions.values()) entry.active = false;
		}
		clearInterval(target.keepalive);
		if (!tab && code !== 'TAB_REPLACED') {
			// Off: queued messages are dropped and a waiting agent is told. A tab taking over
			// keeps both: the agent goes on listening to the new tab.
			queue = [];
			for (const waiter of [...waiters]) waiter.fail(code);
		}
		for (const [id, call] of pending) {
			if (call.tab === target) {
				pending.delete(id);
				call.finish(toolError(code, MESSAGES[code]));
			}
		}
		if (!target.res.writableEnded) target.res.end();
	}

	async function callTool(sessionId, name, input, signal) {
		const registry = await loadRegistry();
		markActive(sessions.get(sessionId));
		if (CHAT_TOOL_NAMES.has(name)) {
			const chatInput = input ?? {};
			const schema = CHAT_TOOLS.find((tool) => tool.name === name).inputSchema;
			if (
				!chatInput ||
				typeof chatInput !== 'object' ||
				Object.keys(chatInput).some((key) => !(key in schema.properties))
			)
				return toolError('INVALID_ARGUMENTS', `${name}: unknown field.`);
			if (
				chatInput.timeoutSeconds !== undefined &&
				chatInput.timeoutSeconds !== null &&
				!(
					Number.isInteger(chatInput.timeoutSeconds) &&
					chatInput.timeoutSeconds >= 1 &&
					chatInput.timeoutSeconds <= WAIT_MAX_SECONDS
				)
			)
				return toolError(
					'INVALID_ARGUMENTS',
					`timeoutSeconds must be a whole number from 1 to ${WAIT_MAX_SECONDS}.`
				);
			return name === 'wait_for_user_message'
				? waitForMessage(chatInput, signal)
				: replyToUser(chatInput);
		}
		if (!registry.definitions.some((definition) => definition.name === name)) {
			return toolError(
				'UNKNOWN_TOOL',
				`Noddy has no tool named "${String(name).slice(0, 64)}". Use tools/list.`
			);
		}
		const args = input ?? {};
		const validation = registry.validateToolInput(name, args);
		if (!validation.valid) {
			return toolError('INVALID_ARGUMENTS', validation.error || 'Invalid tool arguments.');
		}
		if (!tab) return toolError('NO_TAB', MESSAGES.NO_TAB);
		const target = tab;
		const id = randomUUID();
		return new Promise((resolve) => {
			let timer;
			const onAbort = () => {
				pending.delete(id);
				sendEvent(target, 'cancel', { id });
				finish(toolError('CANCELLED', 'The coding agent cancelled this call.'));
			};
			const finish = (result) => {
				clearTimeout(timer);
				signal?.removeEventListener('abort', onAbort);
				resolve(result);
			};
			timer = setTimeout(() => {
				pending.delete(id);
				sendEvent(target, 'cancel', { id });
				finish(toolError('TIMEOUT', MESSAGES.TIMEOUT));
			}, timeoutMs);
			signal?.addEventListener('abort', onAbort, { once: true });
			pending.set(id, { tab: target, finish });
			sendEvent(target, 'call', { id, session: sessionId, name, input: args });
		});
	}

	function createMcpServer(entry) {
		const server = new Server(
			{ name: 'noddy', version: '1.0.0' },
			{
				capabilities: { tools: {} },
				instructions:
					'Noddy font editor tools, running in the user’s open Noddy tab. Read with get_context first and pass the latest revision as expectedRevision. Draw glyphs as jobs (begin_glyph or create_glyph, edit, submit_glyph): each submit lands as a Draft and one undo step. Inside a job, render_glyphs, check_outlines and read_glyphs show the draft. To carry a mark from one glyph to another, copy_paths it into the job and combine it with boolean_paths (exclude: cut through the ink and keep the mark solid outside, the graffiti look; subtract: remove the mark entirely; union: merge). For algorithmic effects (slash-cut, glitch-bands, warp, grid-snap, pixel-life) call apply_chaos: the same engine as the panel’s Chaos tab, seeded and guarded; then submit_glyph each glyph. Gate issues come with a hint; problems the glyph already had are warnings. Optional fields can be left out. If a result says sessionRestarted, unsubmitted drafts were dropped: begin those jobs again. Respect LOCKED_YOURS and LOCKED_OPEN; never work around them. The user can also talk to you from the Noddy panel: ' +
					LOOP +
					' get_context reports the panel’s mode, chaos and target.',
			}
		);
		server.oninitialized = () => {
			entry.client = String(server.getClientVersion()?.name || 'Local agent').slice(0, 60);
			entry.active = Boolean(tab);
			sendEvent(tab, 'client', { name: clientName() });
		};
		server.setRequestHandler(ListToolsRequestSchema, async () => {
			const { definitions, optionalNullableSchema } = await loadRegistry();
			return {
				tools: [
					...definitions.map((definition) => ({
						name: definition.name,
						description: definition.description,
						// Optional fields are optional here: MCP clients may leave them out (bug 26).
						inputSchema: optionalNullableSchema
							? optionalNullableSchema(definition.inputSchema)
							: definition.inputSchema,
					})),
					...CHAT_TOOLS,
				],
			};
		});
		server.setRequestHandler(CallToolRequestSchema, async (request, extra) =>
			callTool(
				entry.transport.sessionId,
				request.params.name,
				request.params.arguments,
				extra.signal
			)
		);
		return server;
	}

	async function handleMcp(req, res) {
		assertToken(req);
		const sessionId = req.headers['mcp-session-id'];
		if (typeof sessionId === 'string') {
			const entry = sessions.get(sessionId);
			if (!entry) {
				return sendJSON(res, 404, {
					jsonrpc: '2.0',
					error: { code: -32001, message: 'Session not found. Initialize again.' },
					id: null,
				});
			}
			return entry.transport.handleRequest(req, res);
		}
		if (req.method !== 'POST') {
			throw new RelayError('NO_SESSION', 'Initialize an MCP session first.', 400);
		}
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 10_000);
		let body;
		try {
			body = await readBody(req, controller.signal, MCP_BODY_BYTES);
		} finally {
			clearTimeout(timer);
		}
		if (!isInitializeRequest(body)) {
			throw new RelayError('NO_SESSION', 'Initialize an MCP session first.', 400);
		}
		if (sessions.size >= MAX_MCP_SESSIONS) {
			const [oldest] = sessions.values();
			await oldest.transport.close();
		}
		const entry = { client: 'Local agent', transport: null, server: null, active: false };
		entry.transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: (id) => {
				sessions.set(id, entry);
			},
		});
		entry.transport.onclose = () => {
			const id = entry.transport.sessionId;
			if (id && sessions.get(id) === entry) {
				sessions.delete(id);
				sendEvent(tab, 'client', { name: clientName() });
			}
		};
		entry.server = createMcpServer(entry);
		await entry.server.connect(entry.transport);
		await entry.transport.handleRequest(req, res, body);
	}

	function openStream(req, res) {
		assertToken(req);
		// One tab at a time: the newest stream wins and the old tab is told why.
		if (tab) {
			sendEvent(tab, 'replaced', {});
			dropTab(tab, 'TAB_REPLACED');
		}
		res.writeHead(200, {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-store',
			Connection: 'keep-alive',
			'X-Content-Type-Options': 'nosniff',
		});
		const target = {
			res,
			keepalive: setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS),
		};
		tab = target;
		res.on('close', () => dropTab(target, 'LOCAL_AGENT_OFF'));
		sendEvent(target, 'ready', { client: clientName(), listening: waiters.size > 0 });
	}

	async function handleBridgePost(req, res) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 30_000);
		let body;
		try {
			body = await readBody(req, controller.signal, RESULT_BODY_BYTES);
		} finally {
			clearTimeout(timer);
		}
		if (body?.type === 'enable') {
			const port = req.socket.localPort;
			return sendJSON(res, 200, { token, url: `http://localhost:${port}/mcp` });
		}
		assertToken(req);
		if (body?.type === 'stop') {
			dropTab(tab, 'LOCAL_AGENT_OFF');
			return sendJSON(res, 200, { ok: true });
		}
		if (body?.type === 'message') {
			if (!tab) throw new RelayError('NO_TAB', 'Turn on Local agent first.', 409);
			if (queue.length >= MAX_QUEUED)
				throw new RelayError('QUEUE_FULL', 'Too many messages are waiting for the agent.', 429);
			const message = { id: randomUUID(), ...validatePanelMessage(body.message) };
			queue.push(message);
			const waiting = waiters.size > 0;
			pump();
			return sendJSON(res, 200, { ok: true, id: message.id, delivered: waiting });
		}
		if (body?.type === 'result' && typeof body.id === 'string') {
			const call = pending.get(body.id);
			// Unknown, timed out, or owed by another tab: the answer is dropped.
			if (!call || call.tab !== tab) {
				throw new RelayError('UNKNOWN_CALL', 'This call is no longer waiting.', 409);
			}
			pending.delete(body.id);
			call.finish(toMcpResult(body.result));
			return sendJSON(res, 200, { ok: true });
		}
		throw new RelayError('INVALID_BRIDGE', 'Unknown bridge message.', 400);
	}

	/** Connect-style middleware; anything else goes to `next`. */
	async function middleware(req, res, next) {
		const path = req.url?.split('?')[0];
		if (path !== '/mcp' && path !== '/api/agent/bridge') return next();
		try {
			if (path === '/mcp') {
				assertLocalRequest(req);
				return await handleMcp(req, res);
			}
			// The bridge is for this Noddy window: a POST must carry its Origin.
			assertLocalRequest(req, req.method === 'POST');
			if (req.url !== '/api/agent/bridge') {
				throw new RelayError('NOT_FOUND', 'Unknown agent endpoint.', 404);
			}
			if (req.method === 'GET') return openStream(req, res);
			if (req.method === 'POST') return await handleBridgePost(req, res);
			throw new RelayError('METHOD', 'Use GET or POST.', 405);
		} catch (error) {
			if (!res.headersSent) sendHttpError(res, error);
			else if (!res.writableEnded) res.end();
		}
	}

	return {
		middleware,
		/** For tests and server shutdown. */
		close() {
			dropTab(tab, 'LOCAL_AGENT_OFF');
			for (const entry of sessions.values()) entry.transport.close().catch(() => {});
			sessions.clear();
		},
	};
}
