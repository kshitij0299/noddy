/**
 * Provider failures → the relay's public error (M4, #82).
 *
 * The browser needs enough to say what failed and how to fix it, without ever receiving the
 * key, a header or a raw provider payload (it may echo a prompt or a font). So every provider
 * error becomes `{code, message, status, hint?, detail?}`:
 *
 * - `status` is the provider's own HTTP status.
 * - `hint` is one of a few fixed words (`free-tier-only`, `data-policy`, `no-tools`) derived
 *   from the provider's text, so the card can pick a sharper message. The text itself is not sent.
 * - `detail` is the provider's `error.message` only, cleaned: key and `sk-…` / `Bearer …` text
 *   removed, one line, 200 characters at most, plain text. It is returned only for connect
 *   checks (the models route, and the step route with `purpose: "check"`), never during a run.
 */
import { RelayError } from './validation.js';

export const DETAIL_MAX_CHARS = 200;
/** How much of a failed provider response is read to find its message. */
export const ERROR_BODY_MAX_BYTES = 4096;

/**
 * One clean line of provider text, safe to show: the key (and big pieces of it), bearer
 * tokens, `sk-` style tokens, markup and control characters are removed.
 * @param {unknown} text
 * @param {string} [apiKey]
 * @returns {string|undefined}
 */
