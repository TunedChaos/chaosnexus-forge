// chaosnexus-forge/tests/vitest-setup.ts
/**
 * @description Global Vitest setup and browser API mocks (matchMedia, ResizeObserver) for ChaosNexus Forge tests.
 */
import { vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Also mock ResizeObserver which is commonly needed alongside matchMedia
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
