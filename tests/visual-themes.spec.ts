/**
 * Visual Regression Tests for Themes
 * 
 * @module tests/visual-themes
 * @description Playwright test suite for validating visual appearance of all ChaosNexus Forge themes.
 * Runs through the available themes and captures full-page screenshots to detect visual regressions.
 */
import { test, expect } from '@playwright/test';

test.describe('Theme Visual Regressions', () => {
  // Array of themes available in the application
  const themes = [
    { name: 'System', value: 'system' },
    { name: 'Standard Dark', value: 'dark' },
    { name: 'Standard Light', value: 'light' },
    { name: 'High Contrast Dark', value: 'hc-dark' },
    { name: 'High Contrast Light', value: 'hc-light' },
    { name: 'Protanopia Dark', value: 'protanopia-dark' },
    { name: 'Protanopia Light', value: 'protanopia-light' },
    { name: 'Deuteranopia Dark', value: 'deuteranopia-dark' },
    { name: 'Deuteranopia Light', value: 'deuteranopia-light' },
    { name: 'Tritanopia Dark', value: 'tritanopia-dark' },
    { name: 'Tritanopia Light', value: 'tritanopia-light' },
    { name: 'Monochromacy Dark', value: 'monochromacy-dark' },
    { name: 'Monochromacy Light', value: 'monochromacy-light' }
  ];

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to initialize
    await page.waitForSelector('nav');
  });

  for (const theme of themes) {
    test(`Visual test for theme: ${theme.name}`, async ({ page }) => {
      // The menu-bar Themes dropdown was removed (themes now live in
      // Settings > Appearance), so apply the theme through the store directly.
      // This is locale-agnostic and avoids brittle nested-menu hover navigation.
      await page.evaluate((name) => {
        const { workbench } = (window as any)._chaosforge_state || {};
        workbench?.setTheme(name);
      }, theme.name);

      // Verify the html tag has the correct data-theme attribute
      if (theme.value !== 'system') {
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme.value);
      }

      // Take a full page screenshot and compare it with the baseline
      // Wait a moment for transitions
      await page.waitForTimeout(300);
      
      // Masking dynamic areas like paths if necessary, but full page is requested.
      await expect(page).toHaveScreenshot(`theme-${theme.value}.png`, {
        fullPage: true,
        maxDiffPixels: 100 // Allow slight font rendering differences
      });
    });
  }
});
