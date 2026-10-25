// Local agent (dev server only): /mcp for a coding agent + /api/agent/bridge for the Noddy tab.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CHAT_TOOLS, createLocalAgentBridge } from './local-agent.js';
import { createAgentMiddleware } from './relay.js';
import { createLocalAgentServer } from './serve.js';
import { agentRelayPlugin } from './vite-plugin.js';
import { TOOL_DEFINITIONS, optionalNullableSchema } from '../../src/agent/tool-definitions.js';

const PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';

/** An http server running the bridge, then the normal relay. */
async function startServer(options = {}) {
	const bridge = createLocalAgentBridge(options);
	const relay = createAgentMiddleware({ localAgent: true });
	const server = createServer((req, res) => bridge.middleware(req, res, () => relay(req, res)));
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const origin = `http://127.0.0.1:${server.address().port}`;
	return {
		bridge,
		origin,
		async close() {
			bridge.close();
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

/** Turns Local agent on like the panel does: the response carries the token. */
async function enable(origin) {
	const response = await fetch(origin + '/api/agent/bridge', {
		method: 'POST',
		headers: { Origin: origin, 'Content-Type': 'application/json' },
		body: JSON.stringify({ type: 'enable' }),
	});
	assert.equal(response.status, 200);
	return response.json();
}

/**
 * A fake Noddy tab: reads the bridge's server-sent events and answers each call
 * with `answer(call)` (undefined = never answers).
 */
async function connectTab(origin, token, answer = () => ({ ok: true })) {
	const controller = new AbortController();
	const response = await fetch(origin + '/api/agent/bridge', {
		headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
		signal: controller.signal,
	});
	assert.equal(response.status, 200);
	assert.match(response.headers.get('content-type'), /text\/event-stream/);
	const events = [];
	const waiters = [];
	const notify = () => waiters.splice(0).forEach((resolve) => resolve());
	const tab = {
		events,
		calls: [],
		closed: false,
		/** Resolves once an event of this type has arrived. */
		async waitFor(type) {
			while (!events.some((event) => event.type === type)) {
				if (tab.closed) throw new Error(`stream closed before ${type}`);
				await new Promise((resolve) => waiters.push(resolve));
			}
			return events.find((event) => event.type === type);
		},
		async post(body) {
			return fetch(origin + '/api/agent/bridge', {
				method: 'POST',
				headers: {
					Origin: origin,
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			});
		},
		close() {
			controller.abort();
		},
	};
	(async () => {
		const decoder = new TextDecoder();
		let buffer = '';
		try {
			for await (const chunk of response.body) {
				buffer += decoder.decode(chunk, { stream: true });
				let end;
				while ((end = buffer.indexOf('\n\n')) >= 0) {
					const block = buffer.slice(0, end);
					buffer = buffer.slice(end + 2);
					const type = /^event: (.*)$/m.exec(block)?.[1];
					const data = /^data: (.*)$/m.exec(block)?.[1];
					if (!type) continue;
					const event = { type, data: data ? JSON.parse(data) : null };
					events.push(event);
					if (type === 'call') {
						tab.calls.push(event.data);
						const result = await answer(event.data);
						if (result !== undefined) await tab.post({ type: 'result', id: event.data.id, result });
					}
					notify();
				}
			}
		} catch {
			/* aborted */
		}
		tab.closed = true;
		notify();
	})();
	await tab.waitFor('ready');
	return tab;
}

async function connectClient(origin, token, name = 'Claude Code') {
	const client = new Client({ name, version: '1.0.0' });
	const transport = new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
		requestInit: { headers: { Authorization: `Bearer ${token}` } },
	});
	await client.connect(transport);
	return client;
}

const errorOf = (result) => {
	assert.equal(result.isError, true);
	return JSON.parse(result.content[0].text).error;
};

/** Raw HTTP, so the Host header can be forged (fetch normalizes it). */
function rawStatus(url, headers) {
	return new Promise((resolve, reject) => {
		const req = httpRequest(url, { method: 'POST', headers }, (res) => {
			res.resume();
			resolve(res.statusCode);
		});
		req.on('error', reject);
		req.end('{}');
	});
}

let env;
before(async () => {
	env = await startServer();
});
after(async () => {
	await env.close();
});

test('config reports localAgent only when the relay is built for the dev server', async () => {
	const config = await (await fetch(env.origin + '/api/agent/config')).json();
	assert.equal(config.localAgent, true);
	const plain = createAgentMiddleware();
	const server = createServer((req, res) => plain(req, res));
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	try {
		const url = `http://127.0.0.1:${server.address().port}/api/agent/config`;
		assert.equal((await (await fetch(url)).json()).localAgent, false);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test('/mcp without the pairing token is 401; a wrong token too', async () => {
	const init = {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			protocolVersion: '2025-06-18',
			capabilities: {},
			clientInfo: { name: 'x', version: '1' },
		},
	};
	const post = (headers) =>
		fetch(env.origin + '/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				...headers,
			},
			body: JSON.stringify(init),
		});
	assert.equal((await post({})).status, 401);
	assert.equal((await post({ Authorization: 'Bearer wrong' })).status, 401);
	assert.equal((await fetch(env.origin + '/mcp')).status, 401);
	assert.equal((await fetch(env.origin + '/mcp', { method: 'DELETE' })).status, 401);
	// The bridge stream and results need the token as well.
	assert.equal((await fetch(env.origin + '/api/agent/bridge')).status, 401);
});

test('/mcp and the bridge refuse a bad Host or a foreign Origin with 403', async () => {
	const { token } = await enable(env.origin);
	const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
	assert.equal(await rawStatus(env.origin + '/mcp', { ...auth, Host: 'evil.example' }), 403);
	assert.equal(
		await rawStatus(env.origin + '/mcp', { ...auth, Origin: 'http://evil.example' }),
		403
	);
	assert.equal(
		await rawStatus(env.origin + '/api/agent/bridge', { ...auth, Host: 'evil.example' }),
		403
	);
	// Enabling hands out the token, so it needs this window's Origin.
	const noOrigin = await fetch(env.origin + '/api/agent/bridge', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ type: 'enable' }),
	});
	assert.equal(noOrigin.status, 403);
	assert.equal(
		await rawStatus(env.origin + '/api/agent/bridge', {
			'Content-Type': 'application/json',
			Origin: 'http://evil.example',
		}),
		403
	);
});

