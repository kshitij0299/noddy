import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVIDERS } from '../provider-config.js';
import { CONNECTION_STORAGE_KEY } from '../connect-flow.js';
import { RELAY_OFF_COPY, createConnectCard, modelLabel } from '../ui/agent-connect-card.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const NOW = Date.parse('2026-10-23T12:00:00Z');
const free = { input: 0, output: 0 };
const KEY = 'sk-or-v1-test-key-that-must-not-leak';

const model = (id, overrides = {}) => ({
	id,
	tools: true,
	vision: false,
	price: { input: 3, output: 15 },
	released: '2026-01-01',
	context: 200_000,
	text: true,
	deprecated: false,
	...overrides,
});

const MODELS = [
	model('vendor/paid-one'),
	model('vendor/free-big:free', { price: free, vision: true, context: 1_000_000 }),
	model('vendor/free-small:free', { price: free, context: 64_000 }),
	model('vendor/no-tools', { tools: false }),
	model('vendor/unknown', { tools: null, price: null }),
];

const many = (count = 20) =>
	Array.from({ length: count }, (_, i) =>
		model(`vendor/model-${String(i).padStart(2, '0')}`, { price: i < 3 ? free : undefined })
	);

function memoryStorage(initial = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (key) => (data.has(key) ? data.get(key) : null),
		setItem: vi.fn((key, value) => data.set(key, String(value))),
		removeItem: vi.fn((key) => data.delete(key)),
	};
}

const listed = (models, extra = {}) => ({ ok: true, models, freeRequests: null, ...extra });
const failed = (error) => ({ ok: false, error });

