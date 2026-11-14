/**
 * @file app.d.ts
 * @module chaosnexus-forge/app
 * @description Global type definitions for the ChaosNexus Forge application.
 */
/// <reference types="unplugin-icons/types/svelte" />

declare global {
  interface Window {
    __TAURI_INTERNALS__?: boolean;
  }
}

export {};
