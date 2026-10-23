import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createAgentMiddleware } from './relay.js';

// The repo root, where the git-ignored .env.local lives (Vite's own root is ./src).
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** @returns {import('vite').Plugin} */
export function agentRelayPlugin() {
	return {
		name: 'noddy-local-agent-relay',
		configureServer(server) {
			// Dev server only: a key from .env.local, used when the key field says `env`.
			// It stays on this side of the relay; the browser never receives it.
			const env = loadEnv(server.config.mode, REPO_ROOT, 'OPENROUTER_API_KEY');
			const devKeys = env.OPENROUTER_API_KEY ? { openrouter: env.OPENROUTER_API_KEY } : {};
			server.middlewares.use(createAgentMiddleware({ devKeys }));
		},
		configurePreviewServer(server) {
			server.middlewares.use(createAgentMiddleware());
		},
	};
}
