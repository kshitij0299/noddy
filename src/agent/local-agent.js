/**
 * Local agent link: this tab's side of the dev server bridge (server/agent/local-agent.js).
 * Dev server only; the panel loads it through an `import.meta.env.DEV` dynamic import, so it
 * is not in the production build.
 *
 * Turning it on (enable) asks the dev server for the pairing token and opens the bridge's
 * event stream. Each `call` event runs through createNativeToolSession().execute(), the same
 * path as the built-in agent: validation, revision checks, LOCKED_YOURS / LOCKED_OPEN, glyph
 * jobs as Drafts, one undo step per submit and the mutation log all apply unchanged.
 *
 * Session lifetime: one native session per MCP session (the coding agent's connection), made
 * on its first call with `grantOpen: false` (an external agent has no Send, so the glyph open
 * in the editor stays locked). The session is replaced, and the call retried once, when it
 * reports PROJECT_CHANGED, SESSION_CLOSED, SESSION_LIMIT (256 calls) or RENDER_LIMIT (32
 * images); the retried result says `sessionRestarted: true` with a plain `notice` naming the
 * dropped drafts, its revision is new and any unsubmitted draft of the old session is gone.
 * Turning the link off disposes every session.
 */

// Errors that mean "this session is used up or stale", not "this call is wrong".
const RESTART_CODES = ['PROJECT_CHANGED', 'SESSION_CLOSED', 'SESSION_LIMIT', 'RENDER_LIMIT'];
const ENDPOINT = '/api/agent/bridge';
// Per MCP session (a coding agent's whole conversation, not one Send).
export const LOCAL_RENDER_LIMIT = 32;
export const LOCAL_CALL_LIMIT = 256;
const RESTART_REASONS = {
	PROJECT_CHANGED: 'the project changed',
	SESSION_CLOSED: 'the old session had ended',
	SESSION_LIMIT: `the old session reached its ${LOCAL_CALL_LIMIT}-call limit`,
	RENDER_LIMIT: `the old session rendered ${LOCAL_RENDER_LIMIT} images`,
};

/** What a retried call's result says when its session was replaced. */
function restartNotice(code, dropped) {
	const reason = RESTART_REASONS[code] || 'the old session ended';
	const drafts = dropped.length
		? `Unsubmitted glyph drafts were dropped (${dropped.join(', ')}): begin those jobs again.`
		: 'No unsubmitted drafts were open.';
	return `Noddy started a new tool session because ${reason}. ${drafts} Use the revision in this result.`;
}

