/**
 * Pure logic of the stepped connect flow (M4, #82): what is remembered, how the model list
 * is grouped, searched and pre-selected, and what every failure says. No DOM, no network, no
 * credentials, so the card (ui/agent-connect-card.js) stays a thin layer over it.
 *
 * The flow is three steps, one decision each: Provider, API key, Model. Only the provider and
 * model are ever remembered (never the key); everything else lives in memory for the tab.
 */
import { MODEL_ID_PATTERN, PROVIDERS } from './provider-config.js';
import { daysUntilExpiry, isFree } from './model-list.js';
import { hasKnownFormat, listSupported } from './model-requirements.js';

/** localStorage key for `{provider, model, tier}`. The key is never stored. */
export const CONNECTION_STORAGE_KEY = 'noddy.agent.connection';

/** The search field appears once the list is longer than this. */
export const SEARCH_THRESHOLD = 12;

/** A model that ends within this many days is never pre-selected. */
export const PRESELECT_SKIP_DAYS = 14;

/** Provider keys in the order of the first step. */
export const PROVIDER_ORDER = Object.freeze(Object.keys(PROVIDERS));

/** @param {unknown} provider */
export const isProvider = (provider) =>
	typeof provider === 'string' && Object.hasOwn(PROVIDERS, provider);

// ---- Remembering the provider and model (never the key) ----------------------------------------

