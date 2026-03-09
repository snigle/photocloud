import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Photos and Albums Flow', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('dialog', async dialog => {
      console.log(`BROWSER DIALOG: [${dialog.type()}] ${dialog.message()}`);
      await dialog.dismiss();
    });
    await page.goto('/');
    const devButton = page.getByRole('button', { name: /Dev 1/i });
    await devButton.click();
    await expect(page).toHaveURL(/.*gallery/, { timeout: 30000 });
  });

  test('should upload a photo, create an album, and then delete both', async ({ page }) => {
    // 1. Upload a photo
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('upload-button').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'assets', 'test-image.jpg'));

    // Wait for the new photo item to appear in the gallery
    const photoItem = page.getByTestId('photo-item').first();
    // Allow up to 2 minutes for upload and thumbnail generation in dev/CI
    await expect(photoItem).toBeVisible({ timeout: 120000 });
    await page.screenshot({ path: 'e2e-screenshots/04-photo-uploaded.png' });

    // 2. Select photo and create album
    await photoItem.hover();
    const indicator = page.getByTestId('selection-indicator').first();
    await expect(indicator).toBeVisible();
    await indicator.click();

    // Now selection mode is active, "Add to album" should be visible
    const addToAlbumButton = page.getByTestId('add-to-album-button');
    await expect(addToAlbumButton).toBeVisible({ timeout: 10000 });
    await addToAlbumButton.click();
    await expect(page.getByText('Ajouter aux albums')).toBeVisible({ timeout: 10000 });

    // In the dialog, create a new album
    await page.screenshot({ path: 'e2e-screenshots/04b-add-to-album-dialog.png' });
    const nouvelAlbumButton = page.getByText('Nouvel album');
    await expect(nouvelAlbumButton).toBeVisible({ timeout: 15000 });
    await nouvelAlbumButton.click();
    const albumTitle = `Album E2E ${Date.now()}`;
    await page.getByTestId('new-album-title-input').fill(albumTitle);
    await page.getByTestId('confirm-create-album-button').click();

    // Verify dialog closed
    await expect(page.getByText('Ajouter aux albums')).not.toBeVisible({ timeout: 15000 });

    // 3. Go to Albums screen and verify
    await page.goto('/#/albums');
    // Force a small wait and potential reload if not found to handle S3 eventual consistency in the index
    try {
        await expect(page.getByTestId('album-item').filter({ hasText: albumTitle })).toBeVisible({ timeout: 10000 });
    } catch (e) {
        console.log('Album not visible after navigation, retrying with reload...');
        await page.reload();
        await expect(page.getByTestId('album-item').filter({ hasText: albumTitle })).toBeVisible({ timeout: 30000 });
    }
    await page.screenshot({ path: 'e2e-screenshots/05-albums-list.png' });

    // 4. Delete the album
    await page.getByText(albumTitle).first().click();
    await expect(page.getByRole('heading', { name: albumTitle })).toBeVisible(); // Header title
    await page.getByTestId('album-menu-button').click();
    await page.getByTestId('delete-album-menu-item').click();
    await page.getByTestId('confirm-delete-album-button').click();

    // Wait to be back on Albums screen
    console.log('Waiting for Albums screen...');
    await expect(page).toHaveURL(/.*\/albums(\/|\?|$)/, { timeout: 30000 });

    // Should be back in Albums list and album should be gone
    try {
        await expect(page.getByTestId('album-item').filter({ hasText: albumTitle })).not.toBeVisible({ timeout: 10000 });
    } catch (e) {
        await page.reload();
        await expect(page.getByTestId('album-item').filter({ hasText: albumTitle })).not.toBeVisible({ timeout: 20000 });
    }
    await page.screenshot({ path: 'e2e-screenshots/06-album-deleted.png' });

    // 5. Delete the photo definitively from gallery
    console.log('Navigating to gallery...');
    await page.goto('/#/gallery');
    await expect(page).toHaveURL(/.*gallery/);

    // Wait for sync to stabilize
    await expect(page.getByText('Mise à jour...')).not.toBeVisible({ timeout: 60000 });
    const photoCountSubtitle = page.getByTestId('photo-count-subtitle');
    await expect(photoCountSubtitle).toBeVisible({ timeout: 30000 });

    // Wait until the count contains "photos" and is not 0
    await expect(photoCountSubtitle).toHaveText(/.* photos/, { timeout: 60000 });
    await expect(photoCountSubtitle).not.toHaveText('0 photos', { timeout: 60000 });

    const countText = await photoCountSubtitle.innerText();
    const initialTotal = parseInt(countText.split(' ')[0]);
    console.log(`Initial total photos: ${initialTotal}`);

    const photoItems = page.getByTestId('photo-item');
    await photoItems.first().hover();
    await page.getByTestId('selection-indicator').first().click();

    await page.getByTestId('delete-photos-button').click();
    await page.getByText('Supprimer', { exact: true }).filter({ visible: true }).click();

    // Verify the header count decremented
    if (initialTotal > 1) {
        await expect(photoCountSubtitle).toHaveText(`${initialTotal - 1} photos`, { timeout: 30000 });
    } else {
        await expect(page.getByText('No photos found.')).toBeVisible({ timeout: 30000 });
    }

    await page.screenshot({ path: 'e2e-screenshots/07-photo-deleted.png' });
  });
});
