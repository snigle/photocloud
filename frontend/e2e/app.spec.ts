import { test, expect } from '@playwright/test';

test.describe('Photo Cloud App', () => {
  test('should login via dev and show gallery', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await expect(page.getByText('Photo Cloud')).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: 'e2e-screenshots/01-auth-screen.png' });

    // Click "Use Developer Account"
    const devButton = page.getByRole('button', { name: 'Use Developer Account' });
    await devButton.click();

    // Check if we are in the Gallery
    // GalleryScreen should show "No photos found." if count is 0
    // Note: It might show "Loading your gallery..." briefly
    await expect(page.getByText('No photos found.')).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: 'e2e-screenshots/02-gallery-screen.png' });
  });
});