test('non-loopback connections are refused (the shared assertLocalRequest)', async () => {
	const fake = /** @type {any} */ ({
		url: '/mcp',
		method: 'POST',
		headers: { host: 'localhost:5310' },
		socket: { remoteAddress: '192.168.1.20', localPort: 5310 },
	});
	let status;
	let ended = false;
	const res = /** @type {any} */ ({
		writeHead(code) {
			status = code;
		},
		end() {
			ended = true;
		},
		destroyed: false,
		writableEnded: false,
	});
	await env.bridge.middleware(fake, res, () => assert.fail('must not fall through'));
	assert.equal(status, 403);
	assert.equal(ended, true);
});

test('lists exactly the native tools with their JSON schemas; enable returns the command', async () => {
	const enabled = await enable(env.origin);
	assert.match(enabled.token, /^[A-Za-z0-9_-]{32,}$/);
	assert.equal(enabled.url, `${env.origin.replace('127.0.0.1', 'localhost')}/mcp`);
	const client = await connectClient(env.origin, enabled.token);
	try {
		const { tools } = await client.listTools();
		assert.deepEqual(
			tools.map((tool) => tool.name),
			[...TOOL_DEFINITIONS.map((definition) => definition.name), ...CHAT_TOOLS.map((t) => t.name)]
		);
		// The panel chat tools tell the agent to loop.
		for (const name of ['wait_for_user_message', 'reply_to_user']) {
			const chatTool = tools.find((tool) => tool.name === name);
			assert.match(chatTool.description, /wait_for_user_message.*reply_to_user.*again/s);
		}
		const render = tools.find((tool) => tool.name === 'render_glyphs');
		const native = TOOL_DEFINITIONS.find((definition) => definition.name === 'render_glyphs');
		// Optional fields are optional for MCP clients (bug 26).
		assert.deepEqual(render.inputSchema, optionalNullableSchema(native.inputSchema));
		assert.deepEqual(render.inputSchema.required, ['glyphIds']);
		assert.equal(render.description, native.description);
	} finally {
		await client.close();
	}
});

