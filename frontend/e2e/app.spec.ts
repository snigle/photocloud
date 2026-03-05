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
    // Wait for either photos to appear or the "No photos found" message
    // Synchronization happens in background, so we give it some time
    const galleryItems = page.locator('img');
    const emptyMessage = page.getByText('No photos found.');

    await expect(galleryItems.first().or(emptyMessage)).toBeVisible({ timeout: 60000 });

    // Wait a bit more to let more photos load if they exist
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'e2e-screenshots/02-gallery-screen.png' });
  });
});
