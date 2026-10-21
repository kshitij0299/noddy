/**
 * Model connect card (M4, issue #21). Built in the Plan-card shell
 * (flow-03: 352px, 1px border, radius-lg, space-4 padding, Meta eyebrow).
 *
 * The API key lives in this card's password field until "Check connection"
 * succeeds, then only in the controller's memory. It is never written to
 * storage, the project, the DOM text, attributes, logs or URLs, and the
 * card clears the field after a successful check.
 */
import { PROVIDERS } from '../provider-config.js';
import { cardButton, cardHeader, el, icon, srOnly } from './cards/card-shell.js';

/** Suggestions only: any model ID the provider accepts can be typed. */
export const MODEL_SUGGESTIONS = Object.freeze({
	openai: Object.freeze(['gpt-5', 'gpt-5-mini']),
	'opencode-zen': Object.freeze(['big-pickle', 'qwen3.8-max']),
});

/** Check outcome → one-line copy (status is icon + text, never colour alone). */
export const CHECK_COPY = Object.freeze({
	'wrong-key': 'Key not accepted',
	'no-tools': "This model can't use tools",
	'provider-down': 'Provider not responding · try again',
	invalid: 'Enter a model ID and an API key',
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

let cardCount = 0;

/**
 * @param {Object} options
 * @param {(config: {provider: String, model: String, apiKey: String}) => void} options.onConnected
 *   called after a successful check; must hand the key to the controller
 * @param {(outcome: String) => void} [options.onRelayOffline] - thread bubble
 * @param {typeof checkConnection} [options.check]
 */
export function createConnectCard({
	onConnected,
	onRelayOffline = () => {},
	check = checkConnection,
}) {
	const uid = `agent-connect-${++cardCount}`;
	const root = el('form', 'agent-card agent-connect');
	root.setAttribute('aria-label', 'Connect a model');
	root.noValidate = true;

	const providers = el('fieldset', 'agent-connect__providers');
	const legend = el('legend', 'agent-sr-only', 'Provider');
	providers.append(legend);
	Object.entries(PROVIDERS).forEach(([value, spec], index) => {
		const label = el('label', 'agent-connect__segment text-label');
		const input = /** @type {HTMLInputElement} */ (el('input'));
		input.type = 'radio';
		input.name = `${uid}-provider`;
		input.value = value;
		input.checked = index === 0;
		input.addEventListener('change', () => fillSuggestions());
		label.append(input, el('span', '', spec.label));
		providers.append(label);
	});

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

	const result = el('div', 'agent-connect__result');
	result.setAttribute('role', 'status');

	root.append(
		cardHeader('Connect a model', '', 'meta'),
		providers,
		model,
		datalist,
		keyRow,
		actions,
		result
	);

	function provider() {
		const checked = /** @type {HTMLInputElement} */ (
			root.querySelector('input[type=radio]:checked')
		);
		return checked?.value || 'openai';
	}

	function fillSuggestions() {
		const list = MODEL_SUGGESTIONS[provider()] || [];
		datalist.replaceChildren(
			...list.map((id) => {
				const option = /** @type {HTMLOptionElement} */ (el('option'));
				option.value = id;
				return option;
			})
		);
		if (!model.value.trim() || !list.includes(model.value.trim())) model.value = list[0] || '';
	}
	fillSuggestions();

	function setLocked(locked) {
		root.querySelectorAll('input, button').forEach((node) => {
			/** @type {HTMLInputElement} */ (node).disabled = locked;
		});
		root.toggleAttribute('aria-busy', locked);
		checkButton.classList.toggle('is-checking', locked);
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
				model.select();
				model.focus();
			});
			line.append(pick);
		}
		result.append(line);
	}

	let checking = false;
	root.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (checking) return;
		const config = { provider: provider(), model: model.value.trim(), apiKey: key.value.trim() };
		if (!config.model || !config.apiKey) {
			showResult('invalid');
			(config.model ? key : model).focus();
			return;
		}
		checking = true;
		showResult(null);
		setLocked(true);
		let outcome;
		try {
			const answer = await check(config);
			outcome = answer.ok ? 'ok' : answer.outcome;
		} catch {
			outcome = 'provider-down';
		}
		setLocked(false);
		checking = false;
		if (outcome === 'ok') {
			key.value = '';
			onConnected(config);
			config.apiKey = '';
			return;
		}
		if (outcome === 'relay-offline') onRelayOffline(outcome);
		else showResult(outcome);
		if (outcome === 'wrong-key') key.focus();
	});

	return {
		root,
		focus() {
			model.focus();
		},
		/** Clears the key field (e.g. when the panel is disposed). */
		clearKey() {
			key.value = '';
		},
	};
}
