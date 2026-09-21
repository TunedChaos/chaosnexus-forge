/**
 * @file playwright.config.ts
 * @module chaosnexus-forge/tests/config
 * @description Playwright end-to-end testing configuration for ChaosNexus Forge.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Never use the HTML reporter: its blocking web server locks up agentic tool
  // runs. A concise `list` console plus a machine-readable JSON file keeps both
  // humans and automation unblocked.
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: {
    baseURL: 'http://localhost:1425',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'MOCK_TAURI=true pnpm run dev --port 1425',
    url: 'http://localhost:1425',
    reuseExistingServer: !process.env.CI,
  },
});
