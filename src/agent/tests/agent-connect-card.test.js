import { describe, expect, it, vi } from 'vitest';
import { PROVIDERS, resolveProviderProtocol } from '../provider-config.js';
import { TOOL_DEFINITIONS } from '../tool-definitions.js';
import { validateRequest } from '../../../server/agent/validation.js';
import {
	MODEL_SUGGESTIONS,
	checkConnection,
	createConnectCard,
	modelLabel,
	outcomeForCode,
} from '../ui/agent-connect-card.js';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('checkConnection (#21)', () => {
	const config = { provider: 'openai', model: 'gpt-5', apiKey: 'sk-1' };

	it('checks relay health, then makes one tiny step call', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(json(200, {}))
			.mockResolvedValueOnce(json(200, {}));
		expect(await checkConnection(config, fetchImpl)).toEqual({ ok: true });
		expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
			'/api/agent/config',
			'/api/agent/step',
		]);
		const body = JSON.parse(fetchImpl.mock.calls[1][1].body);
		expect(body.messages).toHaveLength(1);
		expect(fetchImpl.mock.calls[1][0]).not.toContain('sk-1');
	});

	it('relay offline is distinct from provider down', async () => {
		const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await checkConnection(config, offline)).toEqual({ ok: false, outcome: 'relay-offline' });
		const down = vi
			.fn()
			.mockResolvedValueOnce(json(200, {}))
			.mockResolvedValueOnce(json(502, { error: { code: 'PROVIDER_UNAVAILABLE' } }));
		expect(await checkConnection(config, down)).toEqual({ ok: false, outcome: 'provider-down' });
	});

	it('maps wrong key and no tool calling', () => {
		expect(outcomeForCode('PROVIDER_AUTH')).toBe('wrong-key');
		expect(outcomeForCode('PROVIDER_REQUEST')).toBe('no-tools');
	});

	it('Anthropic check posts the Anthropic config, which the relay validates as Messages', async () => {
		const anthropic = { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'sk-ant-1' };
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(json(200, {}))
			.mockResolvedValueOnce(json(200, {}));
		expect(await checkConnection(anthropic, fetchImpl)).toEqual({ ok: true });
		const [url, init] = fetchImpl.mock.calls[1];
		expect(url).toBe('/api/agent/step');
		expect(url).not.toContain('sk-ant-1');
		const body = JSON.parse(init.body);
		expect(body).toMatchObject({
			provider: 'anthropic',
			protocol: 'auto',
			model: 'claude-sonnet-5-5',
			apiKey: 'sk-ant-1',
		});
		// The same body passes the relay's own validator and routes to Messages.
		expect(validateRequest(body, TOOL_DEFINITIONS)).toMatchObject({
			provider: 'anthropic',
			protocol: 'messages',
			model: 'claude-sonnet-5-5',
		});
	});

	it('labels the model chip', () => {
		expect(modelLabel('gpt-5')).toBe('GPT-5');
		expect(modelLabel('big-pickle')).toBe('big-pickle');
	});
});

