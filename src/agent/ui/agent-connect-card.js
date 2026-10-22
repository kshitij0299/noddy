/**
 * Model connect card (M4, issues #21, #69, #76). Built in the Plan-card shell
 * (flow-03: 352px, 1px border, radius-lg, space-4 padding, Meta eyebrow).
 *
 * Two steps in one card:
 *   1. Connect: Provider, Model (the provider's default), API key, "Check
 *      connection".
 *   2. Choose: once the check passes, the Model field becomes the live list of
 *      models that key can use (agent-model-list.js), with Free / Paid / Tools /
 *      Vision badges. Models that can use tools switch with no billed call (the
 *      key is already verified); a "Custom…" ID or a model whose tool support is
 *      unknown gets the same one tiny call as "Check connection" first. If the
 *      list cannot be loaded the card behaves exactly as it did before: connect
 *      with the typed model and step aside.
 *
 * The API key lives in this card's password field until "Check connection"
 * succeeds, then only in memory: the controller's, and a copy here so another
 * model can be verified while the list is shown. It is never written to
 * storage, the project, the DOM text, attributes, logs or URLs, the field is
 * cleared after a successful check, and the copy is dropped, together with the
 * list, when the provider is changed, the card is reset or disposed, or another
 * connection replaces it. The model list is held in memory for this session only.
 *
 * Focus: Check connection leaves keyboard focus on the list (the panel does not
 * pull it to the composer while the list is showing), and so does choosing a
 * model from it, so the owner can keep browsing; Tab goes on to the composer.
 */
import { MODEL_ID_PATTERN, PROVIDERS } from '../provider-config.js';
import {
	NO_FORMAT_REASON,
	NO_TOOLS_REASON,
	annotateModels,
	hasKnownFormat,
	isSelectable,
	readModelList,
	sortModels,
} from '../model-list.js';
import { cardButton, cardHeader, el, icon, srOnly } from './cards/card-shell.js';
import { createModelList } from './agent-model-list.js';

/**
 * Suggestions only: any model ID the provider accepts can be typed. The first
 * entry of each list is that provider's default model.
 */
export const MODEL_SUGGESTIONS = Object.freeze({
	openai: Object.freeze(['gpt-5', 'gpt-5-mini']),
	'opencode-zen': Object.freeze(['big-pickle', 'qwen3.8-max']),
	anthropic: Object.freeze(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']),
});

/** Check outcome → one-line copy (status is icon + text, never colour alone). */
export const CHECK_COPY = Object.freeze({
	'wrong-key': 'Key not accepted',
	'no-tools': "This model can't use tools",
	'provider-down': 'Provider not responding · try again',
	invalid: 'Enter a model ID and an API key',
	'invalid-model': 'Enter a valid model ID',
	'no-tools-listed': NO_TOOLS_REASON,
	'no-format': NO_FORMAT_REASON,
	'relay-offline': 'Noddy relay is off · drawing by hand still works',
});

/**
 * Display name for the header chip, e.g. 'gpt-5' → 'GPT-5'.
 * @param {String} model
 * @returns {String}
 */
export function modelLabel(model = '') {
	return model.replace(/^gpt/i, 'GPT');
}

/**
 * Maps a relay error code to a check outcome.
 * @param {String} [code]
 * @returns {String}
 */
export function outcomeForCode(code) {
	if (code === 'RELAY_OFFLINE') return 'relay-offline';
	if (code === 'PROVIDER_AUTH') return 'wrong-key';
	if (code === 'PROVIDER_REQUEST') return 'no-tools';
	if (code === 'INVALID_REQUEST' || code === 'UNSUPPORTED_PROTOCOL') return 'invalid';
	return 'provider-down';
}

/**
 * Relay health, then one tiny billed step through the relay (the relay
 * always offers the tools, so a model without tool calling is rejected).
 * @param {{provider: String, model: String, apiKey: String}} config
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ok: true} | {ok: false, outcome: String}>}
 */
export async function checkConnection(config, fetchImpl = globalThis.fetch) {
	try {
		const health = await fetchImpl('/api/agent/config', { method: 'GET' });
		if (!health.ok) return { ok: false, outcome: 'relay-offline' };
		await health.json();
	} catch {
		return { ok: false, outcome: 'relay-offline' };
	}
	let response;
	try {
		response = await fetchImpl('/api/agent/step', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				provider: config.provider,
				protocol: 'auto',
				model: config.model,
				apiKey: config.apiKey,
				messages: [{ role: 'user', content: 'Reply with OK.' }],
			}),
		});
	} catch {
		return { ok: false, outcome: 'relay-offline' };
	}
	if (response.ok) return { ok: true };
	let code;
	try {
		code = (await response.json())?.error?.code;
	} catch {
		return { ok: false, outcome: 'relay-offline' };
	}
	return { ok: false, outcome: outcomeForCode(code) };
}