test('no connected tab: a clear tool error, not a protocol failure', async () => {
	const { token } = await enable(env.origin);
	const client = await connectClient(env.origin, token);
	try {
		const result = await client.callTool({ name: 'get_context', arguments: {} });
		const error = errorOf(result);
		assert.equal(error.code, 'NO_TAB');
		assert.match(error.message, /Local agent/);
	} finally {
		await client.close();
	}
});

test('unknown tools and invalid input are tool errors and never reach the tab', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token);
	const client = await connectClient(env.origin, token);
	try {
		assert.equal(
			errorOf(await client.callTool({ name: 'delete_everything', arguments: {} })).code,
			'UNKNOWN_TOOL'
		);
		assert.equal(
			errorOf(await client.callTool({ name: 'read_glyphs', arguments: { glyphIds: 'A' } })).code,
			'INVALID_ARGUMENTS'
		);
		assert.equal(tab.calls.length, 0);
	} finally {
		await client.close();
		tab.close();
	}
});

test('round trip through a fake tab: JSON text, PNG image content, native errors as isError', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token, (call) => {
		if (call.name === 'render_glyphs')
			return { ok: true, image: `data:image/png;base64,${PNG_BASE64}`, width: 1, height: 1 };
		if (call.name === 'set_spacing')
			return {
				ok: false,
				error: { code: 'LOCKED_YOURS', message: 'This glyph is Yours.' },
			};
		return { ok: true, context: { projectId: 'p1', revision: 'agent-1:1' } };
	});
	const client = await connectClient(env.origin, token, 'Claude Code');
	try {
		const client1 = await tab.waitFor('client');
		assert.equal(client1.data.name, 'Claude Code');

		const context = await client.callTool({ name: 'get_context', arguments: {} });
		assert.equal(context.isError, undefined);
		assert.deepEqual(JSON.parse(context.content[0].text), {
			ok: true,
			context: { projectId: 'p1', revision: 'agent-1:1' },
		});
		const call = tab.calls[0];
		assert.equal(call.name, 'get_context');
		assert.deepEqual(call.input, {});
		assert.equal(typeof call.session, 'string');

		const render = await client.callTool({
			name: 'render_glyphs',
			arguments: { glyphIds: ['glyph-0x41'], height: null, guides: null },
		});
		assert.equal(render.content.length, 2);
		assert.equal(render.content[1].type, 'image');
		assert.equal(render.content[1].mimeType, 'image/png');
		assert.equal(render.content[1].data, PNG_BASE64);
		assert.doesNotMatch(render.content[0].text, /base64/);

		const locked = await client.callTool({
			name: 'set_spacing',
			arguments: {
				glyphId: 'glyph-0x41',
				expectedRevision: 'agent-1:1',
				metric: 'advanceWidth',
				value: 600,
			},
		});
		assert.equal(errorOf(locked).code, 'LOCKED_YOURS');
	} finally {
		await client.close();
		tab.close();
	}
});

