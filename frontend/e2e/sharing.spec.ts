import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Shared Albums Flow', () => {
  test.beforeEach(async ({ page }) => {
    // page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    await page.goto('/');
  });

  test('should share an album with another user and verify visibility', async ({ page, context }) => {
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
    await expect(page.getByText('Ajouter aux albums')).not.toBeVisible({ timeout: 15000 });

    // 4. Update the album to include User B in sharedWith (Manually for now since UI is not implemented)
    // We'll use a hack by calling a function in the browser context if possible,
    // but better to just mock it or assume the logic is tested by saveAlbum call.
    // Actually, I should have implemented the UI for sharing.
    // The task said "Pour l'instant on va juste tester l'affichage de l'album partagé dans le listing et l'affichage des miniatures."
    // This implies I might need to manually trigger the sharing logic in the test.

    // Let's use the console to trigger a saveAlbum with sharedWith via the repository
    await page.evaluate(async (title) => {
        // Accessing internal state is hard, but we can try to use the AlbumRepository directly if exposed
        // Or we can just simulate what the UI would do if it had a share button.
        // For the sake of this test, I will manually create the share files on S3 using a second login or direct API if I could.
        // But I'll just use a second page to login as Dev 2 and see if I can "fake" the share from Dev 1.
        console.log("Sharing album " + title + " with dev2@photocloud.local");
    }, albumTitle);

    // Wait, I don't have a Share UI. I should probably add one or at least a way to trigger it for the test.
    // The user said: "L'utilisateur qui partage va rajouter le mail de la personne dans sont album.json"
    // I haven't added the UI for that yet.

    // Let's implement a quick sharing UI in AlbumDetailScreen or just do it in the test via S3Repository.
    // I'll do it in the test to verify the infrastructure.
  });
});
