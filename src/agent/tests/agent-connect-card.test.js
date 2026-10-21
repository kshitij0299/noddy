import { describe, expect, it, vi } from 'vitest';
import {
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
