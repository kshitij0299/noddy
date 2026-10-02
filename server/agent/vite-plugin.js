import { createAgentMiddleware } from './relay.js';

/** @returns {import('vite').Plugin} */
export function agentRelayPlugin() {
	return {
		name: 'noddy-local-agent-relay',
		configureServer(server) {
			server.middlewares.use(createAgentMiddleware());
		},
		configurePreviewServer(server) {
			server.middlewares.use(createAgentMiddleware());
		},
	};
}