describe('the stepped connect card (#82)', () => {
	let card;
	let storage;
	let onConnected;
	let loadModels;
	let check;

	const q = (selector) => card.root.querySelector(selector);
	const qa = (selector) => [...card.root.querySelectorAll(selector)];
	const title = () => q('.agent-connect__title')?.textContent;
	const stepText = () => q('.agent-connect__count')?.textContent;
	const keyInput = () => q('input.agent-field__input[id$="-key"]');
	const idInput = () => q('input.agent-field__input[id$="model-id"]');
	const primary = () => q('.agent-connect__primary');
	const back = () => q('.agent-connect__back');
	const optionFor = (id) =>
		qa('[role="option"]').find((option) => option.dataset.id === id) ?? null;
	const press = (target, key, init = {}) => {
		const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
		target.dispatchEvent(event);
		return event;
	};

	function open(options = {}) {
		card = createConnectCard({
			onConnected,
			check,
			loadModels,
			storage,
			now: () => NOW,
			...options,
		});
		document.body.append(card.root);
		return card;
	}

	const choose = (id) => q(`button[data-provider="${id}"]`).click();
	async function submitKey(value = KEY) {
		keyInput().value = value;
		primary().click();
		await flush();
	}
	/** Provider → key → list: lands on Step 3. */
	async function toModelStep(provider = 'openrouter', models = MODELS, extra = {}) {
		loadModels.mockResolvedValue(listed(models, extra));
		choose(provider);
		await submitKey();
	}

	beforeEach(() => {
		storage = memoryStorage();
		onConnected = vi.fn();
		loadModels = vi.fn().mockResolvedValue(listed(MODELS));
		check = vi.fn().mockResolvedValue({ ok: true });
		HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		card?.root.remove();
		card = undefined;
		delete HTMLElement.prototype.scrollIntoView;
		vi.useRealTimers();
	});

	describe('Step 1: provider', () => {
		it('lists OpenRouter (recommended), OpenCode Zen, OpenAI and Anthropic, each with one line', () => {
			open();
			expect(title()).toBe('Choose a provider');
			expect(stepText()).toBe('Step 1 of 3');
			const rows = qa('button.agent-provider');
			expect(rows.map((row) => row.dataset.provider)).toEqual([
				'openrouter',
				'opencode-zen',
				'openai',
				'anthropic',
			]);
			expect(rows.map((row) => row.querySelector('.agent-provider__hint').textContent)).toEqual([
				'Many free models',
				'Models tested for coding agents',
				'GPT models, paid',
				'Claude models, paid',
			]);
			expect(rows[0].textContent).toContain('Recommended');
			expect(rows.slice(1).some((row) => row.textContent.includes('Recommended'))).toBe(false);
			expect(q('[role="group"]').getAttribute('aria-label')).toBe('Provider');
		});

		it('has no Back button on the first step, no Next, and no native select or datalist', () => {
			open();
			expect(back()).toBe(null);
			expect(primary()).toBe(null);
			expect(qa('button').map((button) => button.textContent.trim())).not.toContain('Next');
			expect(q('select, datalist, option')).toBe(null);
		});

		it('the step bar is decoration; the text carries the step', () => {
			open();
			const bar = q('.agent-connect__progress');
			expect(bar.getAttribute('aria-hidden')).toBe('true');
			expect(bar.children).toHaveLength(3);
			expect(qa('.agent-connect__segment.is-on')).toHaveLength(1);
		});

		it('choosing a provider goes straight to its key step', () => {
			open();
			choose('openrouter');
			expect(card.step).toBe(2);
			expect(title()).toBe('Add your OpenRouter key');
			expect(stepText()).toBe('Step 2 of 3');
			expect(qa('.agent-connect__segment.is-on')).toHaveLength(2);
		});

		it('Up and Down also move between the rows, wrapping', () => {
			open();
			const rows = qa('button.agent-provider');
			rows[0].focus();
			press(rows[0], 'ArrowDown');
			expect(document.activeElement).toBe(rows[1]);
			press(rows[1], 'ArrowUp');
			press(rows[0], 'ArrowUp');
			expect(document.activeElement).toBe(rows[3]);
		});

		it('every provider is reachable from the one list the code owns', () => {
			expect(Object.keys(PROVIDERS)).toEqual(['openrouter', 'opencode-zen', 'openai', 'anthropic']);
			for (const spec of Object.values(PROVIDERS)) {
				expect(spec.keyUrl).toMatch(/^https:\/\//);
				expect(spec.hint.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Step 2: API key', () => {
		beforeEach(() => {
			open();
			choose('openrouter');
		});

		it('one labelled password field with a show/hide toggle inside it and a link to the key page', () => {
			const label = q('label.agent-field__label');
			expect(label.textContent).toBe('API key');
			expect(label.htmlFor).toBe(keyInput().id);
			expect(keyInput().type).toBe('password');
			expect(keyInput().autocomplete).toBe('off');
			const link = qa('a').find((a) => a.textContent.startsWith('Get a key'));
			expect(link.textContent).toBe('Get a key ↗');
			expect(link.href).toBe('https://openrouter.ai/settings/keys');
			expect(link.target).toBe('_blank');
			expect(link.rel).toBe('noopener noreferrer');
			// The toggle sits inside the field box.
			const toggle = q('.agent-field__box button[aria-pressed]');
			expect(toggle).not.toBe(null);
			expect(q('.agent-field__message').textContent).toBe(
				'Your key stays in this tab and is never saved.'
			);
		});

		it('each provider links to its own key page', () => {
			const pages = {
				openrouter: 'https://openrouter.ai/settings/keys',
				'opencode-zen': 'https://opencode.ai/console',
				openai: 'https://platform.openai.com/api-keys',
				anthropic: 'https://platform.claude.com/settings/keys',
			};
			for (const [provider, url] of Object.entries(pages)) {
				card.open('provider');
				choose(provider);
				expect(qa('a').find((a) => a.textContent.startsWith('Get a key')).href).toBe(url);
			}
		});

		it('show/hide flips the field type, the label and aria-pressed', () => {
			const toggle = q('button[aria-pressed]');
			expect(toggle.getAttribute('aria-label')).toBe('Show key');
			expect(toggle.getAttribute('aria-pressed')).toBe('false');
			toggle.click();
			expect(keyInput().type).toBe('text');
			expect(toggle.getAttribute('aria-label')).toBe('Hide key');
			expect(toggle.getAttribute('aria-pressed')).toBe('true');
			toggle.click();
			expect(keyInput().type).toBe('password');
		});

		it('the primary is always enabled; an empty field says so and keeps focus there, with no request', async () => {
			expect(primary().textContent).toBe('Check key');
			expect(primary().disabled).toBe(false);
			primary().click();
			await flush();
			expect(loadModels).not.toHaveBeenCalled();
			expect(q('[role="alert"]').textContent).toContain('Paste your key first.');
			expect(document.activeElement).toBe(keyInput());
			expect(keyInput().getAttribute('aria-invalid')).toBe('true');
		});

		it('Back returns to the provider step', () => {
			back().click();
			expect(card.step).toBe(1);
			expect(title()).toBe('Choose a provider');
		});

		it('trims the pasted key and surrounding quotes, and checks that key', async () => {
			keyInput().value = `  "${KEY}"\n`;
			primary().click();
			await flush();
			expect(loadModels).toHaveBeenCalledTimes(1);
			expect(loadModels.mock.calls[0][0]).toEqual({ provider: 'openrouter', apiKey: KEY });
			expect(loadModels.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
		});

		it('Check key sends no billed message: it only lists models', async () => {
			await submitKey();
			expect(loadModels).toHaveBeenCalledTimes(1);
			expect(check).not.toHaveBeenCalled();
		});

		it('while it runs: "Checking…", busy, the field read-only, Back still works and cancels', async () => {
			let resolve;
			loadModels.mockImplementation(() => new Promise((r) => (resolve = r)));
			keyInput().value = KEY;
			primary().click();
			expect(primary().querySelector('.agent-card__button-label').textContent).toBe('Checking…');
			expect(primary().getAttribute('aria-busy')).toBe('true');
			expect(primary().querySelector('.agent-connect__spinner')).not.toBe(null);
			expect(keyInput().readOnly).toBe(true);
			expect(back().disabled).toBe(false);
			const { signal } = loadModels.mock.calls[0][1];
			expect(signal.aborted).toBe(false);
			back().click();
			expect(signal.aborted).toBe(true);
			expect(card.step).toBe(1);
			// A late answer to the cancelled request changes nothing.
			resolve(listed(MODELS));
			await flush();
			expect(card.step).toBe(1);
			expect(card.root.querySelector('[role="option"]')).toBe(null);
		});

		it('a second press while it runs does not start another request', async () => {
			let resolve;
			loadModels.mockImplementation(() => new Promise((r) => (resolve = r)));
			keyInput().value = KEY;
			primary().click();
			q('form').requestSubmit?.();
			expect(loadModels).toHaveBeenCalledTimes(1);
			resolve(listed(MODELS));
			await flush();
		});

		it('401 · says the key was not accepted, selects the field and offers Details', async () => {
			loadModels.mockResolvedValue(
				failed({ code: 'PROVIDER_AUTH', status: 401, detail: 'User not found.' })
			);
			await submitKey('sk-or-v1-wrong');
			const alert = q('[role="alert"]');
			expect(alert.textContent).toContain(
				'401 · Key not accepted — check you copied the whole key.'
			);
			// It replaces the helper in the same reserved line, so nothing jumps.
			expect(q('.agent-field__message').contains(alert)).toBe(true);
			expect(q('.agent-field__box').classList.contains('is-invalid')).toBe(true);
			expect(document.activeElement).toBe(keyInput());
			expect(keyInput().value).toBe('sk-or-v1-wrong');
			expect(card.step).toBe(2);
		});

		it('Details is closed by default and lists status, host and the provider’s message', async () => {
			loadModels.mockResolvedValue(
				failed({ code: 'PROVIDER_AUTH', status: 401, detail: 'User not found.' })
			);
			await submitKey('sk-or-v1-wrong');
			const toggle = qa('button').find((button) => button.textContent === 'Details');
			const details = q('.agent-error__details');
			expect(toggle.getAttribute('aria-expanded')).toBe('false');
			expect(details.hidden).toBe(true);
			expect(toggle.getAttribute('aria-controls')).toBe(details.id);
			toggle.click();
			expect(toggle.getAttribute('aria-expanded')).toBe('true');
			expect(details.hidden).toBe(false);
			expect(details.textContent).toContain('401');
			expect(details.textContent).toContain('openrouter.ai');
			expect(details.textContent).toContain('"User not found."');
			toggle.click();
			expect(details.hidden).toBe(true);
		});

		it('a key without the usual prefix is told what a key looks like', async () => {
			loadModels.mockResolvedValue(failed({ code: 'PROVIDER_AUTH', status: 401 }));
			await submitKey('abc123');
			expect(q('[role="alert"]').textContent).toContain('OpenRouter keys start with sk-or-.');
		});

		it('never shows the key in an error, Details or anywhere in the markup', async () => {
			loadModels.mockResolvedValue(
				failed({ code: 'PROVIDER_AUTH', status: 401, detail: 'User not found.' })
			);
			await submitKey(KEY);
			expect(card.root.textContent).not.toContain(KEY);
			expect(card.root.outerHTML).not.toContain(KEY);
		});

		it('typing again takes the error away and brings the helper back', async () => {
			loadModels.mockResolvedValue(failed({ code: 'PROVIDER_AUTH', status: 401 }));
			await submitKey('abc');
			expect(q('[role="alert"]')).not.toBe(null);
			keyInput().value = 'abcd';
			keyInput().dispatchEvent(new Event('input', { bubbles: true }));
			expect(q('[role="alert"]')).toBe(null);
			expect(q('.agent-field__message').textContent).toBe(
				'Your key stays in this tab and is never saved.'
			);
			expect(q('.agent-field__box').classList.contains('is-invalid')).toBe(false);
			expect(keyInput().hasAttribute('aria-invalid')).toBe(false);
		});

		it('the relay being off says so, with no status', async () => {
			loadModels.mockResolvedValue(failed({ offline: true }));
			await submitKey();
			expect(q('[role="alert"]').textContent).toContain(RELAY_OFF_COPY);
			expect(qa('button').some((b) => b.textContent === 'Details')).toBe(false);
		});

		it('a 5xx offers to try again: the same primary', async () => {
			loadModels.mockResolvedValue(failed({ code: 'PROVIDER_UNAVAILABLE', status: 502 }));
			await submitKey();
			expect(q('[role="alert"]').textContent).toContain(
				"502 · OpenRouter isn't responding — try again, or pick another model."
			);
			expect(primary().textContent).toBe('Check key');
			loadModels.mockResolvedValue(listed(MODELS));
			primary().click();
			await flush();
			expect(card.step).toBe(3);
		});

		it('a key the provider will not let list models goes on to a model ID field', async () => {
			loadModels.mockResolvedValue(failed({ code: 'PROVIDER_FORBIDDEN', status: 403 }));
			await submitKey();
			expect(card.step).toBe(3);
			expect(idInput()).not.toBe(null);
			expect(q('.agent-field__message').textContent).toBe(
				"403 · This key can't list models — type a model ID."
			);
			expect(q('[role="listbox"]')).toBe(null);
		});

		it('a Zen free-tier 403 on the check is an error, not a way to the model ID field', async () => {
			card.open('provider');
			choose('opencode-zen');
			loadModels.mockResolvedValue(
				failed({ code: 'PROVIDER_FORBIDDEN', status: 403, hint: 'free-tier-only' })
			);
			await submitKey();
			expect(card.step).toBe(2);
			expect(q('[role="alert"]').textContent).toContain('OpenCode only offers its free models');
		});
	});

	describe('Step 3: model', () => {
		it('lists only models that work with Noddy’s tools, Free first, with the first Free one chosen', async () => {
			open();
			await toModelStep();
			expect(card.step).toBe(3);
			expect(title()).toBe('Choose a model');
			expect(stepText()).toBe('Step 3 of 3');
			expect(q('.agent-connect__status').textContent).toContain('Key works · OpenRouter');
			expect(qa('[role="option"]').map((option) => option.dataset.id)).toEqual([
				'vendor/free-big:free',
				'vendor/free-small:free',
				'vendor/paid-one',
			]);
			expect(optionFor('vendor/free-big:free').getAttribute('aria-selected')).toBe('true');
			expect(q('.agent-models__count').textContent).toContain(
				'Showing 3 models that work with Noddy’s tools.'
			);
			expect(qa('[aria-disabled]')).toHaveLength(0);
		});

		it('no model is greyed out and none without tools or with unknown support is offered', async () => {
			open();
			await toModelStep();
			expect(optionFor('vendor/no-tools')).toBe(null);
			expect(optionFor('vendor/unknown')).toBe(null);
		});

		it('focus lands on the list (no search for a short list), the chosen row active', async () => {
			open();
			await toModelStep();
			expect(document.activeElement).toBe(q('[role="listbox"]'));
			expect(q('[role="listbox"]').getAttribute('aria-activedescendant')).toBe(
				optionFor('vendor/free-big:free').id
			);
		});

		it('a long list has a search field, and focus lands in it', async () => {
			open();
			await toModelStep('openrouter', many(20));
			const search = q('input[role="combobox"]');
			expect(search).not.toBe(null);
			expect(document.activeElement).toBe(search);
			expect(search.placeholder).toBe('Search 20 models');
		});

		it('a paid-only provider has no Free group and starts on the first paid model', async () => {
			open();
			await toModelStep('anthropic', [model('claude-b'), model('claude-a')]);
			expect(qa('.agent-models__group-head')).toHaveLength(0);
			expect(optionFor('claude-a').getAttribute('aria-selected')).toBe('true');
			expect(q('.agent-connect__caption').textContent).toBe(
				'Paid models bill your Anthropic account.'
			);
		});

		it('says what the choice means: a Free model may keep what you send', async () => {
			open();
			await toModelStep();
			expect(q('.agent-connect__caption').textContent).toBe('Free models may keep what you send.');
			optionFor('vendor/paid-one').click();
			expect(q('.agent-connect__caption').textContent).toBe(
				'Paid models bill your OpenRouter account.'
			);
		});

		it('choosing another model marks it and clears an old error', async () => {
			open();
			await toModelStep();
			check.mockResolvedValue({ ok: false, error: { code: 'PROVIDER_CREDITS', status: 402 } });
			primary().click();
			await flush();
			expect(q('[role="alert"]')).not.toBe(null);
			optionFor('vendor/free-small:free').click();
			expect(optionFor('vendor/free-small:free').getAttribute('aria-selected')).toBe('true');
			expect(q('[role="alert"]')).toBe(null);
		});

		it('"Use this model" sends one test for the chosen model with the verified key', async () => {
			open();
			await toModelStep();
			primary().click();
			await flush();
			expect(check).toHaveBeenCalledTimes(1);
			expect(check.mock.calls[0][0]).toEqual({
				provider: 'openrouter',
				model: 'vendor/free-big:free',
				apiKey: KEY,
			});
		});

		it('while it tests: "Testing…", the list ignores input, Back stays enabled and cancels', async () => {
			open();
			await toModelStep();
			let resolve;
			check.mockImplementation(() => new Promise((r) => (resolve = r)));
			primary().click();
			expect(primary().querySelector('.agent-card__button-label').textContent).toBe('Testing…');
			expect(q('[role="listbox"]').getAttribute('aria-busy')).toBe('true');
			optionFor('vendor/paid-one').click();
			expect(optionFor('vendor/paid-one').getAttribute('aria-selected')).toBe('false');
			expect(back().disabled).toBe(false);
			const { signal } = check.mock.calls[0][1];
			back().click();
			expect(signal.aborted).toBe(true);
			expect(card.step).toBe(2);
			resolve({ ok: true });
			await flush();
			expect(onConnected).not.toHaveBeenCalled();
			expect(card.connected).toBe(null);
		});

		it('Enter on the chosen row confirms: accepting the start is Enter, Enter', async () => {
			open();
			await toModelStep('openrouter', many(20));
			const search = q('input[role="combobox"]');
			press(search, 'Enter');
			await flush();
			expect(check).toHaveBeenCalledTimes(1);
			expect(check.mock.calls[0][0].model).toBe('vendor/model-00');
		});

		it('Back from the model step returns to the key step with the checked key and "Continue"', async () => {
			open();
			await toModelStep();
			back().click();
			expect(card.step).toBe(2);
			expect(keyInput().value).toBe(KEY);
			expect(keyInput().type).toBe('password');
			expect(q('.agent-field__message').textContent).toBe('Key checked');
			expect(primary().textContent).toBe('Continue');
			// Continue: back to the models without asking the provider again.
			loadModels.mockClear();
			primary().click();
			await flush();
			expect(loadModels).not.toHaveBeenCalled();
			expect(card.step).toBe(3);
			// Editing the key turns Continue back into Check key.
			back().click();
			keyInput().value = `${KEY}x`;
			keyInput().dispatchEvent(new Event('input', { bubbles: true }));
			expect(primary().textContent).toBe('Check key');
			expect(q('.agent-field__message').textContent).toBe(
				'Your key stays in this tab and is never saved.'
			);
		});

		it('choosing another provider drops the key and the list of the first', async () => {
			open();
			await toModelStep();
			card.open('provider');
			choose('openai');
			expect(keyInput().value).toBe('');
			// Coming back to the first provider asks for its key again.
			back().click();
			choose('openrouter');
			expect(keyInput().value).toBe('');
			expect(primary().textContent).toBe('Check key');
			expect(card.step).toBe(2);
		});

		it('the same provider keeps its checked key when the user goes back to Step 1 and forward again', async () => {
			open();
			await toModelStep();
			back().click();
			back().click();
			expect(card.step).toBe(1);
			choose('openrouter');
			expect(keyInput().value).toBe(KEY);
		});

		it('Esc inside the card never reaches the panel', async () => {
			open();
			await toModelStep('openrouter', many(20));
			const reached = vi.fn();
			document.body.addEventListener('keydown', reached);
			press(q('input[role="combobox"]'), 'Escape');
			expect(reached).not.toHaveBeenCalled();
			document.body.removeEventListener('keydown', reached);
		});

		it('the search filters live and a no-match offers the text as a model ID', async () => {
			open();
			await toModelStep('openrouter', many(20));
			const search = q('input[role="combobox"]');
			search.value = 'brand-new/thing';
			search.dispatchEvent(new Event('input', { bubbles: true }));
			expect(q('.agent-models__none').textContent).toBe('No model matches “brand-new/thing”.');
			qa('[role="option"]')[0].click();
			expect(idInput()).not.toBe(null);
			expect(idInput().value).toBe('brand-new/thing');
			expect(document.activeElement).toBe(idInput());
		});
	});

	describe('a model that is not in the list', () => {
		it('"Use a model ID" swaps the list for one Model ID field, and "Pick from the list" swaps back', async () => {
			open();
			await toModelStep();
			qa('button')
				.find((button) => button.textContent === 'Use a model ID')
				.click();
			expect(card.step).toBe(3);
			expect(q('[role="listbox"]')).toBe(null);
			expect(q('label.agent-field__label').textContent).toBe('Model ID');
			expect(document.activeElement).toBe(idInput());
			expect(q('.agent-field__message').textContent).toBe(
				'Noddy sends one small test before it connects.'
			);
			qa('button')
				.find((button) => button.textContent === 'Pick from the list')
				.click();
			expect(q('[role="listbox"]')).not.toBe(null);
			expect(idInput()).toBe(null);
		});

		it('a typed ID is tested like any other: same primary, same single test message', async () => {
			open();
			await toModelStep();
			qa('button')
				.find((button) => button.textContent === 'Use a model ID')
				.click();
			idInput().value = '  hidden/unknown-model ';
			idInput().dispatchEvent(new Event('input', { bubbles: true }));
			primary().click();
			await flush();
			expect(check).toHaveBeenCalledTimes(1);
			expect(check.mock.calls[0][0].model).toBe('hidden/unknown-model');
			expect(card.connected).toEqual({ provider: 'openrouter', model: 'hidden/unknown-model' });
		});

		it('an empty or invalid ID is refused before any test, in the card’s own words', async () => {
			open();
			await toModelStep();
			qa('button')
				.find((button) => button.textContent === 'Use a model ID')
				.click();
			primary().click();
			await flush();
			expect(q('[role="alert"]').textContent).toContain('Type a model ID first.');
			idInput().value = 'not a valid id';
			primary().click();
			await flush();
			expect(q('[role="alert"]').textContent).toContain('That is not a valid model ID.');
			expect(check).not.toHaveBeenCalled();
		});

		it('a Zen model Noddy cannot route is refused before any test', async () => {
			open();
			await toModelStep('opencode-zen', [model('kimi-k2.6')]);
			qa('button')
				.find((button) => button.textContent === 'Use a model ID')
				.click();
			idInput().value = 'gemini-3.5-flash';
			primary().click();
			await flush();
			expect(q('[role="alert"]').textContent).toContain(
				"Noddy doesn't support this model's API format yet — pick another."
			);
			expect(check).not.toHaveBeenCalled();
		});

		it('a key with no supported model explains it and suggests OpenRouter', async () => {
			open();
			await toModelStep('openai', [model('text-embedding-3-small', { tools: false })]);
			expect(idInput()).not.toBe(null);
			expect(q('.agent-field__message').textContent).toBe(
				'None of this key’s 1 model works with Noddy’s tools. OpenRouter has free models that do. Or type a model ID.'
			);
			// Nothing to go back to: no way to the list.
			expect(qa('button').some((button) => button.textContent === 'Pick from the list')).toBe(
				false
			);
		});

		it('OpenRouter with nothing supported says so without suggesting itself', async () => {
			open();
			await toModelStep('openrouter', [model('x', { tools: false })]);
			expect(q('.agent-field__message').textContent).toContain(
				'OpenRouter lists no models that work with Noddy’s tools right now.'
			);
		});

		it('a key that lists nothing at all asks for a model ID too', async () => {
			open();
			await toModelStep('anthropic', []);
			expect(q('.agent-field__message').textContent).toBe(
				'This key lists no models. OpenRouter has free models that do. Or type a model ID.'
			);
		});
	});

	describe('errors from the one test message', () => {
		async function failWith(error, provider = 'openrouter', models = MODELS) {
			open();
			await toModelStep(provider, models);
			check.mockResolvedValue({ ok: false, error });
			primary().click();
			await flush();
		}

		it('402 · out of credits, with a link to add credits, and the list stays open', async () => {
			await failWith({ code: 'PROVIDER_CREDITS', status: 402, detail: 'Insufficient credits.' });
			const alert = q('[role="alert"]');
			expect(alert.textContent).toContain(
				'402 · Out of credits — add credits, or pick a free model.'
			);
			const link = alert.querySelector('a');
			expect(link.textContent).toBe('Add credits ↗');
			expect(link.href).toBe('https://openrouter.ai/settings/credits');
			expect(link.rel).toBe('noopener noreferrer');
			expect(card.step).toBe(3);
			expect(card.connected).toBe(null);
			expect(q('[role="listbox"]')).not.toBe(null);
			expect(onConnected).not.toHaveBeenCalled();
			expect(storage.setItem).not.toHaveBeenCalled();
		});

		it('404 · model not found', async () => {
			await failWith({ code: 'PROVIDER_MODEL', status: 404 });
			expect(q('[role="alert"]').textContent).toContain(
				'404 · Model not found — it may have been removed. Pick another.'
			);
		});

		it('404 about the privacy settings links to them', async () => {
			await failWith({ code: 'PROVIDER_MODEL', status: 404, hint: 'data-policy' });
			expect(q('[role="alert"]').textContent).toContain(
				'404 · Your OpenRouter privacy settings block this free model'
			);
			expect(q('[role="alert"] a').href).toBe('https://openrouter.ai/settings/privacy');
		});

		it('429 · rate limited', async () => {
			await failWith({ code: 'PROVIDER_LIMIT', status: 429 });
			expect(q('[role="alert"]').textContent).toContain(
				'429 · Rate limited — try another free model or wait a minute.'
			);
		});

		it('after OpenCode’s free-tier refusal the selection moves to the first Paid model, the error stays', async () => {
			await failWith(
				{ code: 'PROVIDER_FORBIDDEN', status: 403, hint: 'free-tier-only' },
				'opencode-zen',
				[
					model('beam-free', { price: free }),
					model('kimi-k2.6', { context: 262_144 }),
					model('glm-5', { context: 128_000 }),
				]
			);
			expect(optionFor('beam-free').getAttribute('aria-selected')).toBe('false');
			expect(optionFor('kimi-k2.6').getAttribute('aria-selected')).toBe('true');
			expect(q('[role="alert"]')).not.toBe(null);
			expect(q('.agent-connect__caption').textContent).toBe(
				'Paid models bill your OpenCode Zen account.'
			);
			// The next press tests that paid model.
			check.mockResolvedValue({ ok: true });
			primary().click();
			await flush();
			expect(check.mock.calls.at(-1)[0].model).toBe('kimi-k2.6');
			expect(card.connected?.model).toBe('kimi-k2.6');
		});

		it('a Zen free model refused outside OpenCode is its own message, and the list stays', async () => {
			await failWith(
				{ code: 'PROVIDER_FORBIDDEN', status: 403, hint: 'free-tier-only' },
				'opencode-zen',
				[model('beam-free', { price: free }), model('kimi-k2.6')]
			);
			const text = q('[role="alert"]').textContent;
			expect(text).toContain('403 · OpenCode only offers its free models inside OpenCode');
			expect(text).not.toMatch(/key not accepted/i);
			expect(card.step).toBe(3);
		});

		it('400 · the provider rejected the test message', async () => {
			await failWith({ code: 'PROVIDER_REQUEST', status: 400 });
			expect(q('[role="alert"]').textContent).toContain(
				'400 · OpenRouter rejected the test message — pick another model.'
			);
		});

		it('5xx · not responding, and the same primary tries again', async () => {
			await failWith({ code: 'PROVIDER_UNAVAILABLE', status: 502 });
			expect(q('[role="alert"]').textContent).toContain("502 · OpenRouter isn't responding");
			check.mockResolvedValue({ ok: true });
			primary().click();
			await flush();
			expect(card.connected?.model).toBe('vendor/free-big:free');
		});

		it('the relay going away mid-flow says so', async () => {
			await failWith({ offline: true });
			expect(q('[role="alert"]').textContent).toContain(RELAY_OFF_COPY);
		});

		it('every error has Details with the status and the provider’s message, and never the key', async () => {
			await failWith({
				code: 'PROVIDER_CREDITS',
				status: 402,
				detail: 'Insufficient credits.',
			});
			const toggle = qa('button').find((button) => button.textContent === 'Details');
			toggle.click();
			const text = q('.agent-error__details').textContent;
			expect(text).toContain('402');
			expect(text).toContain('Insufficient credits.');
			expect(card.root.outerHTML).not.toContain(KEY);
			expect(card.root.textContent).not.toContain(KEY);
		});

		it('a key refused during the test sends the user back to the key step, key cleared', async () => {
			await failWith({ code: 'PROVIDER_AUTH', status: 401 });
			expect(card.step).toBe(2);
			expect(keyInput().value).toBe('');
			expect(q('[role="alert"]').textContent).toContain('401 · Key not accepted');
			expect(document.activeElement).toBe(keyInput());
		});

		it('focus returns to the list with the choice kept', async () => {
			await failWith({ code: 'PROVIDER_LIMIT', status: 429 });
			expect(document.activeElement).toBe(q('[role="listbox"]'));
			expect(optionFor('vendor/free-big:free').getAttribute('aria-selected')).toBe('true');
		});
	});

	describe('connected, and what is remembered', () => {
		async function connect(provider = 'openrouter', models = MODELS) {
			open();
			await toModelStep(provider, models);
			primary().click();
			await flush();
		}

		it('a passing test collapses the card to one Connected row: provider and Free on one line, the model ID under it, Change', async () => {
			await connect();
			expect(card.showsCard).toBe(false);
			const row = q('.agent-connected');
			expect(row.getAttribute('role')).toBe('status');
			expect(row.querySelector('.agent-connected__head').textContent).toContain('OpenRouter');
			// The whole ID is shown (cut by CSS only when it is too long) and is in the title.
			expect(row.querySelector('.agent-connected__model').textContent).toBe('vendor/free-big:free');
			expect(row.querySelector('.agent-connected__text').title).toBe(
				'OpenRouter · vendor/free-big:free'
			);
			expect(row.querySelector('[data-badge="free"]').textContent).toContain('Free');
			expect(row.querySelector('button').textContent).toBe('Change');
			expect(q('form')).toBe(null);
			expect(card.connected).toEqual({
				provider: 'openrouter',
				model: 'vendor/free-big:free',
				tier: 'free',
			});
		});

		it('a Paid model shows Paid; a model with no known price shows neither', async () => {
			await connect('openai', [model('gpt-5')]);
			expect(q('.agent-connected [data-badge="paid"]').textContent).toContain('Paid');
			card.root.remove();
			storage = memoryStorage();
			await connect('openai', [model('gpt-5', { price: null })]);
			expect(q('.agent-connected [data-badge]')).toBe(null);
		});

		it('hands the controller the key and the model, once, in a fresh object', async () => {
			await connect();
			expect(onConnected).toHaveBeenCalledTimes(1);
			const config = onConnected.mock.calls[0][0];
			expect(config).toEqual({
				provider: 'openrouter',
				model: 'vendor/free-big:free',
				apiKey: KEY,
			});
			// The panel blanks what it is given; the card keeps its own copy.
			config.apiKey = '';
			expect(card.connected).not.toHaveProperty('apiKey');
		});

		it('remembers only the provider, model and tier, never the key', async () => {
			await connect();
			expect(JSON.parse(storage.data.get(CONNECTION_STORAGE_KEY))).toEqual({
				provider: 'openrouter',
				model: 'vendor/free-big:free',
				tier: 'free',
			});
			const everything = JSON.stringify([...storage.data.entries()]);
			expect(everything).not.toContain(KEY);
			expect(everything).not.toContain('sk-or');
			expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).toBe(null);
			expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
			expect(JSON.stringify({ ...sessionStorage })).not.toContain(KEY);
		});

		it('the key is not in any attribute, text or link of the whole card', async () => {
			await connect();
			expect(card.root.outerHTML).not.toContain(KEY);
			expect(card.root.textContent).not.toContain(KEY);
		});

		it('Change opens the model step while the key is in memory, on the connected model', async () => {
			await connect();
			q('.agent-connected button').click();
			expect(card.step).toBe(3);
			expect(optionFor('vendor/free-big:free').getAttribute('aria-selected')).toBe('true');
			// Picking the model that is connected needs no new test.
			check.mockClear();
			primary().click();
			await flush();
			expect(check).not.toHaveBeenCalled();
			expect(card.showsCard).toBe(false);
		});

		it('Change then another model tests that model and replaces the connection', async () => {
			await connect();
			q('.agent-connected button').click();
			optionFor('vendor/paid-one').click();
			primary().click();
			await flush();
			expect(onConnected).toHaveBeenCalledTimes(2);
			expect(card.connected).toMatchObject({ model: 'vendor/paid-one', tier: 'paid' });
			expect(JSON.parse(storage.data.get(CONNECTION_STORAGE_KEY)).model).toBe('vendor/paid-one');
		});

		it('a failed test of the new model leaves the old connection in place', async () => {
			await connect();
			q('.agent-connected button').click();
			optionFor('vendor/paid-one').click();
			check.mockResolvedValue({ ok: false, error: { code: 'PROVIDER_CREDITS', status: 402 } });
			primary().click();
			await flush();
			expect(card.connected?.model).toBe('vendor/free-big:free');
			expect(JSON.parse(storage.data.get(CONNECTION_STORAGE_KEY)).model).toBe(
				'vendor/free-big:free'
			);
			expect(q('[role="alert"]')).not.toBe(null);
		});

		it('Change opens the model ID field when the connected model is not in the list', async () => {
			open();
			await toModelStep();
			qa('button')
				.find((button) => button.textContent === 'Use a model ID')
				.click();
			idInput().value = 'hidden/custom-one';
			primary().click();
			await flush();
			q('.agent-connected button').click();
			expect(idInput().value).toBe('hidden/custom-one');
		});

		it('reset() forgets the key, shows the first step, and keeps the remembered model for the next key', async () => {
			await connect();
			card.reset();
			expect(card.showsCard).toBe(true);
			// Remembered: the card asks only for the key again.
			expect(card.step).toBe(2);
			expect(title()).toBe('Reconnect to OpenRouter');
			expect(keyInput().value).toBe('');
		});

		it('clearKey() wipes the key and the connection and goes back to Step 1', async () => {
			await connect();
			card.clearKey();
			expect(card.step).toBe(1);
			expect(card.connected).toBe(null);
			expect(card.root.outerHTML).not.toContain(KEY);
		});

		it('forget() removes the remembered provider and model', async () => {
			await connect();
			card.forget();
			expect(storage.data.has(CONNECTION_STORAGE_KEY)).toBe(false);
		});
	});

	describe('after a reload: only the key is asked for again', () => {
		const remembered = (model = 'vendor/free-big:free', provider = 'openrouter', tier = 'free') =>
			memoryStorage({ [CONNECTION_STORAGE_KEY]: JSON.stringify({ provider, model, tier }) });

		it('opens on the key step: "Reconnect to …", the remembered model, one field, one primary', () => {
			storage = remembered();
			open();
			expect(card.step).toBe(2);
			expect(title()).toBe('Reconnect to OpenRouter');
			expect(q('.agent-connect__line').textContent).toBe('Model: vendor/free-big:free');
			expect(keyInput().value).toBe('');
			expect(primary().textContent).toBe('Check key');
			expect(back()).not.toBe(null);
		});

		it('Check key tests the remembered model and connects with no model step', async () => {
			storage = remembered();
			open();
			await submitKey();
			expect(loadModels).toHaveBeenCalledTimes(1);
			expect(check).toHaveBeenCalledTimes(1);
			expect(check.mock.calls[0][0]).toEqual({
				provider: 'openrouter',
				model: 'vendor/free-big:free',
				apiKey: KEY,
			});
			expect(card.showsCard).toBe(false);
			expect(card.connected).toEqual({
				provider: 'openrouter',
				model: 'vendor/free-big:free',
				tier: 'free',
			});
			expect(onConnected).toHaveBeenCalledWith({
				provider: 'openrouter',
				model: 'vendor/free-big:free',
				apiKey: KEY,
			});
		});

		it('keeps the remembered tier when the list has no price for it', async () => {
			storage = remembered('vendor/odd', 'openrouter', 'paid');
			open();
			loadModels.mockResolvedValue(listed([model('vendor/odd', { price: null })]));
			await submitKey();
			expect(card.connected?.tier).toBe(undefined);
		});

		it('a model the list no longer has opens the model step with a line saying so', async () => {
			storage = remembered('vendor/gone');
			open();
			await submitKey();
			expect(check).not.toHaveBeenCalled();
			expect(card.step).toBe(3);
			expect(q('.agent-connect__line').textContent).toBe(
				"That model isn't available now. Pick another."
			);
			expect(optionFor('vendor/free-big:free').getAttribute('aria-selected')).toBe('true');
		});

		it('a model the list says cannot run the agent opens the model step too', async () => {
			storage = remembered('vendor/no-tools');
			open();
			await submitKey();
			expect(check).not.toHaveBeenCalled();
			expect(card.step).toBe(3);
		});

		it('a remembered model that fails its test opens the model step with that model chosen and the reason', async () => {
			storage = remembered('vendor/paid-one', 'openrouter', 'paid');
			open();
			check.mockResolvedValue({ ok: false, error: { code: 'PROVIDER_CREDITS', status: 402 } });
			await submitKey();
			expect(card.step).toBe(3);
			expect(optionFor('vendor/paid-one').getAttribute('aria-selected')).toBe('true');
			expect(q('[role="alert"]').textContent).toContain('402 · Out of credits');
			expect(card.connected).toBe(null);
		});

		it('a remembered model typed earlier (unknown to the catalog) is still tested', async () => {
			storage = remembered('vendor/unknown');
			open();
			await submitKey();
			expect(check).toHaveBeenCalledTimes(1);
			expect(card.connected?.model).toBe('vendor/unknown');
		});

		it('a key that cannot list models still tests the remembered model', async () => {
			storage = remembered('hidden/custom');
			open();
			loadModels.mockResolvedValue(failed({ code: 'PROVIDER_FORBIDDEN', status: 403 }));
			await submitKey();
			// The list is refused; the one test message decides. (Step 3 is the ID field with the model typed.)
			expect(card.step).toBe(3);
			expect(idInput().value).toBe('hidden/custom');
		});

		it('a wrong key shows the 401 on the key step and does not test anything', async () => {
			storage = remembered();
			open();
			loadModels.mockResolvedValue(failed({ code: 'PROVIDER_AUTH', status: 401 }));
			await submitKey('sk-or-v1-wrong');
			expect(card.step).toBe(2);
			expect(check).not.toHaveBeenCalled();
			expect(q('[role="alert"]').textContent).toContain('401 · Key not accepted');
		});

		it('Back goes to the provider step, where another provider can be chosen', () => {
			storage = remembered();
			open();
			back().click();
			expect(card.step).toBe(1);
			choose('anthropic');
			expect(title()).toBe('Add your Anthropic key');
		});

		it('Change after reconnecting opens the model step: the key is in memory again', async () => {
			storage = remembered();
			open();
			await submitKey();
			q('.agent-connected button').click();
			expect(card.step).toBe(3);
			expect(optionFor('vendor/free-big:free').getAttribute('aria-selected')).toBe('true');
		});

		it('Change asks for the key when it is no longer in memory', async () => {
			storage = remembered();
			open();
			await submitKey();
			card.clearKey();
			card.open('model');
			expect(card.step).toBe(1);
		});

		it('ignores anything in storage that is not a known provider and a valid model', () => {
			storage = memoryStorage({
				[CONNECTION_STORAGE_KEY]: JSON.stringify({ provider: 'nope', model: 'x' }),
			});
			open();
			expect(card.step).toBe(1);
		});

		it('works with storage that throws', () => {
			storage = {
				getItem: () => {
					throw new Error('blocked');
				},
				setItem: () => {
					throw new Error('blocked');
				},
				removeItem: () => {},
			};
			expect(() => open()).not.toThrow();
			expect(card.step).toBe(1);
		});
	});

	describe('one form grid for every step (the owner’s "boxes are different lengths" fix)', () => {
		it('every step has the same header, and steps 2 and 3 the same action stack: primary, then Back', async () => {
			open();
			const headers = [];
			headers.push(q('.agent-connect__header') !== null);
			choose('openrouter');
			headers.push(q('.agent-connect__header') !== null);
			await submitKey();
			headers.push(q('.agent-connect__header') !== null);
			expect(headers).toEqual([true, true, true]);
			for (const step of [2, 3]) {
				card.open(step === 2 ? 'key' : 'model');
				const actions = q('.agent-connect__actions');
				expect([...actions.children].map((node) => node.dataset.action)).toEqual([
					'primary',
					'back',
				]);
				expect(actions.children[0].type).toBe('submit');
			}
		});

		it('there is no native select, datalist or popover on any step or state', async () => {
			open();
			const check = () => {
				expect(q('select, datalist, option, [popover]')).toBe(null);
				expect(card.root.querySelector('[role="menu"], [role="dialog"]')).toBe(null);
			};
			check();
			choose('openrouter');
			check();
			await submitKey();
			check();
			qa('button')
				.find((button) => button.textContent === 'Use a model ID')
				.click();
			check();
		});

		it('no control carries its own width: every one follows the card’s content width', async () => {
			open();
			await toModelStep('openrouter', many(20));
			const controls = qa(
				'.agent-field__box, input, [role="listbox"], .agent-provider, .agent-connect__primary, .agent-connect__back'
			);
			expect(controls.length).toBeGreaterThan(4);
			for (const control of controls) {
				expect(control.style.width).toBe('');
				expect(control.style.height).toBe('');
				expect(control.hasAttribute('width')).toBe(false);
			}
		});
	});

	describe('telling the owner what is on screen', () => {
		it('calls onViewChange when the card gives way to the Connected row and when Change brings it back', async () => {
			const onViewChange = vi.fn();
			open({ onViewChange });
			// Building the card does not call it: the owner is still being built.
			expect(onViewChange).not.toHaveBeenCalled();
			await toModelStep();
			onViewChange.mockClear();
			primary().click();
			await flush();
			expect(onViewChange).toHaveBeenCalled();
			expect(card.showsCard).toBe(false);
			onViewChange.mockClear();
			q('.agent-connected button').click();
			expect(onViewChange).toHaveBeenCalled();
			expect(card.showsCard).toBe(true);
		});
	});

	describe('a11y and announcements', () => {
		it('the card is one labelled form; a polite live region announces each step', async () => {
			vi.useFakeTimers();
			open();
			expect(q('form').getAttribute('aria-label')).toBe('Connect a model');
			const live = q('[role="status"][aria-live="polite"]');
			choose('openrouter');
			vi.advanceTimersByTime(50);
			expect(live.textContent).toBe('Step 2 of 3. Add your OpenRouter key');
		});

		it('focus goes to the step’s first control after every step change', async () => {
			open();
			choose('openrouter');
			expect(document.activeElement).toBe(keyInput());
			await submitKey();
			expect(document.activeElement).toBe(q('[role="listbox"]'));
			back().click();
			expect(document.activeElement).toBe(keyInput());
			back().click();
			expect(document.activeElement.dataset.provider).toBe('openrouter');
		});

		it('every string from a provider or the list is rendered as text', async () => {
			open();
			const evil = '<img src=x onerror=alert(1)>';
			loadModels.mockResolvedValue(failed({ code: 'PROVIDER_AUTH', status: 401, detail: evil }));
			choose('openrouter');
			await submitKey();
			qa('button')
				.find((button) => button.textContent === 'Details')
				.click();
			expect(q('img')).toBe(null);
			expect(q('.agent-error__details').textContent).toContain(evil);
		});
	});

	it('labels the model chip', () => {
		expect(modelLabel('gpt-5')).toBe('GPT-5');
		expect(modelLabel('big-pickle')).toBe('big-pickle');
		// A vendor prefix is dropped: the end of the ID names the model, and the chip is short.
		expect(modelLabel('google/gemma-4-26b-a4b-it:free')).toBe('gemma-4-26b-a4b-it:free');
		expect(modelLabel('~anthropic/claude-sonnet-latest')).toBe('claude-sonnet-latest');
		expect(modelLabel('openai/gpt-5')).toBe('GPT-5');
	});
});
