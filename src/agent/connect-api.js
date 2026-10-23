/**
 * The connect flow's two relay calls (M4, #82). No DOM and no state: each takes the key for
 * that one request, sends it in the POST body (never in a URL) and returns plain data.
 *
 * - `fetchModels`: POST /api/agent/models checks the key and lists the models it can use in one
 *   request. Nothing is billed.
 * - `checkConnection`: POST /api/agent/step with one tiny message and the agent's tools. It
 *   proves a model works (a model without tools is refused), and costs at most one small call.
 *
 * Both answer `{ok: true, ...}` or `{ok: false, error}` where `error` is a `ConnectError`
 * (connect-flow.js): the relay's code, the provider's status, a hint word and a cleaned message.
 * The relay being off is `error.offline`; a call the user cancelled is `error.aborted`.
 */
import { readFreeRequests, readModelList } from './model-list.js';

/** The relay gives up after 15 s on models; a connection check should answer well inside 100 s. */
const MODELS_TIMEOUT_MS = 20_000;
const CHECK_TIMEOUT_MS = 100_000;

/**
 * The caller's cancel signal plus a timeout.
 * @param {AbortSignal|undefined} signal
 * @param {number} ms
 */
function withTimeout(signal, ms) {
	if (typeof AbortSignal?.timeout !== 'function') return signal;
	const timeout = AbortSignal.timeout(ms);
	return signal && typeof AbortSignal.any === 'function'
		? AbortSignal.any([signal, timeout])
		: signal ?? timeout;
}

/**
 * Turn a failed response into a `ConnectError`. Only the fields the card shows are kept.
 * @param {Response} response
 * @returns {Promise<import('./connect-flow.js').ConnectError>}
 */
async function readError(response) {
	let body;
	try {
		body = await response.json();
	} catch {
		// Not the relay's JSON: whatever answered is not the relay.
		return { offline: true };
	}
	const error = body && typeof body === 'object' ? body.error : null;
	if (!error || typeof error !== 'object' || typeof error.code !== 'string') {
		return { offline: true };
	}
	return {
		code: error.code,
		...(Number.isInteger(error.status) ? { status: error.status } : {}),
		...(typeof error.hint === 'string' ? { hint: error.hint } : {}),
		...(typeof error.detail === 'string' ? { detail: error.detail } : {}),
		...(typeof error.message === 'string' ? { message: error.message } : {}),
	};
}

/**
 * @param {string} url
 * @param {object} payload
 * @param {{signal?: AbortSignal, fetchImpl?: typeof fetch, timeoutMs: number}} options
 * @returns {Promise<{ok: true, body: any} | {ok: false, error: import('./connect-flow.js').ConnectError}>}
 */
async function post(url, payload, { signal, fetchImpl = globalThis.fetch, timeoutMs }) {
	let response;
	try {
		response = await fetchImpl(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal: withTimeout(signal, timeoutMs),
		});
	} catch (error) {
		// The user pressed Back; this is not a failure to report.
		if (signal?.aborted) return { ok: false, error: { aborted: true } };
		// A timeout is the provider (or the relay) not answering; anything else is no relay.
		if (error?.name === 'TimeoutError') {
			return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', status: 408 } };
		}
		return { ok: false, error: { offline: true } };
	}
	if (!response.ok) return { ok: false, error: await readError(response) };
	try {
		return { ok: true, body: await response.json() };
	} catch {
		return { ok: false, error: { offline: true } };
	}
}

/**
 * Check the key and list the models it can use. Free: nothing is billed.
 * @param {{provider: string, apiKey: string}} config
 * @param {{signal?: AbortSignal, fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<{ok: true, models: import('./model-list.js').ListedModel[], freeRequests: {remaining: number, limit: number}|null} | {ok: false, error: import('./connect-flow.js').ConnectError}>}
 */
export async function fetchModels(config, { signal, fetchImpl } = {}) {
	const answer = await post(
		'/api/agent/models',
		{ provider: config.provider, apiKey: config.apiKey },
		{ signal, fetchImpl, timeoutMs: MODELS_TIMEOUT_MS }
	);
	if (!answer.ok) return answer;
	return {
		ok: true,
		models: readModelList(answer.body),
		freeRequests: readFreeRequests(answer.body),
	};
}

/**
 * One tiny billed step through the relay. The relay always offers the tools, so a model
 * without tool calling is rejected here, before it counts as connected.
 * @param {{provider: string, model: string, apiKey: string}} config
 * @param {{signal?: AbortSignal, fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<{ok: true} | {ok: false, error: import('./connect-flow.js').ConnectError}>}
 */
export async function checkConnection(config, { signal, fetchImpl } = {}) {
	const answer = await post(
		'/api/agent/step',
		{
			provider: config.provider,
			protocol: 'auto',
			model: config.model,
			apiKey: config.apiKey,
			purpose: 'check',
			messages: [{ role: 'user', content: 'Reply with OK.' }],
		},
		{ signal, fetchImpl, timeoutMs: CHECK_TIMEOUT_MS }
	);
	return answer.ok ? { ok: true } : answer;
}
