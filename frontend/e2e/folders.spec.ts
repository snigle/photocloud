import { test, expect } from '@playwright/test';

test.describe('Folders Screen', () => {
  test('should navigate to folders and show list', async ({ page }) => {
    // Mock the backend API version call
    await page.route('**/version', async (route) => {
      await route.fulfill({ body: 'e2e-test-version' });
    });

    // Mock dev login
    await page.route('**/auth/dev', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessKeyId: 'mock-access-key',
          secretAccessKey: 'mock-secret-key',
          sessionToken: 'mock-session-token',
          endpoint: 'https://mock-s3.example.com',
          region: 'mock-region',
          bucket: 'mock-bucket',
          email: 'dev@photocloud.local'
        })
      });
    });

    // Mock S3 index.json
    await page.route('**/mock-bucket/users/dev@photocloud.local/index.json', async (route) => {
       await route.fulfill({
         status: 200,
         contentType: 'application/json',
         body: JSON.stringify({ years: [{ year: '2024', count: 0 }] })
       });
    });

    await page.goto('/');

    // Click "Use Developer Account"
    const devButton = page.getByRole('button', { name: 'Use Developer Account' });
    await devButton.click();

    // Open drawer
    // In web, the drawer might be accessible via a button or swipe
    const menuButton = page.getByRole('button').first(); // The menu button we added
    await menuButton.click();

    // Click on "Dossiers" in drawer
    await page.getByRole('button', { name: 'Dossiers' }).click();

    // Check if we are in the Dossiers screen
    await expect(page.getByText('Choisissez les dossiers à synchroniser')).toBeVisible();

    // In e2e test environment (browser), MediaLibrary.getFoldersAsync() will return empty array
    // but the screen should show the empty component
    await expect(page.getByText('Aucun dossier trouvé ou permission refusée.')).toBeVisible();

    await page.screenshot({ path: 'e2e-screenshots/03-folders-screen.png' });
  });
});
