import { test, expect } from '@playwright/test';

test.describe('Folders Screen', () => {
  test('should navigate to folders and show list', async ({ page }) => {
    await page.goto('/');

    // Click "Use Developer Account"
    const devButton = page.getByRole('button', { name: 'Use Developer Account' });
    await devButton.click();

    // Open drawer
    const menuButton = page.getByLabel('Menu');
    await expect(menuButton).toBeVisible({ timeout: 15000 });
    await menuButton.click();

    // Click on "Dossiers" in drawer
    const foldersButton = page.getByRole('button', { name: 'Dossiers' });
    await expect(foldersButton).toBeVisible({ timeout: 10000 });
    await foldersButton.click();

    // Check if we are in the Dossiers screen
    await expect(page.getByRole('heading', { name: 'Dossiers' })).toBeVisible();

    // In e2e test environment (browser), MediaLibrary.getFoldersAsync() will return empty array
    // but the screen should show the empty component
    await expect(page.getByText('Aucun dossier trouvé ou permission refusée.')).toBeVisible();

    await page.screenshot({ path: 'e2e-screenshots/03-folders-screen.png' });
  });
});
