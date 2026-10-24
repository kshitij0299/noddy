import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalAgentLink } from '../local-agent.js';
import { createAgentPanel, probeLocalAgent } from '../ui/agent-panel.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
	for (let i = 0; i < 6; i++) await flush();
};
const TOKEN = 'test-token-not-real-0123456789abcdef';
const URL_ = 'http://localhost:5310/mcp';

/** The dev server's bridge, faked: an SSE stream the test writes to, POSTs recorded. */
function fakeBridge() {
	const encoder = new TextEncoder();
	let streamController;
	const posts = [];
	const bridge = {
		posts,
		streamAborted: false,
		send(type, data) {
			streamController.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
		},
		end() {
			streamController.close();
		},
		fetch: vi.fn(async (url, init = {}) => {
			if (url === '/api/agent/config') {
				return new Response(JSON.stringify({ localAgent: true }), { status: 200 });
			}
			if (init.method === 'POST') {
				const body = JSON.parse(init.body);
				posts.push({ body, auth: init.headers?.Authorization });
				if (body.type === 'enable')
					return new Response(JSON.stringify({ token: TOKEN, url: URL_ }), { status: 200 });
				return new Response('{"ok":true}', { status: 200 });
			}
			const body = new ReadableStream({
				start(controller) {
					streamController = controller;
				},
			});
			init.signal?.addEventListener('abort', () => {
				bridge.streamAborted = true;
				try {
					streamController.error(new DOMException('Aborted', 'AbortError'));
				} catch {
					/* already closed */
				}
			});
			expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
			return new Response(body, {
				status: 200,
				headers: { 'Content-Type': 'text/event-stream' },
			});
		}),
	};
	return bridge;
}

function sessionStub(results = {}) {
	return {
		getContext: () => ({ projectId: 'p', glyphId: null, writable: false }),
		execute: vi.fn((name) => results[name] ?? { ok: true, context: { revision: 'agent-1:1' } }),
		undoLast: vi.fn(),
		dispose: vi.fn(),
	};
}

describe('local agent link', () => {
	it('runs calls through a native session (grantOpen false) and posts the result', async () => {
		const bridge = fakeBridge();
		const session = sessionStub();
		const createSession = vi.fn(() => session);
		const events = [];
		const link = createLocalAgentLink({
			createSession,
			fetchImpl: bridge.fetch,
			onEvent: (event) => events.push(event),
		});
		const { command } = await link.enable();
		expect(command).toBe(
			`claude mcp add --transport http noddy ${URL_} --header "Authorization: Bearer ${TOKEN}"`
		);
		bridge.send('ready', { client: null });
		bridge.send('call', { id: 'c1', session: 's1', name: 'get_context', input: {} });
		await settle();
		expect(createSession).toHaveBeenCalledWith({
			grantOpen: false,
			renderLimit: 32,
			callLimit: 256,
		});
		expect(session.execute).toHaveBeenCalledWith(
			'get_context',
			{},
			expect.objectContaining({ callId: 'c1' })
		);
		const result = bridge.posts.find((post) => post.body.type === 'result');
		expect(result.body).toEqual({
			type: 'result',
			id: 'c1',
			result: { ok: true, context: { revision: 'agent-1:1' } },
		});
		expect(result.auth).toBe(`Bearer ${TOKEN}`);
		expect(events.filter((e) => e.type === 'tool').map((e) => e.state)).toEqual([
			'running',
			'done',
		]);
		link.stop();
	});

	it('replaces a used-up session once and says so', async () => {
		const bridge = fakeBridge();
		const spent = {
			...sessionStub({
				render_glyphs: { ok: false, error: { code: 'RENDER_LIMIT', message: 'limit' } },
			}),
			openJobs: ['glyph-0x42'],
		};
		const fresh = sessionStub({ render_glyphs: { ok: true, width: 1 } });
		const createSession = vi.fn().mockReturnValueOnce(spent).mockReturnValueOnce(fresh);
		const link = createLocalAgentLink({ createSession, fetchImpl: bridge.fetch });
		await link.enable();
		bridge.send('call', { id: 'c1', session: 's1', name: 'render_glyphs', input: {} });
		await settle();
		expect(spent.dispose).toHaveBeenCalled();
		const posted = bridge.posts.find((post) => post.body.type === 'result');
		expect(posted.body.result).toMatchObject({
			ok: true,
			width: 1,
			sessionRestarted: true,
			droppedDrafts: ['glyph-0x42'],
		});
		// Plainly: why, and that the draft is gone.
		expect(posted.body.result.notice).toMatch(/new tool session because .*32 images/);
		expect(posted.body.result.notice).toMatch(/drafts were dropped \(glyph-0x42\)/);
		link.stop();
	});

	it('reports NO_PROJECT when no project is open', async () => {
		const bridge = fakeBridge();
		const createSession = () => {
			throw Object.assign(new Error('Open a project first.'), { code: 'NO_PROJECT' });
		};
		const link = createLocalAgentLink({ createSession, fetchImpl: bridge.fetch });
		await link.enable();
		bridge.send('call', { id: 'c1', session: 's1', name: 'get_context', input: {} });
		await settle();
		const posted = bridge.posts.find((post) => post.body.type === 'result');
		expect(posted.body.result.error.code).toBe('NO_PROJECT');
		link.stop();
	});
});

