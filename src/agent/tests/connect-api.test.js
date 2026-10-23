import { describe, expect, it, vi } from 'vitest';
import { TOOL_DEFINITIONS } from '../tool-definitions.js';
import { validateModelsRequest, validateRequest } from '../../../server/agent/validation.js';
import { checkConnection, fetchModels } from '../connect-api.js';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const KEY = 'sk-or-v1-key-that-must-never-leave-the-body';

describe('fetchModels: key check and list in one relay request (#82)', () => {
	it('posts exactly {provider, apiKey} to /api/agent/models, the key only in the body', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			json(200, {
				provider: 'openrouter',
				catalog: 'provider',
				models: [{ id: 'a/b:free', tools: true, price: { input: 0, output: 0 } }],
				freeRequests: { remaining: 38, limit: 50 },
			})
		);
		const answer = await fetchModels({ provider: 'openrouter', apiKey: KEY }, { fetchImpl });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('/api/agent/models');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ provider: 'openrouter', apiKey: KEY });
		expect(JSON.stringify(init.headers)).not.toContain(KEY);
		expect(url).not.toContain('sk-');
		// The relay's own validator accepts exactly this body.
		expect(validateModelsRequest(JSON.parse(init.body))).toEqual({
			provider: 'openrouter',
			apiKey: KEY,
		});
		expect(answer.ok).toBe(true);
		expect(answer.models.map((model) => model.id)).toEqual(['a/b:free']);
		expect(answer.freeRequests).toEqual({ remaining: 38, limit: 50 });
	});

	it('keeps the relay’s code, the provider’s status, the hint and the cleaned message', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			json(401, {
				error: {
					code: 'PROVIDER_AUTH',
					message: 'The provider rejected this API key.',
					status: 401,
					detail: 'User not found.',
					extra: 'ignored',
				},
			})
		);
		const answer = await fetchModels({ provider: 'openrouter', apiKey: KEY }, { fetchImpl });
		expect(answer).toEqual({
			ok: false,
			error: {
				code: 'PROVIDER_AUTH',
				status: 401,
				detail: 'User not found.',
				message: 'The provider rejected this API key.',
			},
		});
	});

	it('an answer that is not the relay’s means no relay', async () => {
		const html = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => {
				throw new SyntaxError('Unexpected token <');
			},
		});
		expect(await fetchModels({ provider: 'openai', apiKey: KEY }, { fetchImpl: html })).toEqual({
			ok: false,
			error: { offline: true },
		});
		const shapeless = vi.fn().mockResolvedValue(json(500, { oops: true }));
		expect(
			await fetchModels({ provider: 'openai', apiKey: KEY }, { fetchImpl: shapeless })
		).toEqual({
			ok: false,
			error: { offline: true },
		});
		const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await fetchModels({ provider: 'openai', apiKey: KEY }, { fetchImpl: down })).toEqual({
			ok: false,
			error: { offline: true },
		});
	});

	it('a request the user cancelled is not a failure to report', async () => {
		const controller = new AbortController();
		const fetchImpl = vi.fn(
			(_url, init) =>
				new Promise((_resolve, reject) =>
					init.signal.addEventListener('abort', () =>
						reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
					)
				)
		);
		const pending = fetchModels(
			{ provider: 'openai', apiKey: KEY },
			{ fetchImpl, signal: controller.signal }
		);
		controller.abort();
		expect(await pending).toEqual({ ok: false, error: { aborted: true } });
	});

	it('a timeout is the provider not answering', async () => {
		const fetchImpl = vi
			.fn()
			.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
		expect(await fetchModels({ provider: 'openai', apiKey: KEY }, { fetchImpl })).toEqual({
			ok: false,
			error: { code: 'PROVIDER_UNAVAILABLE', status: 408 },
		});
	});

	it('a list the browser cannot read is an empty list, never a crash', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(json(200, { models: 'nope' }));
		const answer = await fetchModels({ provider: 'openai', apiKey: KEY }, { fetchImpl });
		expect(answer).toEqual({ ok: true, models: [], freeRequests: null });
	});
});

describe('checkConnection: one tiny tool-enabled message (#82)', () => {
	const config = { provider: 'openrouter', model: 'a/b:free', apiKey: KEY };

	it('posts one step with purpose "check", which the relay validates, and nothing in the URL', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(json(200, {}));
		expect(await checkConnection(config, { fetchImpl })).toEqual({ ok: true });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('/api/agent/step');
		expect(url).not.toContain('sk-');
		const body = JSON.parse(init.body);
		expect(body).toMatchObject({
			provider: 'openrouter',
			protocol: 'auto',
			model: 'a/b:free',
			apiKey: KEY,
			purpose: 'check',
		});
		expect(body.messages).toHaveLength(1);
		expect(validateRequest(body, TOOL_DEFINITIONS)).toMatchObject({
			provider: 'openrouter',
			protocol: 'chat',
			model: 'a/b:free',
			purpose: 'check',
		});
	});

	it('every provider’s check passes the relay’s validator and routes to its own format', async () => {
		const cases = [
			['openrouter', 'vendor/model:free', 'chat'],
			['openai', 'gpt-5', 'responses'],
			['anthropic', 'claude-sonnet-5-5', 'messages'],
			['opencode-zen', 'kimi-k2.6', 'chat'],
			['opencode-zen', 'claude-sonnet-5-5', 'messages'],
			['opencode-zen', 'beam-free', 'chat'],
			['opencode-zen', 'muse-wonder-1.0', 'responses'],
		];
		for (const [provider, model, protocol] of cases) {
			const fetchImpl = vi.fn().mockResolvedValue(json(200, {}));
			await checkConnection({ provider, model, apiKey: 'sk-1' }, { fetchImpl });
			const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
			expect(validateRequest(body, TOOL_DEFINITIONS)).toMatchObject({ provider, protocol, model });
		}
	});

	it('a provider failure carries its status, hint and message for the card', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			json(403, {
				error: {
					code: 'PROVIDER_FORBIDDEN',
					message: 'The provider says this key cannot use that model.',
					status: 403,
					hint: 'free-tier-only',
					detail: "OpenCode's free tier can only be used from within OpenCode.",
				},
			})
		);
		const answer = await checkConnection(
			{ provider: 'opencode-zen', model: 'big-pickle', apiKey: KEY },
			{ fetchImpl }
		);
		expect(answer.ok).toBe(false);
		expect(answer.error).toMatchObject({
			code: 'PROVIDER_FORBIDDEN',
			status: 403,
			hint: 'free-tier-only',
		});
		expect(JSON.stringify(answer)).not.toContain(KEY);
	});

	it('relay off and cancelled calls are told apart', async () => {
		const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await checkConnection(config, { fetchImpl: offline })).toEqual({
			ok: false,
			error: { offline: true },
		});
		const controller = new AbortController();
		controller.abort();
		const aborted = vi
			.fn()
			.mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
		expect(
			await checkConnection(config, { fetchImpl: aborted, signal: controller.signal })
		).toEqual({
			ok: false,
			error: { aborted: true },
		});
	});
});
