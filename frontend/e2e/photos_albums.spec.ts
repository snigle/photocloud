import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Photos and Albums Flow', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    await page.goto('/');
    const devButton = page.getByRole('button', { name: 'Use Developer Account' });
    await devButton.click();
    await expect(page).toHaveURL(/.*gallery/, { timeout: 30000 });
  });

  test('should upload a photo, create an album, and then delete both', async ({ page }) => {
    // 1. Upload a photo
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('upload-button').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'assets', 'test-image.jpg'));
    await page.waitForTimeout(5000);

    // Wait for upload to complete (progress bar disappears or subtitle updates)
    // We look for the photo in the gallery. PhotoItem has testID="photo-image"
    const photo = page.getByTestId('photo-image').first();
    await expect(photo).toBeVisible({ timeout: 60000 });
    await page.screenshot({ path: 'e2e-screenshots/04-photo-uploaded.png' });

    // 2. Select photo and create album
    // On web, we can click the selection indicator.
    await photo.hover();
    const indicator = page.getByTestId('selection-indicator').first();
    await indicator.click();
    await page.waitForTimeout(1000);

    // Now selection mode is active, "Add to album" should be visible
    const addToAlbumButton = page.getByTestId('add-to-album-button');
    await expect(addToAlbumButton).toBeVisible({ timeout: 10000 });
    await addToAlbumButton.click();

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
    await page.getByTestId('menu-button').click();
    await page.getByRole('button', { name: 'Albums' }).click();
    await expect(page.getByText(albumTitle)).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e-screenshots/05-albums-list.png' });

    // 4. Delete the album
    await page.getByText(albumTitle).first().click();
    await expect(page.getByRole('heading', { name: albumTitle })).toBeVisible(); // Header title
    await page.getByTestId('album-menu-button').click();
    await page.getByTestId('delete-album-menu-item').click();
    await page.getByTestId('confirm-delete-album-button').click();

    // Wait to be back on Albums screen
    console.log('Waiting for Albums screen...');
    await expect(page).toHaveURL(/.*albums/, { timeout: 20000 });

    // Should be back in Albums list and album should be gone
    await expect(page.getByText(albumTitle)).not.toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e-screenshots/06-album-deleted.png' });

    // 5. Delete the photo definitively
    // Use .filter({ visible: true }) to get the button on the current screen
    const menuBtn = page.getByTestId('menu-button').filter({ visible: true }).first();
    await expect(menuBtn).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    console.log('Opening drawer menu...');
    await menuBtn.click();

    console.log('Clicking on Galerie button in drawer...');
    // The drawer might take a moment to animate
    const galerieLink = page.getByRole('button', { name: 'Galerie' });
    await expect(galerieLink).toBeVisible({ timeout: 10000 });
    await galerieLink.click();

    await expect(page).toHaveURL(/.*gallery/);

    // Select the photo again
    await photo.hover();
    await page.getByTestId('selection-indicator').first().click();

    await page.getByTestId('delete-photos-button').click();
    await page.getByRole('button', { name: 'Supprimer' }).click();

    // Photo should eventually disappear
    await expect(photo).not.toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: 'e2e-screenshots/07-photo-deleted.png' });
  });
});