/**
 * @param {Object} options
 * @param {(options: Object) => {execute: Function, dispose: Function}} options.createSession
 * @param {(event: Object) => void} [options.onEvent] - `state` {state: 'off'|'waiting'|
 *   'connected', client, reason}, `tool` {id, name, state: 'running'|'done'|'error', result}
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createLocalAgentLink({
	createSession,
	onEvent = () => {},
	fetchImpl = (...args) => globalThis.fetch(...args),
}) {
	let token = '';
	/** @type {AbortController | null} */
	let stream = null;
	let state = 'off';
	let client = null;
	/** @type {Map<String, {execute: Function, dispose: Function}>} */
	const sessions = new Map();
	/** @type {Map<String, AbortController>} */
	const running = new Map();

	function setState(next, reason) {
		state = next;
		onEvent({ type: 'state', state, client, ...(reason ? { reason } : {}) });
	}

	function setClient(name) {
		client = typeof name === 'string' && name ? name.slice(0, 60) : null;
		setState(client ? 'connected' : 'waiting');
	}

	const authHeaders = () => ({ Authorization: `Bearer ${token}` });

	function sessionFor(key) {
		let session = sessions.get(key);
		if (!session) {
			session = createSession({
				grantOpen: false,
				renderLimit: LOCAL_RENDER_LIMIT,
				callLimit: LOCAL_CALL_LIMIT,
			});
			sessions.set(key, session);
		}
		return session;
	}

	function closeSessions() {
		for (const session of sessions.values()) session.dispose();
		sessions.clear();
	}

	async function execute(call, signal) {
		let restarted = null;
		for (let attempt = 0; attempt < 2; attempt++) {
			let session;
			try {
				session = sessionFor(call.session);
			} catch (error) {
				return {
					ok: false,
					error: { code: error.code || 'NO_PROJECT', message: error.message },
				};
			}
			const result = await session.execute(call.name, call.input, {
				callId: call.id,
				signal,
			});
			if (attempt === 0 && RESTART_CODES.includes(result?.error?.code)) {
				let dropped = [];
				try {
					dropped = [...(session.openJobs || [])];
				} catch {
					// A session without job bookkeeping drops nothing visible.
				}
				session.dispose();
				sessions.delete(call.session);
				restarted = { code: result.error.code, dropped };
				continue;
			}
			return restarted
				? {
						...result,
						sessionRestarted: true,
						droppedDrafts: restarted.dropped,
						notice: restartNotice(restarted.code, restarted.dropped),
				  }
				: result;
		}
	}

	async function handleCall(call, owner) {
		if (!call || typeof call.id !== 'string' || typeof call.name !== 'string') return;
		const abort = new AbortController();
		running.set(call.id, abort);
		onEvent({ type: 'tool', id: call.id, name: call.name, state: 'running' });
		let result;
		try {
			result = await execute(call, abort.signal);
		} catch (error) {
			result = { ok: false, error: { code: 'NATIVE_TOOL_FAILED', message: error.message } };
		} finally {
			running.delete(call.id);
		}
		if (stream === owner) {
			await fetchImpl(ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...authHeaders() },
				body: JSON.stringify({ type: 'result', id: call.id, result }),
			}).catch(() => {});
		}
		onEvent({
			type: 'tool',
			id: call.id,
			name: call.name,
			state: result?.ok ? 'done' : 'error',
			result,
		});
	}

	function dispatch(type, data, owner) {
		if (type === 'ready') setClient(data?.client);
		else if (type === 'client') setClient(data?.name);
		else if (type === 'call') handleCall(data, owner);
		else if (type === 'cancel') running.get(data?.id)?.abort();
		else if (type === 'replaced') turnOff('replaced', { notify: false });
	}

	/** Reads server-sent events from a fetch body (EventSource cannot send the token header). */
	async function read(body, owner) {
		const decoder = new TextDecoder();
		const reader = body.getReader();
		let buffer = '';
		try {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
				let end;
				while ((end = buffer.indexOf('\n\n')) >= 0) {
					const block = buffer.slice(0, end);
					buffer = buffer.slice(end + 2);
					const type = /^event: ?(.*)$/m.exec(block)?.[1];
					const data = /^data: ?(.*)$/m.exec(block)?.[1];
					if (!type) continue;
					let parsed = null;
					try {
						parsed = data ? JSON.parse(data) : null;
					} catch {
						continue;
					}
					dispatch(type, parsed, owner);
				}
			}
		} catch {
			/* Aborted or the dev server went away. */
		}
		if (stream === owner) turnOff('closed', { notify: false });
	}

	/**
	 * @param {String} reason - 'stop' | 'replaced' | 'closed'
	 * @param {{notify?: Boolean}} [options] - notify: tell the server (Stop / the switch)
	 */
	function turnOff(reason, { notify = true } = {}) {
		if (state === 'off') return;
		const owner = stream;
		stream = null;
		for (const abort of running.values()) abort.abort();
		if (notify && token) {
			fetchImpl(ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...authHeaders() },
				body: JSON.stringify({ type: 'stop' }),
			})
				.catch(() => {})
				.finally(() => owner?.abort());
		} else owner?.abort();
		closeSessions();
		token = '';
		client = null;
		setState('off', reason);
	}

	return {
		get state() {
			return state;
		},
		get client() {
			return client;
		},
		/**
		 * Makes this tab the local agent's target.
		 * @returns {Promise<{command: String, url: String}>}
		 */
		async enable() {
			if (state !== 'off') throw new Error('Local agent is already on.');
			const unavailable = () =>
				new Error('Local agent needs the dev server (npm run dev). Nothing was turned on.');
			let response;
			try {
				response = await fetchImpl(ENDPOINT, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ type: 'enable' }),
				});
			} catch {
				throw unavailable();
			}
			if (!response.ok) throw unavailable();
			const paired = await response.json();
			if (typeof paired?.token !== 'string' || typeof paired?.url !== 'string') throw unavailable();
			token = paired.token;
			const owner = new AbortController();
			let events;
			try {
				events = await fetchImpl(ENDPOINT, {
					headers: { Accept: 'text/event-stream', ...authHeaders() },
					signal: owner.signal,
				});
			} catch {
				token = '';
				throw unavailable();
			}
			if (!events.ok || !events.body) {
				token = '';
				throw unavailable();
			}
			stream = owner;
			setState('waiting');
			read(events.body, owner);
			return {
				url: paired.url,
				command: `claude mcp add --transport http noddy ${paired.url} --header "Authorization: Bearer ${token}"`,
			};
		},
		/** Stop or the switch: rejects pending and later calls on the server. */
		stop() {
			turnOff('stop');
		},
	};
}