test('a tab that does not answer in time gives a TIMEOUT tool error and a cancel event', async () => {
	const quick = await startServer({ timeoutMs: 150 });
	try {
		const { token } = await enable(quick.origin);
		const tab = await connectTab(quick.origin, token, () => undefined);
		const client = await connectClient(quick.origin, token);
		try {
			const error = errorOf(await client.callTool({ name: 'get_context', arguments: {} }));
			assert.equal(error.code, 'TIMEOUT');
			const cancel = await tab.waitFor('cancel');
			assert.equal(cancel.data.id, tab.calls[0].id);
			// A late answer is ignored.
			const late = await tab.post({ type: 'result', id: tab.calls[0].id, result: { ok: true } });
			assert.equal(late.status, 409);
		} finally {
			await client.close();
			tab.close();
		}
	} finally {
		await quick.close();
	}
});

test('Stop rejects the pending call and every later call with a readable error', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token, () => undefined);
	const client = await connectClient(env.origin, token);
	try {
		const pending = client.callTool({ name: 'get_context', arguments: {} });
		await tab.waitFor('call');
		assert.equal((await tab.post({ type: 'stop' })).status, 200);
		const error = errorOf(await pending);
		assert.equal(error.code, 'LOCAL_AGENT_OFF');
		assert.match(error.message, /turned off|stopped/i);
		assert.equal(
			errorOf(await client.callTool({ name: 'get_context', arguments: {} })).code,
			'NO_TAB'
		);
	} finally {
		await client.close();
		tab.close();
	}
});

test('a call without its optional fields reaches the tab (bug 26)', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token);
	const client = await connectClient(env.origin, token);
	try {
		const result = await client.callTool({
			name: 'render_glyphs',
			arguments: { glyphIds: ['glyph-0x41'] },
		});
		assert.equal(result.isError, undefined);
		assert.deepEqual(tab.calls[0].input, { glyphIds: ['glyph-0x41'] });
	} finally {
		await client.close();
		tab.close();
	}
});

test('after Stop the connected chip clears: a re-enabled tab waits until the agent calls again', async () => {
	const { token } = await enable(env.origin);
	const first = await connectTab(env.origin, token);
	const client = await connectClient(env.origin, token);
	try {
		await client.callTool({ name: 'get_context', arguments: {} });
		await first.post({ type: 'stop' });
		const second = await connectTab(env.origin, token);
		assert.equal(second.events.find((event) => event.type === 'ready').data.client, null);
		await client.callTool({ name: 'get_context', arguments: {} });
		const named = await second.waitFor('client');
		assert.equal(named.data.name, 'Claude Code');
		second.close();
	} finally {
		await client.close();
		first.close();
	}
});

test('closing the tab (stream disconnect) rejects pending calls', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token, () => undefined);
	const client = await connectClient(env.origin, token);
	try {
		const pending = client.callTool({ name: 'get_context', arguments: {} });
		await tab.waitFor('call');
		tab.close();
		assert.equal(errorOf(await pending).code, 'LOCAL_AGENT_OFF');
	} finally {
		await client.close();
	}
});

test('a second tab takes over: the first is told and disconnected, calls go to the second', async () => {
	const { token } = await enable(env.origin);
	const first = await connectTab(env.origin, token, () => undefined);
	const client = await connectClient(env.origin, token);
	try {
		const pending = client.callTool({ name: 'get_context', arguments: {} });
		await first.waitFor('call');
		const second = await connectTab(env.origin, token, () => ({ ok: true, from: 'second' }));
		await first.waitFor('replaced');
		assert.equal(errorOf(await pending).code, 'TAB_REPLACED');
		const result = await client.callTool({ name: 'get_context', arguments: {} });
		assert.equal(JSON.parse(result.content[0].text).from, 'second');
		// The first tab cannot answer for the second one.
		const stale = await first.post({
			type: 'result',
			id: second.calls[0].id,
			result: { ok: true },
		});
		assert.equal(stale.status, 409);
		second.close();
	} finally {
		await client.close();
		first.close();
	}
});

