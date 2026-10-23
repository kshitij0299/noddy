/**
 * Pure helpers for the live model list (M4, #76, #82): what a model's badges are, how its
 * price and end date read, and how the relay's answer is read. No DOM, network or credentials.
 *
 * A listed model is `{id, tools, vision, price, released, context, text, deprecated}` as the
 * relay's POST /api/agent/models returns it (OpenRouter adds `expires` and `varies`). `null` always
 * means "not known", never "no". Which models are offered at all, and in what order, is decided
 * in ONE place: `model-requirements.js`.
 */

import { MODEL_ID_PATTERN } from './provider-config.js';

/**
 * @typedef {Object} ListedModel
 * @property {string} id
 * @property {boolean|null} tools
 * @property {boolean|null} vision
 * @property {{input: number, output: number}|null} price  USD per million tokens
 * @property {string|null} released
 * @property {number|null} [context]  context window in tokens
 * @property {boolean|null} [text]  writes text
 * @property {boolean} [deprecated]  the catalog marks the model deprecated
 * @property {string|null} [expires]  OpenRouter only: the date the model goes away (YYYY-MM-DD)
 * @property {boolean} [varies]  OpenRouter only: the price varies (a router), so it is neither Free nor Paid
 * @property {boolean} [custom]  typed by the user, not in the key's list
 */

/** Free = both costs are 0. */
export function isFree(model) {
	return !!model.price && model.price.input === 0 && model.price.output === 0;
}

/** Paid = a price is known and it is not both 0. Unknown price is neither. */
export function isPaid(model) {
	return !!model.price && !isFree(model);
}

/** 'free', 'paid', or undefined when the price is unknown or varies. What is remembered and shown on the Connected row. */
export function tierOf(model) {
	if (isFree(model)) return 'free';
	return isPaid(model) ? 'paid' : undefined;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days from `now` until the model's end date (negative once it has ended), or null
 * when it has none. The date is read as UTC midnight at the end of that day.
 * @param {ListedModel} model
 * @param {number} now  epoch ms
 */
export function daysUntilExpiry(model, now) {
	if (!model.expires) return null;
	const end = Date.parse(`${model.expires}T23:59:59Z`);
	return Number.isFinite(end) ? Math.floor((end - now) / DAY_MS) : null;
}

/**
 * "Ends 31 Oct" for a model that goes away within `withinDays` (default 30), else ''.
 * @param {ListedModel} model
 * @param {number} now
 * @param {number} [withinDays]
 */
export function expiryNote(model, now, withinDays = 30) {
	const days = daysUntilExpiry(model, now);
	if (days === null || days > withinDays) return '';
	const [, month, day] = /^\d{4}-(\d{2})-(\d{2})/.exec(model.expires) || [];
	const name = MONTHS[Number(month) - 1];
	return name ? `Ends ${Number(day)} ${name}` : '';
}

/** @param {number} amount */
function dollars(amount) {
	return `$${Number(amount.toFixed(4))}`;
}

/**
 * Short price for a Paid model, e.g. "$3 / $15" (input / output). The unit, per
 * million tokens, is stated once above the list. Empty when not Paid.
 */
export function priceText(model) {
	return isPaid(model) ? `${dollars(model.price.input)} / ${dollars(model.price.output)}` : '';
}

/** The same price spelled out for screen readers. */
export function priceSpoken(model) {
	return isPaid(model)
		? `Input ${dollars(model.price.input)}, output ${dollars(
				model.price.output
		  )} per million tokens`
		: '';
}

/**
 * Badges, in display order. Each has an icon and text, so none depends on colour.
 * Price (Free / Paid), Tools and Vision are facts about the model. Every listed model uses
 * tools (the list only offers models that do), so the Tools badge is for the record and the
 * accessible name; a row shows only what differs from its group.
 * @param {ListedModel} model
 * @returns {Array<{kind: 'free'|'paid'|'tools'|'vision', label: string, icon: string}>}
 */
export function badgesFor(model) {
	const badges = [];
	if (isFree(model)) badges.push({ kind: 'free', label: 'Free', icon: 'money_off' });
	else if (isPaid(model)) badges.push({ kind: 'paid', label: 'Paid', icon: 'paid' });
	if (model.tools === true) badges.push({ kind: 'tools', label: 'Tools', icon: 'build' });
	if (model.vision === true) badges.push({ kind: 'vision', label: 'Vision', icon: 'visibility' });
	return badges;
}

/** Same cap as the relay's. */
const MAX_LISTED = 1000;

const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the relay's answer defensively. The browser never trusts the shape: bad
 * entries are dropped, unknown values become null, and every string is later
 * rendered as text.
 * @param {unknown} body
 * @returns {ListedModel[]}
 */
export function readModelList(body) {
	const items = body && typeof body === 'object' ? /** @type {any} */ (body).models : null;
	if (!Array.isArray(items)) return [];
	const seen = new Set();
	const models = [];
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const id = item.id;
		if (typeof id !== 'string' || !MODEL_ID_PATTERN.test(id) || seen.has(id)) continue;
		seen.add(id);
		const model = {
			id,
			tools: typeof item.tools === 'boolean' ? item.tools : null,
			vision: typeof item.vision === 'boolean' ? item.vision : null,
			price:
				item.price && finiteNumber(item.price.input) && finiteNumber(item.price.output)
					? { input: item.price.input, output: item.price.output }
					: null,
			released: typeof item.released === 'string' ? item.released.slice(0, 10) : null,
			// What the requirements in model-requirements.js judge (null = the catalog does not say).
			context:
				Number.isInteger(item.context) && item.context > 0 && item.context <= 100_000_000
					? item.context
					: null,
			text: typeof item.text === 'boolean' ? item.text : null,
			deprecated: item.deprecated === true,
		};
		// OpenRouter only.
		if (typeof item.expires === 'string' && DATE_ONLY.test(item.expires))
			model.expires = item.expires;
		if (item.varies === true) model.varies = true;
		models.push(model);
		if (models.length >= MAX_LISTED) break;
	}
	return models;
}

/**
 * OpenRouter's free-request counters from the models response: `{remaining, limit}` or null.
 * @param {unknown} body
 * @returns {{remaining: number, limit: number}|null}
 */
export function readFreeRequests(body) {
	const counter = body && typeof body === 'object' ? /** @type {any} */ (body).freeRequests : null;
	if (!counter || typeof counter !== 'object') return null;
	const whole = (value) => Number.isInteger(value) && value >= 0 && value <= 1_000_000;
	return whole(counter.remaining) && whole(counter.limit) && counter.remaining <= counter.limit
		? { remaining: counter.remaining, limit: counter.limit }
		: null;
}