describe('connect card states (#21)', () => {
	const submitWithKey = (card, value) => {
		card.root.querySelector('input[aria-label="API key"]').value = value;
		card.root.requestSubmit();
	};

	it('locks while checking and shows "Key not accepted" on a wrong key', async () => {
		let resolve;
		const check = vi.fn(() => new Promise((r) => (resolve = r)));
		const card = createConnectCard({ onConnected: vi.fn(), check });
		document.body.append(card.root);
		submitWithKey(card, 'bad-key-value');
		expect(card.root.querySelector('button[type=submit]').disabled).toBe(true);
		resolve({ ok: false, outcome: 'wrong-key' });
		await flush();
		expect(card.root.querySelector('button[type=submit]').disabled).toBe(false);
		expect(card.root.textContent).toContain('Key not accepted');
		expect(card.root.outerHTML).not.toContain('bad-key-value');
		card.root.remove();
	});

	it('no tool calling offers "Pick another"', async () => {
		const card = createConnectCard({
			onConnected: vi.fn(),
			check: async () => ({ ok: false, outcome: 'no-tools' }),
		});
		submitWithKey(card, 'k');
		await flush();
		expect(card.root.textContent).toContain("This model can't use tools");
		expect(card.root.textContent).toContain('Pick another');
	});

	it('relay offline goes to the thread, not the card', async () => {
		const onRelayOffline = vi.fn();
		const card = createConnectCard({
			onConnected: vi.fn(),
			onRelayOffline,
			check: async () => ({ ok: false, outcome: 'relay-offline' }),
		});
		submitWithKey(card, 'k');
		await flush();
		expect(onRelayOffline).toHaveBeenCalled();
		expect(card.root.textContent).not.toContain('relay');
	});

	it('the key field is a password input with no autofill', () => {
		const card = createConnectCard({ onConnected: vi.fn() });
		const key = card.root.querySelector('input[aria-label="API key"]');
		expect(key.type).toBe('password');
		expect(key.autocomplete).toBe('off');
		expect(card.root.textContent).toContain('Makes one tiny billed call');
	});
});

