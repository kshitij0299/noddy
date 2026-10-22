import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROVIDERS, resolveProviderProtocol } from '../provider-config.js';
import { TOOL_DEFINITIONS } from '../tool-definitions.js';
import { validateRequest } from '../../../server/agent/validation.js';
import { NO_FORMAT_REASON, NO_TOOLS_REASON } from '../model-list.js';
import {
	MODEL_SUGGESTIONS,
	checkConnection,
	createConnectCard,
	fetchModels,
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

describe('live model list (#76)', () => {
	const SECRET = 'sk-live-list-secret-123';
	const model = (id, overrides = {}) => ({
		id,
		tools: true,
		vision: false,
		price: { input: 3, output: 15 },
		released: '2025-01-01',
		...overrides,
	});
	// What the relay returns for OpenAI, in the relay's own (unsorted) order.
	const OPENAI_LIST = [
		model('gpt-3.5-turbo', { tools: false }),
		model('o3', { released: '2025-04-16' }),
		model('gpt-5-mini', { released: '2025-08-07', price: { input: 0.25, output: 2 } }),
		model('gpt-5', { released: '2025-08-07', vision: true, price: { input: 1.25, output: 10 } }),
		model('gpt-new', { tools: null, vision: null, price: null, released: null }),
		model('text-embedding-3-small', { tools: false }),
	];
	const ZEN_LIST = [
		model('big-pickle', { price: { input: 0, output: 0 } }),
		model('beam-free', { price: { input: 0, output: 0 } }),
		model('gpt-6-astra', { price: { input: 10, output: 50 } }),
	];
	const choose = (card, value) => {
		const select = card.root.querySelector('select');
		select.value = value;
		select.dispatchEvent(new Event('change', { bubbles: true }));
	};
	const optionFor = (card, id) => card.root.querySelector(`[role="option"][data-id="${id}"]`);
	const optionIds = (card) =>
		[...card.root.querySelectorAll('[role="option"]')].map((o) => o.dataset.id ?? 'custom');
	const selectedId = (card) =>
		card.root.querySelector('[role="option"][aria-selected="true"]')?.dataset.id;
	const listbox = (card) => card.root.querySelector('[role="listbox"]');
	const press = (card, key) =>
		listbox(card).dispatchEvent(
			new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
		);

	/** Card connected to a provider with a list, as a user would reach it. */
	async function connected({
		provider = 'openai',
		list = OPENAI_LIST,
		check = vi.fn(async () => ({ ok: true })),
		loadModels = vi.fn(async () => ({ ok: true, models: list })),
		onConnected = vi.fn(),
		onRelayOffline = vi.fn(),
	} = {}) {
		const card = createConnectCard({ onConnected, check, loadModels, onRelayOffline });
		document.body.append(card.root);
		if (provider !== 'openai') choose(card, provider);
		card.root.querySelector('input[aria-label="API key"]').value = SECRET;
		card.root.requestSubmit();
		await flush();
		return { card, check, loadModels, onConnected, onRelayOffline };
	}

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('before connecting it is exactly the key step: default model, no list, no list request', () => {
		const loadModels = vi.fn();
		const card = createConnectCard({ onConnected: vi.fn(), loadModels });
		document.body.append(card.root);
		expect(card.root.querySelector('input[aria-label="Model"]').value).toBe('gpt-5');
		expect(card.root.querySelector('input[aria-label="Model"]').hidden).toBe(false);
		expect(card.root.querySelector('[role="listbox"]')).toBeNull();
		expect(card.showsModels).toBe(false);
		expect(card.root.textContent).toContain('Connect a model');
		expect(loadModels).not.toHaveBeenCalled();
	});

	it('after a successful check the Model field becomes the key’s models, with the verified one selected', async () => {
		const { card, loadModels, onConnected } = await connected();
		expect(loadModels).toHaveBeenCalledOnce();
		expect(loadModels.mock.calls[0][0]).toEqual({ provider: 'openai', apiKey: SECRET });
		expect(card.showsModels).toBe(true);
		expect(listbox(card)).not.toBeNull();
		// The text field, the key field and Check connection are gone; the provider dropdown stays.
		expect(card.root.querySelector('input[aria-label="Model"]').hidden).toBe(true);
		expect(card.root.querySelector('.agent-connect__key').hidden).toBe(true);
		expect(card.root.querySelector('.agent-connect__actions').hidden).toBe(true);
		const select = card.root.querySelector('select');
		expect(select.disabled).toBe(false);
		expect(select.value).toBe('openai');
		expect(card.root.textContent).toContain('Choose a model');
		expect(card.root.textContent).toContain('6 models');
		expect(selectedId(card)).toBe('gpt-5');
		// The Check button is gone, so keyboard focus moves to the list instead of the page.
		expect(document.activeElement).toBe(listbox(card));
		// The model that just passed the check is connected exactly once.
		expect(onConnected).toHaveBeenCalledOnce();
		expect(onConnected).toHaveBeenCalledWith({
			provider: 'openai',
			model: 'gpt-5',
			apiKey: SECRET,
		});
	});

	it('lists recommended first, then tool-capable newest first, unknown, then greyed models last', async () => {
		const { card } = await connected();
		expect(optionIds(card)).toEqual([
			'gpt-5',
			'gpt-5-mini',
			'o3',
			'gpt-new',
			'gpt-3.5-turbo',
			'text-embedding-3-small',
			'custom',
		]);
	});

	it('shows Free / Paid / Tools / Vision with text, "?" for unknown, and greys out non-tool models', async () => {
		const { card } = await connected({
			list: [...OPENAI_LIST, model('free-model', { price: { input: 0, output: 0 }, vision: true })],
		});
		const badgesOf = (id) =>
			[...optionFor(card, id).querySelectorAll('.agent-badge')].map((b) => [
				b.dataset.badge,
				b.querySelector('.agent-badge__label').textContent,
				b.querySelector('.material-symbols-rounded').textContent,
			]);
		// Each badge is an icon plus a text label.
		expect(badgesOf('gpt-5')).toEqual([
			['paid', 'Paid', 'paid'],
			['tools', 'Tools', 'build'],
			['vision', 'Vision', 'visibility'],
		]);
		expect(badgesOf('free-model')).toEqual([
			['free', 'Free', 'money_off'],
			['tools', 'Tools', 'build'],
			['vision', 'Vision', 'visibility'],
		]);
		expect(optionFor(card, 'gpt-new').textContent).toContain('Tools ?');
		expect(optionFor(card, 'gpt-new').querySelector('.agent-model__price')).toBeNull();
		const blocked = optionFor(card, 'gpt-3.5-turbo');
		expect(blocked.getAttribute('aria-disabled')).toBe('true');
		expect(blocked.textContent).toContain(NO_TOOLS_REASON);
	});

	it('a non-tool model cannot be chosen by click or keyboard: nothing is checked or connected', async () => {
		const { card, check, onConnected } = await connected();
		check.mockClear();
		onConnected.mockClear();
		optionFor(card, 'gpt-3.5-turbo').click();
		listbox(card).focus();
		press(card, 'End');
		press(card, 'ArrowUp');
		press(card, 'ArrowUp');
		expect(listbox(card).querySelector('.is-active').dataset.id).toBe('gpt-3.5-turbo');
		press(card, 'Enter');
		press(card, ' ');
		await flush();
		expect(check).not.toHaveBeenCalled();
		expect(onConnected).not.toHaveBeenCalled();
		expect(selectedId(card)).toBe('gpt-5');
	});

	it('choosing a model that uses tools switches with no billed call', async () => {
		const { card, check, onConnected } = await connected();
		check.mockClear();
		onConnected.mockClear();
		optionFor(card, 'o3').click();
		await flush();
		expect(check).not.toHaveBeenCalled();
		expect(onConnected).toHaveBeenCalledOnce();
		expect(onConnected).toHaveBeenCalledWith({ provider: 'openai', model: 'o3', apiKey: SECRET });
		expect(selectedId(card)).toBe('o3');
		// Choosing the model already in use does nothing.
		optionFor(card, 'o3').click();
		expect(onConnected).toHaveBeenCalledOnce();
	});

	it('works from the keyboard: arrows to a model, Enter to use it', async () => {
		const { card, onConnected } = await connected();
		onConnected.mockClear();
		listbox(card).focus();
		press(card, 'ArrowDown');
		press(card, 'Enter');
		await flush();
		expect(onConnected).toHaveBeenCalledWith({
			provider: 'openai',
			model: 'gpt-5-mini',
			apiKey: SECRET,
		});
		expect(selectedId(card)).toBe('gpt-5-mini');
	});

	it('a model whose tool support is unknown is verified with one tiny call before it is used', async () => {
		let resolve;
		const check = vi
			.fn()
			.mockResolvedValueOnce({ ok: true })
			.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
		const { card, onConnected } = await connected({ check });
		onConnected.mockClear();
		optionFor(card, 'gpt-new').click();
		// While it checks: the list ignores input and is marked busy; nothing is connected yet.
		expect(check).toHaveBeenCalledTimes(2);
		expect(check.mock.calls[1][0]).toEqual({
			provider: 'openai',
			model: 'gpt-new',
			apiKey: SECRET,
		});
		expect(listbox(card).getAttribute('aria-busy')).toBe('true');
		expect(card.root.querySelector('select').disabled).toBe(true);
		optionFor(card, 'o3').click();
		expect(check).toHaveBeenCalledTimes(2);
		expect(onConnected).not.toHaveBeenCalled();
		resolve({ ok: true });
		await flush();
		expect(onConnected).toHaveBeenCalledWith({
			provider: 'openai',
			model: 'gpt-new',
			apiKey: SECRET,
		});
		expect(selectedId(card)).toBe('gpt-new');
		expect(listbox(card).hasAttribute('aria-busy')).toBe(false);
		// The model just proven to work is now shown as using tools.
		expect(optionFor(card, 'gpt-new').textContent).not.toContain('Tools ?');
	});

	it('an unknown model that fails the check is not used and says why', async () => {
		const check = vi
			.fn()
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: false, outcome: 'no-tools' });
		const { card, onConnected } = await connected({ check });
		onConnected.mockClear();
		optionFor(card, 'gpt-new').click();
		await flush();
		expect(onConnected).not.toHaveBeenCalled();
		expect(selectedId(card)).toBe('gpt-5');
		expect(card.root.textContent).toContain("This model can't use tools");
		// "Pick another" returns to the list, not to a text field.
		const pick = [...card.root.querySelectorAll('button')].find(
			(b) => b.textContent === 'Pick another'
		);
		pick.click();
		expect(document.activeElement).toBe(listbox(card));
		// Relay offline goes to the thread, like the first check.
		const offline = vi
			.fn()
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: false, outcome: 'relay-offline' });
		const second = await connected({ check: offline });
		second.onConnected.mockClear();
		optionFor(second.card, 'gpt-new').click();
		await flush();
		expect(second.onRelayOffline).toHaveBeenCalledWith('relay-offline');
		expect(second.onConnected).not.toHaveBeenCalled();
	});

	it('a key that stops working while the list is shown sends the user back to enter one again', async () => {
		const check = vi
			.fn()
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: false, outcome: 'wrong-key' });
		const { card, onConnected } = await connected({ check });
		onConnected.mockClear();
		optionFor(card, 'gpt-new').click();
		await flush();
		expect(onConnected).not.toHaveBeenCalled();
		expect(card.showsModels).toBe(false);
		expect(card.root.textContent).toContain('Key not accepted');
		expect(card.root.querySelector('.agent-connect__key').hidden).toBe(false);
		expect(document.activeElement).toBe(card.root.querySelector('input[aria-label="API key"]'));
	});

	it('counts one model in the singular', async () => {
		const { card } = await connected({
			loadModels: vi.fn(async () => ({ ok: true, models: [model('gpt-5')] })),
		});
		expect(card.root.textContent).toContain('1 model');
		expect(card.root.textContent).not.toContain('1 models');
	});

	it('Custom… opens one field; a valid ID is verified, used and added to the list', async () => {
		const { card, check, onConnected } = await connected();
		check.mockClear();
		onConnected.mockClear();
		const custom = card.root.querySelector('.agent-connect__custom');
		expect(custom.hidden).toBe(true);
		listbox(card).focus();
		press(card, 'End');
		press(card, 'Enter');
		expect(custom.hidden).toBe(false);
		const input = card.root.querySelector('input[aria-label="Custom model ID"]');
		expect(document.activeElement).toBe(input);
		input.value = 'my-fine-tune:v2';
		card.root.requestSubmit();
		await flush();
		expect(check).toHaveBeenCalledOnce();
		expect(check.mock.calls[0][0]).toEqual({
			provider: 'openai',
			model: 'my-fine-tune:v2',
			apiKey: SECRET,
		});
		expect(onConnected).toHaveBeenCalledWith({
			provider: 'openai',
			model: 'my-fine-tune:v2',
			apiKey: SECRET,
		});
		expect(custom.hidden).toBe(true);
		expect(selectedId(card)).toBe('my-fine-tune:v2');
		expect(optionIds(card)[0]).toBe('my-fine-tune:v2');
		expect(card.root.textContent).toContain('7 models');
		// Focus is not lost to the page when the field closes.
		expect(document.activeElement).toBe(listbox(card));
	});

	it('Custom… rejects an invalid ID before any call, and refuses a listed model that cannot use tools', async () => {
		const { card, check, onConnected } = await connected();
		check.mockClear();
		onConnected.mockClear();
		card.root.querySelector('[data-custom="true"]').click();
		const input = card.root.querySelector('input[aria-label="Custom model ID"]');
		for (const bad of ['', 'has space', '-leading', 'a'.repeat(161), '<script>']) {
			input.value = bad;
			card.root.requestSubmit();
			await flush();
			expect(card.root.textContent).toContain('Enter a valid model ID');
		}
		input.value = 'gpt-3.5-turbo';
		card.root.requestSubmit();
		await flush();
		expect(card.root.textContent).toContain(NO_TOOLS_REASON);
		expect(check).not.toHaveBeenCalled();
		expect(onConnected).not.toHaveBeenCalled();
		// An ID already in the list that is known to use tools needs no billed call either.
		input.value = 'o3';
		card.root.requestSubmit();
		await flush();
		expect(check).not.toHaveBeenCalled();
		expect(onConnected).toHaveBeenCalledWith({ provider: 'openai', model: 'o3', apiKey: SECRET });
	});

	it('Esc in the custom field closes it, returns to the list and does not reach the panel', async () => {
		const { card } = await connected();
		card.root.querySelector('[data-custom="true"]').click();
		const input = card.root.querySelector('input[aria-label="Custom model ID"]');
		const outer = vi.fn();
		document.body.addEventListener('keydown', outer);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(card.root.querySelector('.agent-connect__custom').hidden).toBe(true);
		expect(document.activeElement).toBe(listbox(card));
		expect(outer).not.toHaveBeenCalled();
		document.body.removeEventListener('keydown', outer);
	});

	it('Esc in the custom field also clears a failure shown for the ID that was typed', async () => {
		const check = vi
			.fn()
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: false, outcome: 'no-tools' });
		const { card } = await connected({ check });
		card.root.querySelector('[data-custom="true"]').click();
		const input = card.root.querySelector('input[aria-label="Custom model ID"]');
		input.value = 'some-chat-model';
		card.root.requestSubmit();
		await flush();
		expect(card.root.textContent).toContain("This model can't use tools");
		expect(card.root.textContent).toContain('Pick another');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(card.root.querySelector('.agent-connect__custom').hidden).toBe(true);
		expect(card.root.textContent).not.toContain("This model can't use tools");
		expect(card.root.textContent).not.toContain('Pick another');
		expect(card.root.querySelector('.agent-connect__result').childElementCount).toBe(0);
		expect(document.activeElement).toBe(listbox(card));
		// The same goes for an ID that never reached the check.
		card.root.querySelector('[data-custom="true"]').click();
		input.value = 'has space';
		card.root.requestSubmit();
		await flush();
		expect(card.root.textContent).toContain('Enter a valid model ID');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(card.root.textContent).not.toContain('Enter a valid model ID');
	});

	it('the key is never in the DOM, attributes, storage or any URL while the list is shown', async () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const check = vi.fn(async () => ({ ok: true }));
		const { card } = await connected({ check });
		optionFor(card, 'gpt-new').click();
		await flush();
		card.root.querySelector('[data-custom="true"]').click();
		const input = card.root.querySelector('input[aria-label="Custom model ID"]');
		input.value = 'typed-model';
		card.root.requestSubmit();
		await flush();
		expect(card.root.querySelector('input[aria-label="API key"]').value).toBe('');
		expect(document.body.innerHTML).not.toContain(SECRET);
		expect(card.root.outerHTML).not.toContain(SECRET);
		expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(SECRET);
		expect(setItem).not.toHaveBeenCalled();
		setItem.mockRestore();
	});

	it('if the list cannot be loaded the card behaves as before: connected, no list', async () => {
		for (const loadModels of [
			vi.fn(async () => ({ ok: false })),
			vi.fn(async () => ({ ok: true, models: [] })),
			vi.fn(async () => {
				throw new Error('boom');
			}),
		]) {
			const { card, onConnected } = await connected({ loadModels });
			expect(card.showsModels).toBe(false);
			expect(listbox(card)).toBeNull();
			expect(onConnected).toHaveBeenCalledOnce();
			expect(onConnected.mock.calls[0][0].model).toBe('gpt-5');
			expect(card.root.querySelector('input[aria-label="Model"]').hidden).toBe(false);
			card.root.remove();
		}
	});

	it('a failed check never asks for the list', async () => {
		const loadModels = vi.fn();
		const { card } = await connected({
			check: vi.fn(async () => ({ ok: false, outcome: 'wrong-key' })),
			loadModels,
		});
		expect(loadModels).not.toHaveBeenCalled();
		expect(card.showsModels).toBe(false);
		expect(card.root.textContent).toContain('Key not accepted');
	});

	it('Zen: free models show Free, and a model Noddy cannot route to is greyed out with its own reason', async () => {
		const { card } = await connected({ provider: 'opencode-zen', list: ZEN_LIST });
		expect(optionIds(card)).toEqual(['big-pickle', 'gpt-6-astra', 'beam-free', 'custom']);
		expect(
			[...optionFor(card, 'big-pickle').querySelectorAll('.agent-badge')].map(
				(b) => b.dataset.badge
			)
		).toEqual(['free', 'tools']);
		const blocked = optionFor(card, 'beam-free');
		expect(blocked.getAttribute('aria-disabled')).toBe('true');
		expect(blocked.textContent).toContain(NO_FORMAT_REASON);
		blocked.click();
		// A custom ID of an unknown Zen family gets the same answer, with no billed call.
		card.root.querySelector('[data-custom="true"]').click();
		const input = card.root.querySelector('input[aria-label="Custom model ID"]');
		input.value = 'mystery-model';
		card.root.requestSubmit();
		await flush();
		expect(card.root.textContent).toContain(NO_FORMAT_REASON);
	});

	it('the provider dropdown stays; another provider drops the list and goes back to its own key step', async () => {
		const { card, onConnected } = await connected();
		choose(card, 'anthropic');
		expect(card.showsModels).toBe(false);
		expect(listbox(card)).toBeNull();
		// The rows themselves are gone, not just hidden.
		expect(card.root.querySelectorAll('[role="option"]')).toHaveLength(0);
		expect(card.root.querySelector('input[aria-label="Model"]').hidden).toBe(false);
		expect(card.root.querySelector('input[aria-label="Model"]').value).toBe('claude-sonnet-5-5');
		expect(card.root.querySelector('.agent-connect__key').hidden).toBe(false);
		expect(card.root.textContent).toContain('Connect a model');
		// Back to the first provider: its list was dropped with the change, so it asks for the key again.
		choose(card, 'openai');
		expect(card.showsModels).toBe(false);
		expect(listbox(card)).toBeNull();
		expect(card.root.querySelector('input[aria-label="Model"]').value).toBe('gpt-5');
		expect(card.root.querySelector('input[aria-label="API key"]').value).toBe('');
		card.root.requestSubmit();
		await flush();
		expect(card.root.textContent).toContain('Enter a model ID and an API key');
		// The connection the first check made was never touched.
		expect(onConnected).toHaveBeenCalledOnce();
	});

	it('changing provider forgets the key copy: nothing can be verified with it any more', async () => {
		const { card, check } = await connected();
		check.mockClear();
		choose(card, 'anthropic');
		choose(card, 'openai');
		// No list, no Custom… and no billed call with the first key.
		expect(card.root.querySelector('[data-custom="true"]')).toBeNull();
		card.root.requestSubmit();
		await flush();
		expect(check).not.toHaveBeenCalled();
		expect(document.body.innerHTML).not.toContain(SECRET);
	});

	it('changing provider while Custom… is open closes it', async () => {
		const { card } = await connected();
		card.root.querySelector('[data-custom="true"]').click();
		const custom = card.root.querySelector('.agent-connect__custom');
		const input = card.root.querySelector('input[aria-label="Custom model ID"]');
		input.value = 'half-typed';
		expect(custom.hidden).toBe(false);
		choose(card, 'anthropic');
		expect(custom.hidden).toBe(true);
		expect(input.value).toBe('');
	});

	it('connecting another provider replaces the list and forgets the first key', async () => {
		const loadModels = vi.fn(async ({ provider }) => ({
			ok: true,
			models:
				provider === 'anthropic'
					? [model('claude-sonnet-5-5'), model('claude-old', { tools: false })]
					: OPENAI_LIST,
		}));
		const check = vi.fn(async () => ({ ok: true }));
		const { card, onConnected } = await connected({ check, loadModels });
		choose(card, 'anthropic');
		card.root.querySelector('input[aria-label="API key"]').value = 'sk-ant-second';
		card.root.requestSubmit();
		await flush();
		expect(loadModels).toHaveBeenLastCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-second' });
		expect(optionIds(card)).toEqual(['claude-sonnet-5-5', 'claude-old', 'custom']);
		expect(onConnected).toHaveBeenLastCalledWith({
			provider: 'anthropic',
			model: 'claude-sonnet-5-5',
			apiKey: 'sk-ant-second',
		});
		// Leaving a provider drops its list and key copy, however it got there.
		choose(card, 'openai');
		expect(card.showsModels).toBe(false);
		expect(card.root.querySelectorAll('[role="option"]')).toHaveLength(0);
		check.mockClear();
		choose(card, 'anthropic');
		expect(card.showsModels).toBe(false);
		expect(card.root.querySelector('[data-custom="true"]')).toBeNull();
		card.root.requestSubmit();
		await flush();
		expect(check).not.toHaveBeenCalled();
		expect(document.body.innerHTML).not.toContain('sk-ant-second');
		expect(document.body.innerHTML).not.toContain(SECRET);
	});

	it('a failed check for another provider leaves the first connection alone', async () => {
		const check = vi
			.fn()
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: false, outcome: 'wrong-key' });
		const { card, onConnected } = await connected({ check });
		choose(card, 'anthropic');
		card.root.querySelector('input[aria-label="API key"]').value = 'bad-key';
		card.root.requestSubmit();
		await flush();
		expect(card.root.textContent).toContain('Key not accepted');
		expect(card.showsModels).toBe(false);
		// No new connection was made, so the controller still holds the first one.
		expect(onConnected).toHaveBeenCalledOnce();
	});

	it('reset and clearKey drop the list and its key copy and return to the key step', async () => {
		const { card, check } = await connected();
		card.reset();
		expect(card.showsModels).toBe(false);
		expect(listbox(card)).toBeNull();
		expect(card.root.querySelector('input[aria-label="Model"]').hidden).toBe(false);
		const again = await connected();
		again.card.clearKey();
		expect(again.card.showsModels).toBe(false);
		expect(again.card.root.querySelector('input[aria-label="API key"]').value).toBe('');
		expect(check).toHaveBeenCalledOnce();
	});

	it('every list and check dependency is injectable, so no test needs the network', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		await connected();
		expect(fetchSpy).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});

