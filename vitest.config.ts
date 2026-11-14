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

import { resolve } from 'node:path';

const rootDir = import.meta.dirname;

export default defineConfig({
	plugins: [
		{
			name: 'ignore-css-imports',
			enforce: 'pre',
			transform(_code, id) {
				if (id.includes('.css')) {
					return { code: 'export default {};', map: null };
				}
			}
		},
		sveltekit(),
		Icons({ compiler: 'svelte' })
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./tests/vitest-setup.ts'],
		server: {
			deps: {
				inline: [/@codingame\/monaco-vscode-api/]
			}
		}
	},
	ssr: {
		noExternal: [/@codingame\/monaco-vscode-api/]
	},
	resolve: {
		conditions: ['browser'],
		alias: [
			{ find: /^.*\.css$/, replacement: resolve(rootDir, './tests/styleMock.js') },
			{ find: '@tauri-apps/api/core', replacement: resolve(rootDir, './src/lib/mocks/tauri.ts') },
			{ find: '@tauri-apps/api/event', replacement: resolve(rootDir, './src/lib/mocks/tauri.ts') },
			{ find: '@tauri-apps/api/window', replacement: resolve(rootDir, './src/lib/mocks/tauri.ts') }
		]
	}
});
