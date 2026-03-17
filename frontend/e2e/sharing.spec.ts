import { test, expect } from '@playwright/test';
import path from 'path';
import { expectWithReload, expectNotVisibleWithReload } from './utils';

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
    await page.goto('/#');
    await page.evaluate(() => window.location.hash = '#/albums');
    const albumInList = page.getByTestId('album-item').filter({ hasText: albumTitle });
    await expectWithReload(page, albumInList, { timeout: 15000 });

    // 4. Share the album with Dev 2
    await albumInList.first().click();
    await expect(page.getByRole('heading', { name: albumTitle })).toBeVisible();
    await page.getByTestId('album-menu-button').click();
    await page.getByTestId('share-album-menu-item').click();
    await page.getByTestId('share-email-input').fill('dev2@photocloud.local');
    await page.getByTestId('confirm-share-button').click();

    // Wait for sharing process to complete (cloning thumbnails)
    await expect(page.getByText('Partager l\'album')).not.toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: 'e2e-screenshots/sharing-01-shared-by-dev1.png' });

    // 5. Logout and login as User B (Dev 2)
    await page.goto('/#');
    await page.evaluate(() => window.location.hash = '#/gallery');
    await page.getByTestId('logout-button').first().click();
    await page.getByRole('button', { name: /Dev 2/i }).click();
    await expect(page).toHaveURL(/.*gallery/, { timeout: 30000 });

    // Hard reload to clear all in-memory caches (essential for testing shared discovery)
    await page.reload();

    // 6. Check Albums for the shared album
    await page.goto('/#');
    await page.evaluate(() => window.location.hash = '#/albums');

    // The shared album should be visible in Dev 2's list
    console.log(`Waiting for shared album "${albumTitle}" to appear in recipient list...`);
    const sharedAlbumItem = page.getByTestId('album-item').filter({ hasText: albumTitle });
    await expectWithReload(page, sharedAlbumItem, { timeout: 15000 });

    // Verify it shows as shared (has the emoji if we added it)
    // We use .first() to avoid strict mode violation as multiple albums might be shared
    await expect(sharedAlbumItem.first().getByText('👥')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e-screenshots/sharing-02-received-by-dev2.png' });

    // 7. Verify thumbnails in the shared album
    await sharedAlbumItem.first().click();
    await expect(page.getByRole('heading', { name: albumTitle })).toBeVisible({ timeout: 20000 });
    const sharedPhotoItem = page.getByTestId('photo-item').first();
    await expect(sharedPhotoItem).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: 'e2e-screenshots/sharing-03-album-detail-dev2.png' });

    // 8. Logout Dev 2, Login Dev 1, and delete the album
    await page.goto('/#');
    await page.evaluate(() => window.location.hash = '#/gallery');
    await page.getByTestId('logout-button').first().click();
    await page.getByRole('button', { name: /Dev 1/i }).click();
    await expect(page).toHaveURL(/.*gallery/);

    await page.goto('/#');
    await page.evaluate(() => window.location.hash = '#/albums');
    const albumToDelete = page.getByTestId('album-item').filter({ hasText: albumTitle });
    await albumToDelete.first().click();
    await page.getByTestId('album-menu-button').click();
    await page.getByTestId('delete-album-menu-item').click();
    await page.getByTestId('confirm-delete-album-button').click();

    // Wait to be back on Albums screen
    await expect(page).toHaveURL(/.*\/albums(\/|\?|$)/, { timeout: 30000 });
    await expectNotVisibleWithReload(page, albumToDelete, { timeout: 15000 });

    // 9. Logout Dev 1, Login Dev 2, verify it's gone
    await page.goto('/#');
    await page.evaluate(() => window.location.hash = '#/gallery');
    await page.getByTestId('logout-button').first().click();
    await page.getByRole('button', { name: /Dev 2/i }).click();

    await page.goto('/#');
    await page.evaluate(() => window.location.hash = '#/albums');
    // It might take a moment for S3 to reflect the deletion of the shared copy
    const sharedAlbumInList = page.getByTestId('album-item').filter({ hasText: albumTitle });
    await expectNotVisibleWithReload(page, sharedAlbumInList, { timeout: 15000 });
    await page.screenshot({ path: 'e2e-screenshots/sharing-04-deleted-from-dev2.png' });
  });
});