describe('fetchModels (#76)', () => {
	const config = { provider: 'anthropic', apiKey: 'sk-ant-list-secret' };

	it('posts the provider and key in the body to the relay, never in the URL', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			json(200, {
				provider: 'anthropic',
				catalog: 'live',
				models: [
					{
						id: 'claude-sonnet-5-5',
						tools: true,
						vision: true,
						price: { input: 3, output: 15 },
						released: '2026-03',
					},
				],
			})
		);
		const answer = await fetchModels(config, fetchImpl);
		expect(answer).toEqual({
			ok: true,
			models: [
				{
					id: 'claude-sonnet-5-5',
					tools: true,
					vision: true,
					price: { input: 3, output: 15 },
					released: '2026-03',
				},
			],
		});
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('/api/agent/models');
		expect(url).not.toContain('sk-ant');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ provider: 'anthropic', apiKey: config.apiKey });
		expect(init.headers['Content-Type']).toBe('application/json');
	});

	it('a relay error, a network failure or unreadable data is simply "no list"', async () => {
		expect(
			await fetchModels(
				config,
				vi.fn().mockResolvedValue(json(401, { error: { code: 'PROVIDER_AUTH' } }))
			)
		).toEqual({ ok: false });
		expect(
			await fetchModels(config, vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
		).toEqual({ ok: false });
		expect(
			await fetchModels(
				config,
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => {
						throw new Error('bad json');
					},
				})
			)
		).toEqual({ ok: false });
		expect(
			await fetchModels(config, vi.fn().mockResolvedValue(json(200, { models: 'x' })))
		).toEqual({
			ok: true,
			models: [],
		});
	});
});