describe('provider dropdown (#69)', () => {
	const choose = (card, value) => {
		const select = card.root.querySelector('select');
		select.value = value;
		select.dispatchEvent(new Event('change', { bubbles: true }));
	};
	const modelInput = (card) => card.root.querySelector('input[aria-label="Model"]');

	it('offers OpenAI, OpenCode Zen and Anthropic in one labelled dropdown, not a row of buttons', () => {
		const card = createConnectCard({ onConnected: vi.fn() });
		document.body.append(card.root);
		const selects = card.root.querySelectorAll('select');
		expect(selects).toHaveLength(1);
		const select = selects[0];
		expect([...select.options].map((option) => [option.value, option.textContent])).toEqual([
			['openai', 'OpenAI'],
			['opencode-zen', 'OpenCode Zen'],
			['anthropic', 'Anthropic'],
		]);
		// Visible label, tied to the control.
		expect(select.labels).toHaveLength(1);
		expect(select.labels[0].textContent).toBe('Provider');
		expect(select.labels[0].classList.contains('agent-sr-only')).toBe(false);
		// Native keyboard behaviour: in the tab order, not disabled, not removed from it.
		expect(select.disabled).toBe(false);
		expect(select.tabIndex).toBe(0);
		// No provider pills or radios remain; the only buttons are show-key and Check.
		expect(card.root.querySelectorAll('input[type=radio], fieldset')).toHaveLength(0);
		const buttons = [...card.root.querySelectorAll('button')];
		expect(
			buttons.map((button) => button.getAttribute('aria-label') || button.textContent)
		).toEqual(['Show key', 'Check connection']);
		// The arrow is decoration only.
		expect(
			card.root
				.querySelector('.agent-connect__select-wrap .material-symbols-rounded')
				.getAttribute('aria-hidden')
		).toBe('true');
		card.root.remove();
	});

	it('lists exactly the providers the shared config supports', () => {
		const card = createConnectCard({ onConnected: vi.fn() });
		const values = [...card.root.querySelectorAll('select option')].map((option) => option.value);
		expect(values).toEqual(Object.keys(PROVIDERS));
		expect(Object.keys(MODEL_SUGGESTIONS)).toEqual(Object.keys(PROVIDERS));
	});

	it('starts on OpenAI with its default model', () => {
		const card = createConnectCard({ onConnected: vi.fn() });
		expect(card.root.querySelector('select').value).toBe('openai');
		expect(modelInput(card).value).toBe('gpt-5');
	});

	it("choosing a provider sets that provider's default model and suggestions", () => {
		const card = createConnectCard({ onConnected: vi.fn() });
		choose(card, 'anthropic');
		expect(modelInput(card).value).toBe('claude-sonnet-5-5');
		const suggestions = () =>
			[...card.root.querySelectorAll('datalist option')].map((option) => option.value);
		expect(suggestions()).toEqual(MODEL_SUGGESTIONS.anthropic);
		choose(card, 'opencode-zen');
		expect(modelInput(card).value).toBe('big-pickle');
		expect(suggestions()).toEqual(MODEL_SUGGESTIONS['opencode-zen']);
		choose(card, 'openai');
		expect(modelInput(card).value).toBe('gpt-5');
		expect(suggestions()).toEqual(MODEL_SUGGESTIONS.openai);
	});

	it('a model typed for one provider is replaced when another provider is chosen', () => {
		const card = createConnectCard({ onConnected: vi.fn() });
		modelInput(card).value = 'my-custom-model';
		choose(card, 'anthropic');
		expect(modelInput(card).value).toBe('claude-sonnet-5-5');
		// Staying on the same provider never touches what the user typed.
		modelInput(card).value = 'claude-haiku-5-5';
		choose(card, 'anthropic');
		expect(modelInput(card).value).toBe('claude-sonnet-5-5');
	});

	it('every default model resolves to an API format the provider supports', () => {
		for (const [provider, models] of Object.entries(MODEL_SUGGESTIONS)) {
			for (const model of models) {
				const protocol = resolveProviderProtocol(provider, model);
				expect(PROVIDERS[provider].protocols).toContain(protocol);
			}
		}
		expect(resolveProviderProtocol('anthropic', MODEL_SUGGESTIONS.anthropic[0])).toBe('messages');
	});

	it('hands the Anthropic choice, model and key to the check, then to onConnected', async () => {
		let seen;
		let checked;
		const check = vi.fn(async (config) => {
			// The card clears its copy once connected, so snapshot it here.
			checked = { ...config };
			return { ok: true };
		});
		const onConnected = vi.fn((config) => {
			seen = { ...config };
		});
		const card = createConnectCard({ onConnected, check });
		document.body.append(card.root);
		choose(card, 'anthropic');
		const key = card.root.querySelector('input[aria-label="API key"]');
		key.value = 'sk-ant-secret-xyz';
		card.root.requestSubmit();
		await flush();
		expect(check).toHaveBeenCalledOnce();
		expect(checked).toEqual({
			provider: 'anthropic',
			model: 'claude-sonnet-5-5',
			apiKey: 'sk-ant-secret-xyz',
		});
		expect(seen).toEqual({
			provider: 'anthropic',
			model: 'claude-sonnet-5-5',
			apiKey: 'sk-ant-secret-xyz',
		});
		// Memory only: the field is cleared and the key is nowhere in the DOM.
		expect(key.value).toBe('');
		expect(card.root.outerHTML).not.toContain('sk-ant-secret-xyz');
		expect(document.body.innerHTML).not.toContain('sk-ant-secret-xyz');
		expect(JSON.stringify({ ...localStorage })).not.toContain('sk-ant-secret-xyz');
		card.root.remove();
	});

	it('the dropdown locks while a check runs and unlocks after', async () => {
		let resolve;
		const check = vi.fn(() => new Promise((r) => (resolve = r)));
		const card = createConnectCard({ onConnected: vi.fn(), check });
		document.body.append(card.root);
		choose(card, 'anthropic');
		card.root.querySelector('input[aria-label="API key"]').value = 'k';
		card.root.requestSubmit();
		expect(card.root.querySelector('select').disabled).toBe(true);
		resolve({ ok: false, outcome: 'wrong-key' });
		await flush();
		expect(card.root.querySelector('select').disabled).toBe(false);
		expect(card.root.textContent).toContain('Key not accepted');
		// The chosen provider survives a failed check.
		expect(card.root.querySelector('select').value).toBe('anthropic');
		card.root.remove();
	});

	it('two cards on one page keep their labels and controls separate', () => {
		const first = createConnectCard({ onConnected: vi.fn() });
		const second = createConnectCard({ onConnected: vi.fn() });
		document.body.append(first.root, second.root);
		const ids = [first, second].map((card) => card.root.querySelector('select').id);
		expect(new Set(ids).size).toBe(2);
		choose(first, 'anthropic');
		expect(second.root.querySelector('select').value).toBe('openai');
		first.root.remove();
		second.root.remove();
	});
});
