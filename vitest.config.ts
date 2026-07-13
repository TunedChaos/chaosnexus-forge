/**
 * Vitest Configuration
 * 
 * @module vitest.config
 * @description Configuration file for Vitest in the ChaosNexus Forge frontend environment.
 * Sets up jsdom, svelte-kit plugin, icons, and Tauri API mocks.
 */
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';

import { resolve } from 'path';

export default defineConfig({
	plugins: [sveltekit(), Icons({ compiler: 'svelte' })],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./tests/vitest-setup.ts'],
	},
	resolve: {
		conditions: ['browser'],
		alias: {
			'@tauri-apps/api/core': resolve(__dirname, './src/lib/mocks/tauri.ts'),
			'@tauri-apps/api/event': resolve(__dirname, './src/lib/mocks/tauri.ts'),
			'@tauri-apps/api/window': resolve(__dirname, './src/lib/mocks/tauri.ts')
		}
	}
});