/** @returns {Storage|null} */
export function defaultStorage() {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/**
 * What was connected last, or null. Anything unknown, malformed or hostile is ignored.
 * @param {Storage|null} [storage]
 * @returns {{provider: string, model: string, tier?: 'free'|'paid'}|null}
 */
export function readRemembered(storage = defaultStorage()) {
	try {
		const raw = storage?.getItem(CONNECTION_STORAGE_KEY);
		if (!raw) return null;
		const value = JSON.parse(raw);
		if (!value || typeof value !== 'object') return null;
		const { provider, model, tier } = value;
		if (!isProvider(provider) || typeof model !== 'string' || !MODEL_ID_PATTERN.test(model)) {
			return null;
		}
		return { provider, model, ...(tier === 'free' || tier === 'paid' ? { tier } : {}) };
	} catch {
		return null;
	}
}

/**
 * Remember the provider and model. The object is rebuilt field by field, so nothing else
 * (a key that slipped into the argument) can ever reach storage.
 * @param {{provider: string, model: string, tier?: string}} connection
 * @param {Storage|null} [storage]
 */
export function remember({ provider, model, tier }, storage = defaultStorage()) {
	try {
		if (!isProvider(provider) || !MODEL_ID_PATTERN.test(model)) return;
		storage?.setItem(
			CONNECTION_STORAGE_KEY,
			JSON.stringify({ provider, model, ...(tier === 'free' || tier === 'paid' ? { tier } : {}) })
		);
	} catch {
		/* Private window or blocked storage: the flow works without memory. */
	}
}

/** @param {Storage|null} [storage] */
export function forget(storage = defaultStorage()) {
	try {
		storage?.removeItem(CONNECTION_STORAGE_KEY);
	} catch {
		/* Nothing to forget. */
	}
}

// ---- The key field ----------------------------------------------------------------------------

/**
 * What was pasted → the key to send. Surrounding whitespace and one pair of matching quotes
 * are removed; nothing inside the key is ever changed, so it is never turned into a different key.
 * @param {string} text
 */
export function normalizeKey(text) {
	let key = String(text ?? '').trim();
	const quote = key[0];
	if (key.length >= 2 && '\'"`'.includes(quote) && key.at(-1) === quote) {
		key = key.slice(1, -1).trim();
	}
	return key;
}

// ---- The model list ---------------------------------------------------------------------------

export const GROUP_LABELS = Object.freeze({ free: 'Free', paid: 'Paid' });

/**
 * Live search across both groups: each word must appear in the model ID.
 * @template {{id: string}} T
 * @param {T[]} models
 * @param {string} text
 * @returns {T[]}
 */
export function filterModels(models, text) {
	const words = String(text ?? '')
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
	if (!words.length) return models;
	return models.filter((model) => {
		const id = model.id.toLowerCase();
		return words.every((word) => id.includes(word));
	});
}

/**
 * The list's groups in display order, empty ones left out. Only models that meet the app's
 * requirements (`model-requirements.js`) are in them: Free first, then Paid, ordered
 * Vision, then context window, then name. Nothing is greyed out; a model that cannot run
 * the agent is simply not offered.
 * @param {import('./model-list.js').ListedModel[]} models
 * @param {{provider?: string, now?: number, text?: string}} [options]  `text` searches the model IDs
 * @returns {Array<{id: 'free'|'paid', label: string, models: import('./model-list.js').ListedModel[]}>}
 */
export function groupModels(models, { provider, now = Date.now(), text = '' } = {}) {
	const { free, paid } = listSupported(models, { provider, now });
	return /** @type {const} */ ([
		['free', free],
		['paid', paid],
	])
		.map(([id, group]) => ({ id, label: GROUP_LABELS[id], models: filterModels(group, text) }))
		.filter((group) => group.models.length);
}

/**
 * The model to start on: the first model of the first group, skipping one that ends within
 * two weeks. '' when nothing can be chosen.
 * @param {ReturnType<typeof groupModels>} groups
 * @param {number} now
 */
export function preselect(groups, now) {
	for (const group of groups) {
		const pick = group.models.find((model) => {
			const days = daysUntilExpiry(model, now);
			return !(days !== null && days <= PRESELECT_SKIP_DAYS);
		});
		if (pick) return pick.id;
	}
	return '';
}

export const NO_FORMAT_COPY = "Noddy doesn't support this model's API format yet — pick another.";

/**
 * A typed model ID: accepted when the relay would accept it and Noddy can speak its format.
 * It need not be in the list: the one tiny test message decides whether it works.
 * @param {string} provider
 * @param {string} text
 * @returns {{ok: true, id: string} | {ok: false, reason: 'empty'|'invalid'|'format'}}
 */
export function checkTypedModel(provider, text) {
	const id = String(text ?? '').trim();
	if (!id) return { ok: false, reason: 'empty' };
	if (!MODEL_ID_PATTERN.test(id)) return { ok: false, reason: 'invalid' };
	if (!hasKnownFormat(provider, id)) return { ok: false, reason: 'format' };
	return { ok: true, id };
}

/**
 * The quiet line under the list: how many models it shows and why only those.
 * @param {number} shown  models matching the search
 * @param {number} total  models that work with Noddy's tools
 */
export function countLine(shown, total) {
	const what = total === 1 ? 'model that works' : 'models that work';
	return shown === total
		? `Showing ${total} ${what} with Noddy’s tools.`
		: `Showing ${shown} of ${total} ${what} with Noddy’s tools.`;
}

/**
 * Why a key has nothing to list, and where to go. Shown with the "Model ID" field.
 * @param {string} provider
 * @param {number} listed  models the key returned (all of them unsupported or unknown)
 */
export function noSupportedNote(provider, listed) {
	if (provider === 'openrouter') {
		return 'OpenRouter lists no models that work with Noddy’s tools right now. Type a model ID to try one.';
	}
	const what = listed
		? `None of this key’s ${listed} ${
				listed === 1 ? 'model works' : 'models work'
		  } with Noddy’s tools.`
		: 'This key lists no models.';
	return `${what} OpenRouter has free models that do. Or type a model ID.`;
}

/**
 * The line above the primary on Step 3: what choosing this model means. Empty when the
 * price is not known.
 * @param {string} provider
 * @param {import('./model-list.js').ListedModel|undefined} model
 */
export function captionFor(provider, model) {
	if (!model?.price) return '';
	const label = PROVIDERS[provider]?.label ?? 'your provider';
	return isFree(model)
		? 'Free models may keep what you send.'
		: `Paid models bill your ${label} account.`;
}

/**
 * The note under the Free heading (OpenRouter only).
 * @param {string} provider
 * @param {{remaining: number, limit: number}|null} counters
 */
export function freeCaption(provider, counters) {
	if (provider !== 'openrouter') return '';
	return counters
		? `${counters.remaining} of ${counters.limit} free requests left today.`
		: 'Free models: 20 requests a minute, 50 a day.';
}

// ---- Failures that explain and offer a fix -----------------------------------------------------

/** Relay error codes → the provider status they stand for when the relay sent none. */
const STATUS_FOR_CODE = Object.freeze({
	PROVIDER_AUTH: 401,
	PROVIDER_CREDITS: 402,
	PROVIDER_FORBIDDEN: 403,
	PROVIDER_MODEL: 404,
	PROVIDER_REQUEST: 400,
	PROVIDER_LIMIT: 429,
	PROVIDER_UNAVAILABLE: 502,
	CANCELLED: 408,
	BUSY: 429,
});

export const RELAY_OFF_COPY = "Noddy relay is off · drawing by hand still works";

/**
 * @typedef {Object} ConnectError
 * @property {string} [code]  the relay's error code
 * @property {number} [status]  the provider's HTTP status
 * @property {string} [hint]  'free-tier-only' | 'data-policy' | 'no-tools'
 * @property {string} [detail]  the provider's cleaned message (connect checks only)
 * @property {string} [message]
 * @property {boolean} [offline]  the relay could not be reached
 */

/**
 * @typedef {Object} ErrorView
 * @property {string} kind  auth | credits | free-tier | forbidden | data-policy | no-tools | model | request | limit | unavailable | offline | local
 * @property {string} text  `{status} · {what happened} — {what to do}`
 * @property {Array<{label: string, href: string}>} links  "Add credits ↗", "Open settings ↗"
 * @property {Array<[string, string]>} details  label/value rows of the Details disclosure
 * @property {'key'|'list'} focus  where focus returns
 * @property {boolean} reenterKey  the fix is a different key (Step 2)
 */

/**
 * What one failure says on screen: status, plain words, the fix, and the Details rows. Never
 * the key: a `ctx.key` is only compared with the provider's usual prefix, never echoed.
 * @param {ConnectError} error
 * @param {{provider?: string, key?: string}} [ctx]
 * @returns {ErrorView}
 */
export function describeError(error = {}, { provider = '', key = '' } = {}) {
	const spec = PROVIDERS[provider];
	const label = spec?.label ?? 'Your provider';
	if (error.offline) {
		return view('offline', RELAY_OFF_COPY, { focus: 'key' });
	}
	const code = error.code ?? '';
	const status = Number.isInteger(error.status) ? error.status : STATUS_FOR_CODE[code];
	const lead = status ? `${status} · ` : '';
	const details = detailRows(error, status, spec);

	switch (code) {
		case 'PROVIDER_AUTH': {
			let text = `${lead}Key not accepted — check you copied the whole key.`;
			if (spec?.keyPrefix && key && !key.startsWith(spec.keyPrefix)) {
				text += ` ${label} keys start with ${spec.keyPrefix}.`;
			}
			return view('auth', text, { details, focus: 'key', reenterKey: true });
		}
		case 'PROVIDER_CREDITS':
			return view('credits', `${lead}Out of credits — add credits, or pick a free model.`, {
				details,
				links: spec?.billingUrl ? [{ label: 'Add credits', href: spec.billingUrl }] : [],
			});
		case 'PROVIDER_FORBIDDEN':
			if (error.hint === 'free-tier-only') {
				return view(
					'free-tier',
					`${lead}OpenCode only offers its free models inside OpenCode — pick a paid Zen model, or go back and use OpenRouter.`,
					{ details }
				);
			}
			return view('forbidden', `${lead}This key can't use that model — pick another.`, { details });
		case 'PROVIDER_MODEL':
			if (error.hint === 'data-policy') {
				return view(
					'data-policy',
					`${lead}Your ${label} privacy settings block this free model — allow free models there, or pick another.`,
					{
						details,
						links:
							provider === 'openrouter'
								? [{ label: 'Open settings', href: 'https://openrouter.ai/settings/privacy' }]
								: [],
					}
				);
			}
			if (error.hint === 'no-tools') {
				return view('no-tools', `${lead}This model can't use tools — pick another.`, { details });
			}
			return view('model', `${lead}Model not found — it may have been removed. Pick another.`, {
				details,
			});
		case 'PROVIDER_REQUEST':
			if (error.hint === 'no-tools') {
				return view('no-tools', `${lead}This model can't use tools — pick another.`, { details });
			}
			return view('request', `${lead}${label} rejected the test message — pick another model.`, {
				details,
			});
		case 'PROVIDER_LIMIT':
		case 'BUSY':
			return view('limit', `${lead}Rate limited — try another free model or wait a minute.`, {
				details,
			});
		case 'UNSUPPORTED_PROTOCOL':
		case 'PROTOCOL_REQUIRED':
			return view('request', "Noddy doesn't support this model's API format yet — pick another.", {
				details,
			});
		case 'PROVIDER_UNAVAILABLE':
		case 'CANCELLED':
			return view(
				'unavailable',
				`${lead}${label} isn't responding — try again, or pick another model.`,
				{ details }
			);
		default:
			return view(
				'unavailable',
				`${lead}${label} isn't responding — try again, or pick another model.`,
				{
					details,
				}
			);
	}
}

/** @returns {ErrorView} */
function view(kind, text, { details = [], links = [], focus = 'list', reenterKey = false } = {}) {
	return { kind, text, links, details, focus, reenterKey };
}

/** Status, host and the provider's own (cleaned) message, for the Details disclosure. */
function detailRows(error, status, spec) {
	/** @type {Array<[string, string]>} */
	const rows = [];
	if (status) rows.push(['Status', String(status)]);
	if (spec?.host) rows.push(['From', spec.host]);
	if (error.detail) rows.push(['Message', `"${error.detail}"`]);
	return rows;
}

/**
 * An error from a run in the thread → its view, or null for errors that are not the provider's.
 * @param {{code?: string, status?: number, hint?: string, message?: string}} error
 * @param {string} provider
 */
export function describeRunError(error, provider) {
	if (
		!error?.code ||
		!/^PROVIDER_/.test(error.code) ||
		!Object.hasOwn(STATUS_FOR_CODE, error.code)
	) {
		return null;
	}
	return describeError(error, { provider });
}
