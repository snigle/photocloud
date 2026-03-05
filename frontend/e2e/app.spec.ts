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
    const galleryItems = page.locator('img[data-testid="photo-image"]');
    const emptyMessage = page.getByText('No photos found.');

    // Wait for the gallery to at least start showing something
    await expect(galleryItems.first().or(emptyMessage)).toBeVisible({ timeout: 60000 });

    // If there are photos, wait for them to finish loading (no more activity indicators)
    const loadingIndicators = page.locator('div[role="progressbar"]'); // React Native Paper ActivityIndicator
    if (await galleryItems.count() > 0) {
        console.log('Photos found, waiting for thumbnails to load...');
        // We wait for the first few thumbnails to be loaded (blob URL assigned)
        await expect(galleryItems.first()).toHaveAttribute('src', /^blob:/, { timeout: 30000 });
        // Give it a bit more time to load the rest of the visible grid
        await page.waitForTimeout(10000);
    }

    await page.screenshot({ path: 'e2e-screenshots/02-gallery-screen.png' });
  });
});
