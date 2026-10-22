/**
 * Pure helpers for the live model list (M4, #76): what a model's badges are,
 * the order they are listed in, and the copy. No DOM, network or credentials.
 *
 * A listed model is `{id, tools, vision, price, released}` as the relay's
 * POST /api/agent/models returns it. `null` always means "not known", never
 * "no": a model missing from the catalog has no price badge and is allowed with
 * Tools "?"; only an explicit `tools: false` blocks a model.
 */

import { MODEL_ID_PATTERN, resolveProviderProtocol } from './provider-config.js';

/** One line, shown in the row itself, for a model the agent cannot use. */
export const NO_TOOLS_REASON = "Can't use tools — the agent needs them";

/** OpenCode Zen model whose API format Automatic routing does not know (or Noddy cannot speak yet). */
export const NO_FORMAT_REASON = "Noddy doesn't support this model's API format yet";

/**
 * @typedef {Object} ListedModel
 * @property {string} id
 * @property {boolean|null} tools
 * @property {boolean|null} vision
 * @property {{input: number, output: number}|null} price  USD per million tokens
 * @property {string|null} released
 * @property {boolean} [custom]  typed by the user, not in the key's list
 * @property {boolean} [unsupported]  set by `annotateModels`: no known API format for this model
 */

/**
 * A model can be chosen unless the agent cannot use it: no tool calling (an explicit
 * `false`, never merely unknown) or no API format Noddy can route to.
 */
export function isSelectable(model) {
	return model.tools !== false && !model.unsupported;
}

/** The one-line reason a model is not selectable, or '' when it is. */
export function reasonFor(model) {
	if (model.tools === false) return NO_TOOLS_REASON;
	return model.unsupported ? NO_FORMAT_REASON : '';
}

/**
 * Whether Automatic routing can send this model somewhere (OpenAI and Anthropic always
 * can; a Zen model of an unknown or unsupported family cannot, and the list has no
 * Advanced format choice). Same function the browser's connect and the relay use.
 * @param {string} provider
 * @param {string} id
 */
export function hasKnownFormat(provider, id) {
	try {
		resolveProviderProtocol(provider, id);
		return true;
	} catch {
		return false;
	}
}

/**
 * Mark the models Noddy cannot route to. Returns new objects.
 * @param {string} provider
 * @param {ListedModel[]} models
 * @returns {ListedModel[]}
 */
export function annotateModels(provider, models) {
	return models.map((model) =>
		hasKnownFormat(provider, model.id) ? { ...model } : { ...model, unsupported: true }
	);
}

/** Free = both costs are 0. */
export function isFree(model) {
	return !!model.price && model.price.input === 0 && model.price.output === 0;
}

/** Paid = a price is known and it is not both 0. Unknown price is neither. */
export function isPaid(model) {
	return !!model.price && !isFree(model);
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
 * Price (Free / Paid) and Vision are facts about the model, so every row shows them.
 * A model that cannot be chosen shows no Tools badge: its row gives the reason instead
 * (a model the agent cannot route to still says Tools when the catalog says it has them).
 * @param {ListedModel} model
 * @returns {Array<{kind: 'free'|'paid'|'tools'|'tools-unknown'|'vision', label: string, icon: string, spoken?: string}>}
 */
export function badgesFor(model) {
	const badges = [];
	if (isFree(model)) badges.push({ kind: 'free', label: 'Free', icon: 'money_off' });
	else if (isPaid(model)) badges.push({ kind: 'paid', label: 'Paid', icon: 'paid' });
	if (model.tools === true) badges.push({ kind: 'tools', label: 'Tools', icon: 'build' });
	else if (isSelectable(model)) {
		badges.push({
			kind: 'tools-unknown',
			label: 'Tools ?',
			icon: 'help',
			spoken: 'Tool support unknown',
		});
	}
	if (model.vision === true) badges.push({ kind: 'vision', label: 'Vision', icon: 'visibility' });
	return badges;
}

/**
 * Listing order: the provider's recommended models, then other tool-capable
 * models (newest first), then models whose tool support is unknown, then the
 * models that cannot use tools. Returns a new array.
 * @param {ListedModel[]} models
 * @param {readonly string[]} [recommended]  model IDs, best first
 * @returns {ListedModel[]}
 */
export function sortModels(models, recommended = []) {
	const rank = (model) => {
		if (!isSelectable(model)) return 3;
		if (recommended.includes(model.id)) return 0;
		return model.tools === true ? 1 : 2;
	};
	return [...models].sort((a, b) => {
		const byRank = rank(a) - rank(b);
		if (byRank) return byRank;
		if (rank(a) === 0) return recommended.indexOf(a.id) - recommended.indexOf(b.id);
		// Newest first; a model without a date goes after the dated ones.
		if (a.released !== b.released) {
			if (!a.released) return 1;
			if (!b.released) return -1;
			return a.released < b.released ? 1 : -1;
		}
		return a.id.localeCompare(b.id, 'en', { numeric: true });
	});
}

const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

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
		models.push({
			id,
			tools: typeof item.tools === 'boolean' ? item.tools : null,
			vision: typeof item.vision === 'boolean' ? item.vision : null,
			price:
				item.price && finiteNumber(item.price.input) && finiteNumber(item.price.output)
					? { input: item.price.input, output: item.price.output }
					: null,
			released: typeof item.released === 'string' ? item.released.slice(0, 10) : null,
		});
		if (models.length >= 500) break;
	}
	return models;
}