export function sanitizeDetail(text, apiKey = '') {
	if (typeof text !== 'string') return undefined;
	let out = text;
	if (apiKey) {
		out = out.split(apiKey).join('');
		// Providers also echo a masked key ("abcd1234…wxyz"): drop its recognisable ends.
		if (apiKey.length >= 12) {
			for (const part of [apiKey.slice(0, 8), apiKey.slice(-6)]) out = out.split(part).join('');
		}
	}
	out = out
		.replace(/\bBearer\s+\S+/gi, '')
		.replace(/\bsk-[^\s'"`,;)\]]*/gi, '')
		// Long opaque tokens are credentials or IDs; neither helps the reader.
		.replace(/[A-Za-z0-9_-]{32,}/g, '')
		.replace(/<[^>]*>/g, ' ')
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!out) return undefined;
	return out.length > DETAIL_MAX_CHARS ? `${out.slice(0, DETAIL_MAX_CHARS - 1).trimEnd()}…` : out;
}

/**
 * The provider's own message from a failed response. AI SDK errors carry the response body
 * text as `responseBody`; the model-list GETs attach it the same way.
 * @param {any} error
 * @returns {string|undefined}
 */
export function providerMessage(error) {
	const body = error?.responseBody;
	if (typeof body === 'string' && body) {
		try {
			const json = JSON.parse(body);
			const message =
				json?.error?.message ??
				(typeof json?.error === 'string' ? json.error : undefined) ??
				json?.message ??
				json?.detail;
			if (typeof message === 'string' && message) return message;
		} catch {
			/* Not JSON: fall through to the error's own message. */
		}
	}
	return typeof error?.message === 'string' && error.message ? error.message : undefined;
}

/**
 * A fixed word for the cases where the card can say something sharper than the status.
 * @param {number} status
 * @param {string} haystack  the provider's message and body (never returned)
 * @returns {'free-tier-only'|'data-policy'|'no-tools'|undefined}
 */
export function deriveHint(status, haystack) {
	if (status === 403 && /free[- ]?tier/i.test(haystack)) return 'free-tier-only';
	if ([400, 404, 422].includes(status)) {
		// OpenRouter: "No endpoints found matching your data policy (Free model publication)".
		if (/data policy|privacy|publication/i.test(haystack)) return 'data-policy';
		// OpenRouter: "No endpoints found that support tool use."
		if (/\btools?\b/i.test(haystack)) return 'no-tools';
	}
	return undefined;
}

/** A relay error that also carries the provider's status, a hint word and a cleaned message. */
export class ProviderRelayError extends RelayError {
	/** @type {number|undefined} */
	providerStatus;
	/** @type {'free-tier-only'|'data-policy'|'no-tools'|undefined} */
	hint;
	/** @type {string|undefined} */
	detail;
}

const SAFE_MESSAGES = Object.freeze({
	PROVIDER_AUTH: 'The provider rejected this API key.',
	PROVIDER_FORBIDDEN: 'The provider says this key cannot use that model.',
	PROVIDER_CREDITS: 'The provider account is out of credits.',
	PROVIDER_MODEL: 'The provider does not have that model for this key.',
	PROVIDER_LIMIT: 'Provider rate or credit limit reached. Check your account before retrying.',
	PROVIDER_REQUEST:
		'Provider rejected the request. Check the model ID, API format and image support.',
	PROVIDER_UNAVAILABLE: 'The provider request failed. Check the connection and retry when ready.',
});

/**
 * Never relay provider messages by default: they may echo a prompt, image, key or headers.
 * @param {any} error
 * @param {{detail?: boolean, apiKey?: string}} [options]  `detail`: this is a connect check
 * @returns {RelayError | ProviderRelayError}
 */
export function publicError(error, { detail = false, apiKey = '' } = {}) {
	if (error instanceof RelayError) return error;
	if (['AbortError', 'TimeoutError'].includes(error?.name)) {
		return new RelayError('CANCELLED', 'Agent request stopped or timed out.', 408);
	}
	const status = Number(error?.statusCode);
	/** @type {[string, number]} */
	let [code, http] = ['PROVIDER_UNAVAILABLE', 502];
	if (status === 401) [code, http] = ['PROVIDER_AUTH', 401];
	else if (status === 402) [code, http] = ['PROVIDER_CREDITS', 402];
	else if (status === 403) [code, http] = ['PROVIDER_FORBIDDEN', 403];
	else if (status === 404) [code, http] = ['PROVIDER_MODEL', 422];
	else if (status === 429) [code, http] = ['PROVIDER_LIMIT', 429];
	else if (status === 408) [code, http] = ['PROVIDER_UNAVAILABLE', 502];
	else if (status >= 400 && status < 500) [code, http] = ['PROVIDER_REQUEST', 422];
	const safe = new ProviderRelayError(code, SAFE_MESSAGES[code], http);
	if (Number.isInteger(status) && status >= 100 && status <= 599) safe.providerStatus = status;
	if (safe.providerStatus !== undefined) {
		const message = providerMessage(error) ?? '';
		const body = typeof error?.responseBody === 'string' ? error.responseBody.slice(0, 2000) : '';
		const hint = deriveHint(status, `${message} ${body}`);
		if (hint) safe.hint = hint;
		if (detail) {
			const clean = sanitizeDetail(message, apiKey);
			if (clean) safe.detail = clean;
		}
	}
	return safe;
}

/**
 * The model-list route has its own wording for provider 4xx: the step route's
 * "check the model ID" would be wrong when no model was involved.
 * @param {any} error
 * @param {{detail?: boolean, apiKey?: string}} [options]
 */
export function publicModelsError(error, options) {
	const safe = publicError(error, options);
	if (safe.code === 'PROVIDER_REQUEST') {
		safe.message =
			'The provider would not list models for this key. You can still enter a model ID.';
	}
	if (safe.code === 'PROVIDER_MODEL') {
		safe.message =
			'The provider would not list models for this key. You can still enter a model ID.';
	}
	return safe;
}

/**
 * The JSON body of an error response.
 * @param {RelayError | ProviderRelayError} safe
 */
export function errorEnvelope(safe) {
	const provider = /** @type {ProviderRelayError} */ (safe);
	return {
		code: safe.code,
		message: safe.message,
		status: provider.providerStatus ?? safe.status,
		...(provider.hint ? { hint: provider.hint } : {}),
		...(provider.detail ? { detail: provider.detail } : {}),
	};
}
