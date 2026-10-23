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

	/** The newest MCP client's name, for the panel's "<name> · connected" chip. */
	function clientName() {
		const last = [...sessions.values()].at(-1);
		return last ? last.client : null;
	}

	/** Ends a tab's stream and fails the calls it still owed. */
	function dropTab(target, code) {
		if (!target) return;
		if (tab === target) tab = null;
		clearInterval(target.keepalive);
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
					'Noddy font editor tools, running in the user’s open Noddy tab. Read with get_context first and pass the latest revision as expectedRevision. Draw glyphs as jobs (begin_glyph or create_glyph, edit, submit_glyph): each submit lands as a Draft and one undo step. Respect LOCKED_YOURS and LOCKED_OPEN; never work around them.',
			}
		);
		server.oninitialized = () => {
			entry.client = String(server.getClientVersion()?.name || 'Local agent').slice(0, 60);
			sendEvent(tab, 'client', { name: clientName() });
		};
		server.setRequestHandler(ListToolsRequestSchema, async () => {
			const { definitions } = await loadRegistry();
			return {
				tools: definitions.map((definition) => ({
					name: definition.name,
					description: definition.description,
					inputSchema: definition.inputSchema,
				})),
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
		const entry = { client: 'Local agent', transport: null, server: null };
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
		sendEvent(target, 'ready', { client: clientName() });
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