/**
 * The key's live model list through the relay (free: nothing is billed). The
 * key travels in the POST body only, never in the URL.
 * @param {{provider: String, apiKey: String}} config
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ok: true, models: import('../model-list.js').ListedModel[]} | {ok: false}>}
 */
export async function fetchModels(config, fetchImpl = globalThis.fetch) {
	try {
		const response = await fetchImpl('/api/agent/models', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ provider: config.provider, apiKey: config.apiKey }),
			// The relay gives up after 15 s; do not leave the card locked if it never answers.
			signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(20000) : undefined,
		});
		if (!response.ok) return { ok: false };
		return { ok: true, models: readModelList(await response.json()) };
	} catch {
		return { ok: false };
	}
}

/** @param {number} n */
const modelCount = (n) => `${n} ${n === 1 ? 'model' : 'models'}`;

let cardCount = 0;

/**
 * @param {Object} options
 * @param {(config: {provider: String, model: String, apiKey: String}) => void} options.onConnected
 *   called after a successful check, and again when another model is chosen from the
 *   list; must hand the key to the controller. Receives a fresh object each time.
 * @param {(outcome: String) => void} [options.onRelayOffline] - thread bubble
 * @param {typeof checkConnection} [options.check]
 * @param {typeof fetchModels} [options.loadModels]
 */
