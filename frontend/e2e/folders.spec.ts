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
          access: 'mock-access-key',
          secret: 'mock-secret-key',
          endpoint: 'http://localhost:8081/mock-s3', // Use local mock
          region: 'mock-region',
          bucket: 'mock-bucket',
          email: 'dev@photocloud.local',
          user_key: 'bW9jay11c2VyLWtleS1tdXN0LWJlLTMyLWJ5dGVzLWxvbmc=' // Base64 mock user key
        })
      });
    });

    // Mock S3 calls
    await page.route('**/mock-s3/**', async (route) => {
        const url = route.request().url();
        if (url.includes('index.json')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ years: [{ year: '2024', count: 0 }] })
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: 'application/xml',
                body: '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>mock-bucket</Name><Prefix></Prefix><KeyCount>0</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>'
            });
        }
    });

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
