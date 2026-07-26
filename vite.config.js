import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import monacoEditorPlugin from "vite-plugin-monaco-editor";
import Icons from "unplugin-icons/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    tailwindcss(),
    sveltekit(),
    Icons({ compiler: 'svelte' }),
    // @ts-expect-error Typescript doesn't know about .default here
    (monacoEditorPlugin.default || monacoEditorPlugin)({ languageWorkers: ["editorWorkerService"] })
  ],
  resolve: {
    alias: {
      $lib: "/src/lib",
      ...(process.env.MOCK_TAURI === "true" ? {
        "@tauri-apps/api/core": "/src/lib/mocks/tauri.ts",
        "@tauri-apps/api/event": "/src/lib/mocks/tauri.ts",
      } : {})
    }
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("monaco-editor")) {
              return "monaco-editor";
            }
            if (id.includes("@xyflow")) {
              return "xyflow";
            }
            if (id.includes("svelte")) {
              return "svelte-core";
            }
            return "vendor";
          }
        },
      },
    },
  },
}));