export function createConnectCard({
	onConnected,
	onRelayOffline = () => {},
	check = checkConnection,
	loadModels = fetchModels,
}) {
	const uid = `agent-connect-${++cardCount}`;
	const root = el('form', 'agent-card agent-connect');
	root.setAttribute('aria-label', 'Connect a model');
	root.noValidate = true;

	// One compact dropdown instead of a button per provider. A native <select>
	// gives arrow keys, type-ahead, Esc and a screen-reader name for free, and
	// its list is drawn by the browser, so the panel never clips it.
	const providerRow = el('div', 'agent-connect__provider');
	const providerLabel = /** @type {HTMLLabelElement} */ (
		el('label', 'agent-connect__label text-label', 'Provider')
	);
	const providerWrap = el('div', 'agent-connect__select-wrap');
	const providerSelect = /** @type {HTMLSelectElement} */ (
		el('select', 'agent-connect__select text-body')
	);
	providerSelect.id = `${uid}-provider`;
	providerLabel.htmlFor = providerSelect.id;
	Object.entries(PROVIDERS).forEach(([value, spec]) => {
		const option = /** @type {HTMLOptionElement} */ (el('option', '', spec.label));
		option.value = value;
		providerSelect.append(option);
	});
	providerSelect.value = 'openai';
	providerSelect.addEventListener('change', () => {
		// A list and the key copy kept for it belong to one provider: leaving it drops both.
		dropSession();
		closeCustom();
		fillSuggestions(true);
		showResult(null);
		showStep();
	});
	providerWrap.append(providerSelect, icon('expand_more'));
	providerRow.append(providerLabel, providerWrap);

	const model = /** @type {HTMLInputElement} */ (el('input', 'agent-connect__input text-mono'));
	model.type = 'text';
	model.autocomplete = 'off';
	model.spellcheck = false;
	model.maxLength = 160;
	model.placeholder = 'Model';
	model.value = MODEL_SUGGESTIONS.openai[0];
	model.setAttribute('aria-label', 'Model');
	const datalist = el('datalist');
	datalist.id = `${uid}-models`;
	model.setAttribute('list', datalist.id);

	const keyRow = el('div', 'agent-connect__key');
	const key = /** @type {HTMLInputElement} */ (el('input', 'agent-connect__input'));
	key.type = 'password';
	key.autocomplete = 'off';
	key.spellcheck = false;
	key.placeholder = 'API key';
	key.setAttribute('aria-label', 'API key');
	const reveal = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-icon-button agent-connect__reveal')
	);
	reveal.type = 'button';
	reveal.setAttribute('aria-label', 'Show key');
	reveal.setAttribute('aria-pressed', 'false');
	const revealIcon = icon('visibility');
	reveal.append(revealIcon);
	reveal.addEventListener('click', () => {
		const show = key.type === 'password';
		key.type = show ? 'text' : 'password';
		reveal.setAttribute('aria-pressed', String(show));
		reveal.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
		revealIcon.textContent = show ? 'visibility_off' : 'visibility';
	});
	keyRow.append(key, reveal);

	const actions = el('div', 'agent-card__actions agent-connect__actions');
	const checkButton = /** @type {HTMLButtonElement} */ (
		cardButton({ label: 'Check connection', action: 'check', variant: 'primary' })
	);
	checkButton.type = 'submit';
	const note = el('span', 'agent-connect__note text-body-small', 'Makes one tiny billed call');
	actions.append(checkButton, note);

	// Step 2: the key's models. Hidden until a check passes and the list loads.
	const modelList = createModelList({
		onSelect: (picked) => choose(picked),
		onCustom: () => openCustom(),
	});
	const custom = el('div', 'agent-connect__custom');
	custom.hidden = true;
	const customInput = /** @type {HTMLInputElement} */ (
		el('input', 'agent-connect__input text-mono')
	);
	customInput.type = 'text';
	customInput.autocomplete = 'off';
	customInput.spellcheck = false;
	customInput.maxLength = 160;
	customInput.placeholder = 'Model ID';
	customInput.setAttribute('aria-label', 'Custom model ID');
	const customButton = /** @type {HTMLButtonElement} */ (
		cardButton({ label: 'Use', action: 'use-custom', variant: 'primary' })
	);
	customButton.type = 'submit';
	custom.append(customInput, customButton);
	customInput.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey) return;
		// Esc closes the field and returns to the list; it does not reach the panel. A
		// failure shown for the ID that was being typed goes with the field.
		event.preventDefault();
		event.stopPropagation();
		showResult(null);
		closeCustom(true);
	});
	// Not in the card until a list exists, so before connecting the card is what it always was.
	const modelsStep = el('div', 'agent-connect__models');
	modelsStep.append(modelList.root, custom);

	const result = el('div', 'agent-connect__result');
	result.setAttribute('role', 'status');

	// The right-hand meta slot ("14 models") only exists in the Choose step; cardHeader
	// builds it from non-empty text, so seed it and keep it hidden until then.
	const header = cardHeader('Connect a model', '1', 'meta');
	const title = /** @type {HTMLElement} */ (header.querySelector('.agent-card__title'));
	const count = /** @type {HTMLElement} */ (header.querySelector('.agent-card__meta'));
	count.hidden = true;

	root.append(header, providerRow, model, datalist, keyRow, actions, result);

	function provider() {
		return providerSelect.value || 'openai';
	}

	/**
	 * Verified connection while the list is shown. Holds the key in memory only,
	 * so another model can be checked; never rendered or stored.
	 * @type {{provider: String, model: String, apiKey: String, models: import('../model-list.js').ListedModel[]} | null}
	 */
	let session = null;

	/** The list step shows when the chosen provider is the one the list belongs to. */
	function inModelsStep() {
		return !!session && session.provider === provider();
	}

	function showStep() {
		const models = inModelsStep();
		model.hidden = models;
		keyRow.hidden = models;
		actions.hidden = models;
		if (models) {
			if (!modelsStep.isConnected) result.before(modelsStep);
		} else {
			modelsStep.remove();
		}
		count.hidden = !models;
		title.textContent = models ? 'Choose a model' : 'Connect a model';
		if (models) count.textContent = modelCount(session.models.length);
		else custom.hidden = true;
	}

	/**
	 * @param {Boolean} [providerChanged] - a model ID belongs to one provider,
	 *   so choosing another provider always resets the field to its default.
	 */
	function fillSuggestions(providerChanged = false) {
		const list = MODEL_SUGGESTIONS[provider()] || [];
		datalist.replaceChildren(
			...list.map((id) => {
				const option = /** @type {HTMLOptionElement} */ (el('option'));
				option.value = id;
				return option;
			})
		);
		if (providerChanged || !model.value.trim() || !list.includes(model.value.trim())) {
			model.value = list[0] || '';
		}
	}
	fillSuggestions();

	function setLocked(locked) {
		root.querySelectorAll('input, select, button').forEach((node) => {
			/** @type {HTMLInputElement | HTMLSelectElement | HTMLButtonElement} */ (node).disabled =
				locked;
		});
		modelList.setBusy(locked);
		root.toggleAttribute('aria-busy', locked);
		checkButton.classList.toggle('is-checking', locked);
		customButton.classList.toggle('is-checking', locked);
	}

	function showResult(outcome) {
		key.classList.toggle('is-invalid', outcome === 'wrong-key');
		result.replaceChildren();
		if (!outcome) return;
		const line = el('div', 'agent-connect__line');
		line.append(
			icon('error'),
			srOnly('Failed: '),
			el('span', 'text-body-small', CHECK_COPY[outcome])
		);
		if (outcome === 'no-tools') {
			const pick = /** @type {HTMLButtonElement} */ (
				cardButton({ label: 'Pick another', action: 'pick-model', variant: 'ghost' })
			);
			pick.addEventListener('click', () => {
				if (inModelsStep()) return modelList.focus();
				model.select();
				model.focus();
			});
			line.append(pick);
		}
		result.append(line);
	}

	/** A short neutral line in the status region (no icon, not an error). */
	function showProgress(text) {
		result.replaceChildren();
		if (text) result.append(el('div', 'agent-connect__line text-body-small', text));
	}

	function dropSession() {
		if (session) session.apiKey = '';
		session = null;
		modelList.clear();
	}

	// ---- Step 2: choose, or enter, another model ----
	function openCustom() {
		custom.hidden = false;
		showResult(null);
		customInput.focus();
	}

	function closeCustom(refocus = false) {
		custom.hidden = true;
		customInput.value = '';
		if (refocus) modelList.focus();
	}

	/** The model is in use: remember it, show it selected, hand it to the controller. */
	function adopt(id, { fromCustom = false } = {}) {
		let listed = session.models.find((item) => item.id === id);
		if (!listed) {
			// Typed by the user and proven by the check: first in the list, not in any price data.
			listed = { id, tools: true, vision: null, price: null, released: null, custom: true };
			session.models = [listed, ...session.models];
		} else if (listed.tools !== true) {
			// A real tool-capable call just succeeded; that outranks "unknown".
			listed.tools = true;
		}
		session.model = id;
		modelList.render(session.models, id);
		count.textContent = modelCount(session.models.length);
		// The field that had focus is gone: keep keyboard focus on the list.
		closeCustom(fromCustom);
		onConnected({ provider: session.provider, model: id, apiKey: session.apiKey });
	}

	/** One tiny billed call decides a model the catalog cannot vouch for. */
	async function verify(id, { fromCustom = false } = {}) {
		busy = true;
		showProgress('Checking…');
		setLocked(true);
		let outcome;
		try {
			const answer = await check({
				provider: session.provider,
				model: id,
				apiKey: session.apiKey,
			});
			outcome = answer.ok ? 'ok' : answer.outcome;
		} catch {
			outcome = 'provider-down';
		}
		setLocked(false);
		busy = false;
		if (outcome === 'ok') {
			showResult(null);
			adopt(id, { fromCustom });
			return;
		}
		if (outcome === 'wrong-key') {
			// The key stopped working (revoked?): the list is no use, ask for a key again.
			reset();
			showResult(outcome);
			key.focus();
			return;
		}
		if (outcome === 'relay-offline') {
			showResult(null);
			onRelayOffline(outcome);
		} else {
			showResult(outcome);
		}
		(fromCustom ? customInput : modelList).focus();
	}

	/** @param {import('../model-list.js').ListedModel} picked  already known to be selectable */
	function choose(picked) {
		if (busy || !session || picked.id === session.model) return;
		closeCustom();
		showResult(null);
		// The key is verified and the catalog says this model uses tools: no billed call.
		if (picked.tools === true) adopt(picked.id);
		else verify(picked.id);
	}

	function useCustom() {
		const id = customInput.value.trim();
		if (!MODEL_ID_PATTERN.test(id)) {
			showResult('invalid-model');
			customInput.focus();
			return;
		}
		const listed = session.models.find((item) => item.id === id);
		if (listed ? !isSelectable(listed) : !hasKnownFormat(session.provider, id)) {
			showResult(listed && listed.tools === false ? 'no-tools-listed' : 'no-format');
			customInput.focus();
			return;
		}
		if (id === session.model) return closeCustom(true);
		showResult(null);
		if (listed?.tools === true) adopt(id, { fromCustom: true });
		else verify(id, { fromCustom: true });
	}

	let busy = false;
	root.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (busy) return;
		if (inModelsStep()) return useCustom();
		const config = { provider: provider(), model: model.value.trim(), apiKey: key.value.trim() };
		if (!config.model || !config.apiKey) {
			showResult('invalid');
			(config.model ? key : model).focus();
			return;
		}
		busy = true;
		showResult(null);
		setLocked(true);
		let outcome;
		/** @type {import('../model-list.js').ListedModel[] | null} */
		let listed = null;
		try {
			const answer = await check(config);
			outcome = answer.ok ? 'ok' : answer.outcome;
		} catch {
			outcome = 'provider-down';
		}
		if (outcome === 'ok') {
			// Free, and the key is now known good: ask which models it can use. Any failure
			// here just means no list; the connection still stands.
			showProgress('Loading models…');
			try {
				const answer = await loadModels({ provider: config.provider, apiKey: config.apiKey });
				if (answer?.ok && answer.models.length) listed = answer.models;
			} catch {
				listed = null;
			}
			showResult(null);
		}
		setLocked(false);
		busy = false;
		if (outcome === 'ok') {
			key.value = '';
			dropSession();
			if (listed) {
				session = {
					provider: config.provider,
					model: config.model,
					apiKey: config.apiKey,
					models: sortModels(
						annotateModels(config.provider, listed),
						MODEL_SUGGESTIONS[config.provider] || []
					),
				};
				// The model just verified is always shown as usable, and is in the list.
				const verified = session.models.find((item) => item.id === config.model);
				if (verified) verified.tools = true;
				else {
					session.models = [
						{
							id: config.model,
							tools: true,
							vision: null,
							price: null,
							released: null,
							custom: true,
						},
						...session.models,
					];
				}
				modelList.render(session.models, config.model);
				closeCustom();
				showStep();
				// Check connection is gone: keep keyboard focus in the card unless it is already elsewhere.
				const focused = document.activeElement;
				if (!focused || focused === document.body || root.contains(focused)) modelList.focus();
			}
			// A copy: the panel blanks what it is given, and the list keeps its own key.
			onConnected({ provider: config.provider, model: config.model, apiKey: config.apiKey });
			config.apiKey = '';
			return;
		}
		if (outcome === 'relay-offline') onRelayOffline(outcome);
		else showResult(outcome);
		if (outcome === 'wrong-key') key.focus();
	});

	function reset() {
		dropSession();
		closeCustom();
		showResult(null);
		showStep();
	}

	return {
		root,
		/** True while the card shows the key's model list (the panel keeps it visible). */
		get showsModels() {
			return inModelsStep();
		},
		focus() {
			if (inModelsStep()) modelList.focus();
			else model.focus();
		},
		/** Back to the first step, forgetting the list and its key (e.g. after a disconnect). */
		reset,
		/** Clears the key field and the list's copy (e.g. when the panel is disposed). */
		clearKey() {
			key.value = '';
			reset();
		},
	};
}
