/**
 * What a model must be able to do to run Noddy's agent (M4, #82).
 *
 * This is the ONE place that says which models the connect flow offers. The model list shows
 * only models that meet every REQUIRED capability, so nobody picks a model that cannot draw.
 * A feature that needs more from the model raises it here (for example `minContextTokens` for
 * long runs, or `vision: true` moving from recommended to required once the agent checks its
 * own renders) and the list, its count line and its tests follow.
 *
 * REQUIRED (a model without one is not listed):
 * - `tools`        tool / function calling: the agent edits glyphs only through tools.
 * - `textOutput`   the model writes text (not an image, music or embedding model).
 * - `minContextTokens`  a context window of at least this many tokens, when the catalog says.
 * - `notDeprecated`     not marked deprecated by the catalog, and not past its end date.
 * - `knownApiFormat`    Noddy can speak the model's API format (some OpenCode Zen families,
 *                       Gemini and Jev, use formats not built yet).
 *
 * RECOMMENDED (a badge, and the model sorts higher; never required):
 * - `vision`       image input, for reference images and the agent checking its own renders.
 *
 * UNKNOWN: when the catalog has no data on tool support (`tools: null`), the model is hidden.
 * It stays reachable through the "Model ID" entry, and the one tiny tool-enabled test message
 * that every connection runs decides whether it works. A model the catalog knows nothing about
 * is never offered as if it were known to work.
 *
 * Pure data and functions: no DOM, network or credentials. The relay supplies the facts
 * (`tools`, `vision`, `price`, `context`, `text`, `deprecated`, `expires`) as a model list entry.
 */
import { resolveProviderProtocol } from './provider-config.js';

export const MODEL_REQUIREMENTS = Object.freeze({
	required: Object.freeze({
		tools: true,
		textOutput: true,
		minContextTokens: 32_000,
		notDeprecated: true,
		knownApiFormat: true,
	}),
	recommended: Object.freeze({
		vision: true,
	}),
});

/**
 * @typedef {Object} RequirementFacts  what the relay knows about one listed model
 * @property {string} id
 * @property {boolean|null} [tools]
 * @property {boolean|null} [vision]
 * @property {{input: number, output: number}|null} [price]
 * @property {number|null} [context]  context window in tokens
 * @property {boolean|null} [text]  writes text
 * @property {boolean} [deprecated]
 * @property {string|null} [expires]  end date, YYYY-MM-DD
 */

/** The ways a model can fail a requirement, in the order they are checked. */
export const REQUIREMENT_FAILURES = Object.freeze([
	'deprecated',
	'no-tools',
	'no-text',
	'small-context',
	'unknown-format',
]);

/**
 * Whether Noddy can route this model to an API format it speaks. OpenAI, Anthropic and
 * OpenRouter always can; a Zen model of an unknown or unsupported family cannot. The same
 * function the relay uses when it sends the model.
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

/** True once the model's end date has passed (the date is read as the end of that UTC day). */
function hasEnded(model, now) {
	if (!model.expires) return false;
	const end = Date.parse(`${model.expires}T23:59:59Z`);
	return Number.isFinite(end) && end < now;
}

/**
 * @typedef {Object} Assessment
 * @property {'supported'|'unsupported'|'unknown'} status
 *   supported: meets every requirement. unsupported: fails at least one (see `failed`).
 *   unknown: fails none, but tool support is not known, so it is hidden and tested on demand.
 * @property {string[]} failed  the failures from `REQUIREMENT_FAILURES`, empty unless unsupported
 * @property {{vision: boolean}} recommended  which recommended capabilities the model has
 */

/**
 * Judge one model against the requirements.
 * @param {RequirementFacts} model
 * @param {Object} [options]
 * @param {string} [options.provider]  checks the API format when given
 * @param {number} [options.now]  epoch ms, for end dates
 * @returns {Assessment}
 */
export function assessModel(model, { provider, now = Date.now() } = {}) {
	const { required } = MODEL_REQUIREMENTS;
	const failed = [];
	if (required.notDeprecated && (model.deprecated === true || hasEnded(model, now))) {
		failed.push('deprecated');
	}
	if (required.tools && model.tools === false) failed.push('no-tools');
	if (required.textOutput && model.text === false) failed.push('no-text');
	// "When known": a model with no context figure is not turned away for it.
	if (
		required.minContextTokens &&
		typeof model.context === 'number' &&
		model.context < required.minContextTokens
	) {
		failed.push('small-context');
	}
	if (required.knownApiFormat && provider && !hasKnownFormat(provider, model.id)) {
		failed.push('unknown-format');
	}
	const recommended = { vision: model.vision === true };
	if (failed.length) return { status: 'unsupported', failed, recommended };
	if (required.tools && model.tools !== true) {
		return { status: 'unknown', failed, recommended };
	}
	return { status: 'supported', failed, recommended };
}

/**
 * Whether the model meets every requirement.
 * @param {RequirementFacts} model
 * @param {{provider?: string, now?: number}} [options]
 */
export const isSupported = (model, options) => assessModel(model, options).status === 'supported';

/** Free = both costs are 0. */
const isFree = (model) => !!model.price && model.price.input === 0 && model.price.output === 0;

/**
 * The listing order: Free and supported first, then Paid and supported. Inside each group
 * models with Vision come first, then the larger context window (unknown last), then the name.
 * Returns new arrays and drops every model that is not supported.
 * @template {RequirementFacts} T
 * @param {T[]} models
 * @param {{provider?: string, now?: number}} [options]
 * @returns {{free: T[], paid: T[]}}
 */
export function listSupported(models, options = {}) {
	const now = options.now ?? Date.now();
	const supported = models.filter((model) => isSupported(model, { ...options, now }));
	const rank = (a, b) =>
		Number(b.vision === true) - Number(a.vision === true) ||
		(b.context ?? -1) - (a.context ?? -1) ||
		a.id.localeCompare(b.id, 'en', { numeric: true });
	return {
		free: supported.filter(isFree).sort(rank),
		paid: supported.filter((model) => !isFree(model)).sort(rank),
	};
}

/** How many of these models are supported (the number in "Showing 42 models …"). */
export function countSupported(models, options) {
	return models.filter((model) => isSupported(model, options)).length;
}