// ---- Talking to the agent from the panel (bug 30) ----

const textOf = (result) => JSON.parse(result.content[0].text);
const panelMessage = (text, extra = {}) => ({
	type: 'message',
	message: {
		text,
		attachments: [{ name: 'sketch.png', kind: 'image', size: 1234 }],
		target: { scope: 'selected', glyphIds: ['glyph-0x41', 'glyph-0x42'] },
		mode: 'remix',
		chaos: 70,
		...extra,
	},
});

test('wait_for_user_message returns what the user typed, with target, mode and chaos', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token);
	const client = await connectClient(env.origin, token);
	try {
		const waiting = client.callTool({ name: 'wait_for_user_message', arguments: {} });
		const listening = await tab.waitFor('listening');
		assert.equal(listening.data.on, true);
		const posted = await tab.post(panelMessage('Make the A bolder'));
		assert.equal(posted.status, 200);
		const { id, delivered } = await posted.json();
		assert.equal(delivered, true);
		const result = textOf(await waiting);
		assert.equal(result.ok, true);
		assert.deepEqual(result.message, {
			id,
			text: 'Make the A bolder',
			attachments: [{ name: 'sketch.png', kind: 'image', size: 1234 }],
			target: { scope: 'selected', glyphIds: ['glyph-0x41', 'glyph-0x42'] },
			mode: 'remix',
			chaos: 70,
		});
		assert.equal((await tab.waitFor('delivered')).data.id, id);
		// Messages never reach the tab as tool calls.
		assert.equal(tab.calls.length, 0);
	} finally {
		await client.close();
		tab.close();
	}
});

test('messages sent while the agent is busy are queued and come one per call, in order', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token);
	const client = await connectClient(env.origin, token);
	try {
		const first = await (await tab.post(panelMessage('one'))).json();
		assert.equal(first.delivered, false);
		await tab.post(panelMessage('two'));
		const a = textOf(await client.callTool({ name: 'wait_for_user_message', arguments: {} }));
		const b = textOf(await client.callTool({ name: 'wait_for_user_message', arguments: {} }));
		assert.deepEqual([a.message.text, b.message.text], ['one', 'two']);
	} finally {
		await client.close();
		tab.close();
	}
});

test('the long poll times out with timedOut, never longer than asked', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token);
	const client = await connectClient(env.origin, token);
	try {
		const started = Date.now();
		const result = textOf(
			await client.callTool({ name: 'wait_for_user_message', arguments: { timeoutSeconds: 1 } })
		);
		const took = Date.now() - started;
		assert.equal(result.message, null);
		assert.equal(result.timedOut, true);
		assert.ok(took >= 900 && took < 5000, `took ${took} ms`);
		assert.equal(
			errorOf(
				await client.callTool({ name: 'wait_for_user_message', arguments: { timeoutSeconds: 120 } })
			).code,
			'INVALID_ARGUMENTS'
		);
	} finally {
		await client.close();
		tab.close();
	}
});

test('reply_to_user shows the text in the tab; without a tab it is NO_TAB', async () => {
	const { token } = await enable(env.origin);
	const client = await connectClient(env.origin, token);
	try {
		assert.equal(
			errorOf(await client.callTool({ name: 'reply_to_user', arguments: { text: 'hi' } })).code,
			'NO_TAB'
		);
		assert.equal(
			errorOf(await client.callTool({ name: 'wait_for_user_message', arguments: {} })).code,
			'NO_TAB'
		);
		const tab = await connectTab(env.origin, token);
		const result = await client.callTool({
			name: 'reply_to_user',
			arguments: { text: 'Made the A bolder.' },
		});
		assert.equal(result.isError, undefined);
		assert.equal((await tab.waitFor('reply')).data.text, 'Made the A bolder.');
		assert.equal(
			errorOf(await client.callTool({ name: 'reply_to_user', arguments: { text: '' } })).code,
			'INVALID_ARGUMENTS'
		);
		tab.close();
	} finally {
		await client.close();
	}
});

