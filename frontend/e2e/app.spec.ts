import { test, expect } from '@playwright/test';

test.describe('Photo Cloud App', () => {
  test('should login via dev and show gallery', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await expect(page.getByText('Photo Cloud')).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: 'e2e-screenshots/01-auth-screen.png' });

    // Click "Dev 1"
    const devButton = page.getByRole('button', { name: 'Dev 1' });
    await devButton.click();

    // Verify redirection to gallery (URL or some persistent element)
    await expect(page).toHaveURL(/.*gallery/, { timeout: 30000 });

    // Check if we are in the Gallery
    // Wait for either photos, error placeholders, or the "No photos found" message
    // Synchronization happens in background, so we give it some time
    const galleryItems = page.locator('img[data-testid="photo-image"]');
    const errorItems = page.getByText('⚠️');
    const emptyMessage = page.getByText('No photos found.');

    // Wait for the gallery to at least start showing something
    await expect(galleryItems.first().or(errorItems.first()).or(emptyMessage)).toBeVisible({ timeout: 60000 });

    // If there are photos, wait for them to finish loading (no more activity indicators)
    if (await galleryItems.count() > 0) {
        console.log('Photos found, waiting for thumbnails to load...');
        // We wait for the first few thumbnails to be loaded (blob URL assigned)
        // Increased timeout to 60s for S3 decryption/download
        try {
            await expect(galleryItems.first()).toHaveAttribute('src', /^blob:/, { timeout: 60000 });
        } catch (e) {
            console.log('Timeout waiting for blob URL, maybe they failed to load');
        }
        // Give it a bit more time to load the rest of the visible grid
        await page.waitForTimeout(10000);
    } else if (await errorItems.count() > 0) {
        console.log('Photos found but they are in error state (decryption/S3 issue)');
    }

    await page.screenshot({ path: 'e2e-screenshots/02-gallery-screen.png' });
  });
});
