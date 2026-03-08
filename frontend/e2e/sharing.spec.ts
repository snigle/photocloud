import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Album Sharing Flow', () => {
  test.beforeEach(async ({ page }) => {
    // page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    await page.goto('/');
  });

  test('should share an album from Dev 1 to Dev 2 and verify visibility', async ({ page, context }) => {
    // 1. Login as User A (Dev 1)
    await page.getByRole('button', { name: /Dev 1/i }).click();
    await expect(page).toHaveURL(/.*gallery/, { timeout: 30000 });

    // 2. Ensure at least one photo exists, upload if not
    let photoItem = page.getByTestId('photo-item').first();
    const isVisible = await photoItem.isVisible().catch(() => false);
    if (!isVisible) {
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.getByTestId('upload-button').click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(path.join(__dirname, 'assets', 'test-image.jpg'));
        await expect(photoItem).toBeVisible({ timeout: 120000 });
    }

    // 3. Create an album for User A
    await photoItem.hover();
    await page.getByTestId('selection-indicator').first().click();
    await page.getByTestId('add-to-album-button').click();
    await page.getByText('Nouvel album').click();
    const albumTitle = `Shared Album ${Date.now()}`;
    await page.getByTestId('new-album-title-input').fill(albumTitle);
    await page.getByTestId('confirm-create-album-button').click();

    // Verify on Albums screen
    await page.getByTestId('menu-button').click();
    await page.getByRole('button', { name: 'Albums' }).click();
    await expect(page.getByText(albumTitle)).toBeVisible({ timeout: 10000 });

    // 4. Share the album with Dev 2
    await page.getByText(albumTitle).first().click();
    await page.getByTestId('album-menu-button').click();
    await page.getByTestId('share-album-menu-item').click();
    await page.getByTestId('share-email-input').fill('dev2@photocloud.local');
    await page.getByTestId('confirm-share-button').click();

    // Wait for sharing process to complete (cloning thumbnails)
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'e2e-screenshots/sharing-01-shared-by-dev1.png' });

    // 5. Logout and login as User B (Dev 2)
    await page.getByTestId('menu-button').click();
    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await page.getByRole('button', { name: /Dev 2/i }).click();
    await expect(page).toHaveURL(/.*gallery/, { timeout: 30000 });

    // 6. Check Albums for the shared album
    await page.getByTestId('menu-button').click();
    await page.getByRole('button', { name: 'Albums' }).click();

    // The shared album should be visible in Dev 2's list
    await expect(page.getByText(albumTitle)).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'e2e-screenshots/sharing-02-received-by-dev2.png' });

    // 7. Verify thumbnails in the shared album
    await page.getByText(albumTitle).first().click();
    const sharedPhotoItem = page.getByTestId('photo-item').first();
    await expect(sharedPhotoItem).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'e2e-screenshots/sharing-03-album-detail-dev2.png' });
  });
});
