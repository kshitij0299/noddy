/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentRelayPlugin } from '../server/agent/vite-plugin.js';

export default defineConfig({
	// React only renders islands (the agent composer, #126); the app itself is vanilla JS + lit.
	plugins: [react(), agentRelayPlugin()],
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
