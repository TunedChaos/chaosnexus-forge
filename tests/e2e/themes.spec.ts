/**
 * @file themes.spec.ts
 * @module chaosnexus-forge/tests/e2e/themes
 * @description Playwright end-to-end tests for visual themes.
 */
import { test, expect } from '@playwright/test';

const themes = [
  'System',
  'Standard Dark',
  'Standard Light',
  'High Contrast Dark',
  'High Contrast Light',
  'Protanopia Dark',
  'Protanopia Light',
  'Deuteranopia Dark',
  'Deuteranopia Light',
  'Tritanopia Dark',
  'Tritanopia Light',
  'Monochromacy Dark',
  'Monochromacy Light'
];

test.describe('Visual Theme Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for the app to initialize
    await page.waitForSelector('nav');
    
    // Create a mock plugin and open a file to ensure the dual editor is visible
    await page.evaluate(() => {
      // Direct state manipulation for test scenario
      const { workbench } = (window as any)._chaosforge_state || {};
      if (workbench) {
        workbench.projectPath = '/mock/workspace';
        workbench.activePlugin = { name: 'test_plugin', files: [] };
        workbench.openTab('test_plugin', 'test_script.rhai');
      }
    });
    // Let Svelte re-render
    await page.waitForTimeout(500);
    await page.locator('[data-testid="monaco-loading"]').waitFor({ state: 'hidden', timeout: 10000 });
  });

  for (const theme of themes) {
    test(`Visual Check: ${theme}`, async ({ page }) => {
      // Themes are applied programmatically (the menu-bar Themes dropdown was
      // removed; theme selection now lives in Settings > Appearance). Driving the
      // store directly keeps this regression check stable and locale-agnostic.
      await page.evaluate((t) => {
        const { workbench } = (window as any)._chaosforge_state || {};
        if (workbench) {
          workbench.setTheme(t);
        }
      }, theme);

      // Wait for theme application (CSS variables to update)
      await page.waitForTimeout(500);

      // Blur the auto-focused Monaco editor so its blinking caret does not
      // introduce nondeterministic pixel diffs in the full-page snapshot.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForTimeout(150);
      await page.locator('[data-testid="monaco-loading"]').waitFor({ state: 'hidden', timeout: 10000 });

      // Take screenshot of the entire page
      const screenshot = await page.screenshot();
      
      // Use Playwright's visual comparison.
      // maxDiffPixels tolerates sub-pixel text anti-aliasing (which drifts by a
      // few hundred pixels under parallel CPU load) while still catching real
      // theme/layout regressions, which span tens of thousands of pixels.
      expect(screenshot).toMatchSnapshot(`theme-${theme.replace(/\s+/g, '-').toLowerCase()}.png`, {
        maxDiffPixels: 1500,
      });
    });
  }
});