test('Stop fails a waiting wait_for_user_message and drops the queue', async () => {
	const { token } = await enable(env.origin);
	const tab = await connectTab(env.origin, token);
	const client = await connectClient(env.origin, token);
	try {
		const waiting = client.callTool({ name: 'wait_for_user_message', arguments: {} });
		await tab.waitFor('listening');
		await tab.post({ type: 'stop' });
		assert.equal(errorOf(await waiting).code, 'LOCAL_AGENT_OFF');
		// A new tab starts with an empty queue.
		const again = await connectTab(env.origin, token);
		const result = textOf(
			await client.callTool({ name: 'wait_for_user_message', arguments: { timeoutSeconds: 1 } })
		);
		assert.equal(result.message, null);
		again.close();
	} finally {
		await client.close();
		tab.close();
	}
});

test('panel messages need the token, the Origin and a tab; bad messages are refused', async () => {
	const { token } = await enable(env.origin);
	const post = (body, headers = {}) =>
		fetch(env.origin + '/api/agent/bridge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: env.origin, ...headers },
			body: JSON.stringify(body),
		});
	assert.equal((await post(panelMessage('hi'))).status, 401);
	assert.equal((await post(panelMessage('hi'), { Authorization: 'Bearer wrong' })).status, 401);
	assert.equal(
		(
			await post(panelMessage('hi'), {
				Authorization: `Bearer ${token}`,
				Origin: 'http://evil.example',
			})
		).status,
		403
	);
	// No tab connected.
	assert.equal((await post(panelMessage('hi'), { Authorization: `Bearer ${token}` })).status, 409);
	const tab = await connectTab(env.origin, token);
	try {
		const auth = { Authorization: `Bearer ${token}` };
		assert.equal((await post({ type: 'message', message: { text: '' } }, auth)).status, 400);
		assert.equal(
			(await post({ type: 'message', message: { text: 'x', apiKey: 'sk-' } }, auth)).status,
			400
		);
		assert.equal(
			(await post({ type: 'message', message: { text: 'x'.repeat(12_001) } }, auth)).status,
			400
		);
	} finally {
		tab.close();
	}
});

test('preview server and serve.js do not expose /mcp or the bridge', async () => {
	const handlers = [];
	const plugin = agentRelayPlugin();
	/** @type {any} */ (plugin.configurePreviewServer)({
		middlewares: { use: (handler) => handlers.push(handler) },
	});
	const preview = createServer((req, res) => {
		const chain = [...handlers];
		const next = () => {
			const handler = chain.shift();
			if (handler) handler(req, res, next);
			else {
				res.writeHead(404);
				res.end();
			}
		};
		next();
	});
	preview.listen(0, '127.0.0.1');
	await once(preview, 'listening');
	const production = createLocalAgentServer({ distDir: '/nonexistent' });
	production.listen(0, '127.0.0.1');
	await once(production, 'listening');
	try {
		for (const server of [preview, production]) {
			const base = `http://127.0.0.1:${server.address().port}`;
			for (const path of ['/mcp', '/api/agent/bridge']) {
				const response = await fetch(base + path, {
					method: 'POST',
					headers: { Origin: base, 'Content-Type': 'application/json' },
					body: JSON.stringify({ type: 'enable' }),
				});
				// 404 (no route) or 405 (serve.js: only GET/HEAD for files); never 401 or 200.
				assert.ok([404, 405].includes(response.status), `${base}${path}: ${response.status}`);
				assert.equal((await fetch(base + path)).status, 404, `GET ${base}${path}`);
			}
			const config = await (await fetch(base + '/api/agent/config')).json();
			assert.equal(config.localAgent, false);
		}
	} finally {
		await new Promise((resolve) => preview.close(resolve));
		await new Promise((resolve) => production.close(resolve));
	}
});