describe('agent panel: Local agent switch', () => {
	let bridge;
	let session;
	let panel;

	async function mountPanel() {
		bridge = fakeBridge();
		session = sessionStub({
			submit_glyph: { ok: true, changed: true, glyph: { glyphId: 'glyph-0x42' } },
		});
		panel = createAgentPanel({
			getEditor: () => null,
			probe: async () => true,
			createSession: () => session,
			probeLocal: () => probeLocalAgent(bridge.fetch),
			loadLocalAgent: async () => {
				const module = await import('../ui/local-agent-control.js');
				return {
					mountLocalAgent: (hooks) => module.mountLocalAgent({ ...hooks, fetchImpl: bridge.fetch }),
				};
			},
		});
		document.body.append(panel.host);
		// The switch arrives after the config probe and the module import.
		await vi.waitFor(() => expect(panel.localAgent).not.toBeNull());
		return panel;
	}

	const toggle = () => panel.panel.querySelector('button[aria-label="Local agent"]');
	const chip = () => panel.panel.querySelector('.agent-panel__model');

	beforeEach(() => {
		document.body.innerHTML = '';
		sessionStorage.clear();
	});
	afterEach(() => {
		panel?.dispose();
		document.body.innerHTML = '';
		sessionStorage.clear();
	});

	it('shows no switch when the server does not offer Local agent', async () => {
		panel = createAgentPanel({
			getEditor: () => null,
			probe: async () => true,
			probeLocal: async () => false,
			loadLocalAgent: vi.fn(),
		});
		await settle();
		expect(panel.panel.querySelector('button[aria-label="Local agent"]')).toBeNull();
	});

	it('is off by default; turning it on shows the command and makes Send a Stop', async () => {
		await mountPanel();
		expect(toggle()).not.toBeNull();
		expect(toggle().getAttribute('aria-pressed')).toBe('false');
		expect(chip().textContent).toBe('No model');
		toggle().click();
		await settle();
		expect(toggle().getAttribute('aria-pressed')).toBe('true');
		const command = panel.thread.querySelector('.agent-local__command');
		expect(command.textContent).toContain('claude mcp add --transport http noddy');
		expect(command.textContent).toContain(`Bearer ${TOKEN}`);
		// Keyboard: focus lands on Copy command.
		expect(document.activeElement.textContent).toBe('Copy command');
		expect(chip().textContent).toBe('Local agent · waiting');
		expect(panel.composer.send.getAttribute('aria-label')).toBe('Stop the agent');
	});

	it('connected: the chip names the client, tool calls show as steps and a receipt', async () => {
		await mountPanel();
		toggle().click();
		await settle();
		bridge.send('client', { name: 'claude-code' });
		bridge.send('client', { name: 'claude-code' });
		await settle();
		expect(chip().textContent).toBe('Claude Code · connected');
		expect(panel.thread.textContent.split('Claude Code connected').length - 1).toBe(1);
		bridge.send('call', {
			id: 'c1',
			session: 's1',
			name: 'submit_glyph',
			input: { glyphId: 'glyph-0x42' },
		});
		await settle();
		const steps = [...panel.thread.querySelectorAll('agent-step-line')].map((line) =>
			line.textContent.trim()
		);
		expect(steps.some((text) => text.includes('Claude Code connected'))).toBe(true);
		expect(steps.some((text) => text.includes('submit glyph'))).toBe(true);
		expect(panel.thread.querySelector('agent-receipt-card')).not.toBeNull();
	});

	it('Stop turns it off: tells the server, closes the stream and restores the chip', async () => {
		await mountPanel();
		toggle().click();
		await settle();
		bridge.send('client', { name: 'Claude Code' });
		await settle();
		panel.composer.send.click();
		await settle();
		expect(bridge.posts.some((post) => post.body.type === 'stop')).toBe(true);
		expect(bridge.streamAborted).toBe(true);
		expect(toggle().getAttribute('aria-pressed')).toBe('false');
		expect(chip().textContent).toBe('No model');
		expect(panel.thread.querySelector('.agent-local__command')).toBeNull();
		expect(panel.composer.send.getAttribute('aria-label')).toBe('Send');
	});

	it('another tab taking over turns this one off', async () => {
		await mountPanel();
		toggle().click();
		await settle();
		bridge.send('replaced', {});
		await settle();
		expect(toggle().getAttribute('aria-pressed')).toBe('false');
		expect(panel.thread.textContent).toContain('Local agent moved to another tab');
	});

	it('a reload keeps it on for this tab and re-attaches with the same token (bug 25)', async () => {
		await mountPanel();
		toggle().click();
		await settle();
		const kept = sessionStorage.getItem('noddy.localAgent');
		expect(kept).toMatch(/^on:/);
		expect(kept).not.toContain(TOKEN);
		// Reload: the stream closes, the panel is built again from scratch.
		bridge.end();
		await settle();
		panel.dispose();
		sessionStorage.setItem('noddy.localAgent', kept); // dispose is test teardown, not a reload
		await mountPanel();
		await settle();
		expect(toggle().getAttribute('aria-pressed')).toBe('true');
		expect(bridge.posts.filter((post) => post.body.type === 'enable')).toHaveLength(1);
		const stream = bridge.fetch.mock.calls.find(([, init]) => init?.headers?.Accept);
		expect(stream[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
		expect(panel.thread.textContent).toContain('Local agent is still on after the reload');
		expect(panel.thread.querySelector('.agent-local__command')).toBeNull();
	});

	it('after a dev server restart (new token) the reload shows the new command', async () => {
		sessionStorage.setItem('noddy.localAgent', 'on:another-token-fingerprint');
		await mountPanel();
		await settle();
		expect(toggle().getAttribute('aria-pressed')).toBe('true');
		expect(panel.thread.querySelector('.agent-local__command').textContent).toContain(TOKEN);
	});

	it('Stop forgets it, so a reload leaves it off', async () => {
		await mountPanel();
		toggle().click();
		await settle();
		panel.composer.send.click();
		await settle();
		expect(sessionStorage.getItem('noddy.localAgent')).toBeNull();
	});
});
