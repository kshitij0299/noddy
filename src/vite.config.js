/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { agentRelayPlugin } from '../server/agent/vite-plugin.js';

export default defineConfig({
	plugins: [agentRelayPlugin()],
	build: {
		outDir: '../dist/',
		manifest: false,
		emptyOutDir: true,
		chunkSizeWarningLimit: 3000,
		rollupOptions: {
			treeshake: true,
		},
	},
});
