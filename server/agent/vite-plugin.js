import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createAgentMiddleware } from './relay.js';

// The repo root, where the git-ignored .env.local lives (Vite's own root is ./src).
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** @returns {import('vite').Plugin} */
export function agentRelayPlugin() {
	return {
		name: 'noddy-local-agent-relay',
		async configureServer(server) {
			// Dev server only: a key from .env.local, used when the key field says `env`.
			// It stays on this side of the relay; the browser never receives it.
			const env = loadEnv(server.config.mode, REPO_ROOT, 'OPENROUTER_API_KEY');
			const devKeys = env.OPENROUTER_API_KEY ? { openrouter: env.OPENROUTER_API_KEY } : {};
			// Dev server only: /mcp and the tab bridge for a local coding agent. Loaded here
			// so the MCP SDK (a dev dependency) never reaches preview, serve.js or the build.
			const { createLocalAgentBridge } = await import('./local-agent.js');
			const bridge = createLocalAgentBridge();
			server.httpServer?.once('close', () => bridge.close());
			server.middlewares.use(bridge.middleware);
			server.middlewares.use(createAgentMiddleware({ devKeys, localAgent: true }));
		},
		configurePreviewServer(server) {
			server.middlewares.use(createAgentMiddleware());
		},
	};
}
