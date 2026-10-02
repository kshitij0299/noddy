import { generateAgentStep, loadNativeRegistry } from './agent.js';
import { PROVIDERS } from './providers.js';
import { LIMITS, RelayError } from './validation.js';

/** @param {import('node:http').IncomingMessage} req */
export function assertLocalRequest(req, requireOrigin = false) {
	const remote = req.socket.remoteAddress;
	if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
		throw new RelayError('LOCAL_ONLY', 'This agent relay accepts local connections only.', 403);
	}
	let origin;
	try {
		const parsed = new URL(`http://${req.headers.host}`);
		if (
			!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
			Number(parsed.port || 80) !== req.socket.localPort ||
			parsed.pathname !== '/' ||
			parsed.username ||
			parsed.password ||
			parsed.search ||
			parsed.hash
		)
			throw new Error();
		origin = parsed.origin;
	} catch {
		throw new RelayError('INVALID_HOST', 'Invalid local relay host.', 403);
	}
	if ((requireOrigin || req.headers.origin) && req.headers.origin !== origin) {
		throw new RelayError('INVALID_ORIGIN', 'Open the agent from this Noddy window.', 403);
	}
	if (req.headers['sec-fetch-site'] === 'cross-site') {
		throw new RelayError('INVALID_ORIGIN', 'Cross-site agent requests are not allowed.', 403);
	}
}

function sendJSON(res, status, data) {
	if (res.destroyed || res.writableEnded) return;
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'no-referrer',
	});
	res.end(JSON.stringify(data));
}

async function readBody(req, signal) {
	if (
		req.headers['content-type']?.split(';')[0].trim() !== 'application/json' ||
		req.headers['content-encoding']
	) {
		throw new RelayError('CONTENT_TYPE', 'Send an uncompressed JSON request.', 415);
	}
	if (Number(req.headers['content-length']) > LIMITS.bodyBytes) {
		throw new RelayError(
			'TOO_LARGE',
			'Agent request exceeds 8 MB. Remove or resize attachments.',
			413
		);
	}
	const chunks = [];
	let bytes = 0;
	const abort = () => req.destroy(signal.reason);
	signal.addEventListener('abort', abort, { once: true });
	try {
		signal.throwIfAborted();
		for await (const chunk of req) {
			bytes += chunk.length;
			if (bytes > LIMITS.bodyBytes)
				throw new RelayError('TOO_LARGE', 'Agent request exceeds 8 MB.', 413);
			chunks.push(chunk);
		}
	} finally {
		signal.removeEventListener('abort', abort);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		throw new RelayError('INVALID_JSON', 'Invalid JSON request.');
	}
}

/** Never relay provider messages: they may echo a prompt, image, key or headers. */
export function publicError(error) {
	if (error instanceof RelayError) return error;
	if (['AbortError', 'TimeoutError'].includes(error?.name)) {
		return new RelayError('CANCELLED', 'Agent request stopped or timed out.', 408);
	}
	if ([401, 403].includes(error?.statusCode)) {
		return new RelayError(
			'PROVIDER_AUTH',
			'The provider rejected this API key or model access.',
			401
		);
	}
	if (error?.statusCode === 429) {
		return new RelayError(
			'PROVIDER_LIMIT',
			'Provider rate or credit limit reached. Check your account before retrying.',
			429
		);
	}
	if ([400, 404, 422].includes(error?.statusCode)) {
		return new RelayError(
			'PROVIDER_REQUEST',
			'Provider rejected the request. Check the model ID, API format and image support.',
			422
		);
	}
	return new RelayError(
		'PROVIDER_UNAVAILABLE',
		'The provider request failed. Check the connection and retry when ready.',
		502
	);
}

/**
 * Same middleware is used by Vite and the production loopback host. Test-only
 * injections are functions, not environment flags or browser-controlled fields.
 * @param {{loadRegistry?:typeof loadNativeRegistry, generateStep?:typeof generateAgentStep, timeoutMs?:number}} options
 */
export function createAgentMiddleware(options = {}) {
	let active = 0;
	const starts = [];
	return async (
		req,
		res,
		next = () => sendJSON(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found.' } })
	) => {
		if (!req.url?.startsWith('/api/agent/')) return next();
		let counted = false;
		let timeout;
		const controller = new AbortController();
		const disconnect = () => {
			if (!res.writableEnded) controller.abort();
		};
		try {
			assertLocalRequest(req, req.method === 'POST');
			if (req.method === 'GET' && req.url === '/api/agent/config') {
				return sendJSON(res, 200, { providers: PROVIDERS, limits: LIMITS });
			}
			if (req.url !== '/api/agent/step')
				throw new RelayError('NOT_FOUND', 'Unknown agent endpoint.', 404);
			if (req.method !== 'POST') throw new RelayError('METHOD', 'Use POST for an agent step.', 405);
			const now = Date.now();
			while (starts.length && starts[0] < now - 60000) starts.shift();
			if (active >= LIMITS.concurrentRequests || starts.length >= 30) {
				throw new RelayError(
					'BUSY',
					'Agent request limit reached. Wait before sending another request.',
					429
				);
			}
			active++;
			counted = true;
			starts.push(now);
			// Response close means a disconnected browser; request close also occurs
			// normally once a POST body finishes and must not cancel generation.
			res.once('close', disconnect);
			req.once('aborted', disconnect);
			timeout = setTimeout(
				() => controller.abort(new DOMException('Timed out', 'TimeoutError')),
				options.timeoutMs ?? LIMITS.requestTimeoutMs
			);
			const body = await readBody(req, controller.signal);
			controller.signal.throwIfAborted();
			const registry = await (options.loadRegistry ?? loadNativeRegistry)();
			const result = await (options.generateStep ?? generateAgentStep)(body, registry, {
				signal: controller.signal,
			});
			controller.signal.throwIfAborted();
			sendJSON(res, 200, result);
		} catch (error) {
			const safe = publicError(controller.signal.aborted ? controller.signal.reason : error);
			sendJSON(res, safe.status, { error: { code: safe.code, message: safe.message } });
		} finally {
			clearTimeout(timeout);
			res.off('close', disconnect);
			req.off('aborted', disconnect);
			if (counted) active--;
		}
	};
}
