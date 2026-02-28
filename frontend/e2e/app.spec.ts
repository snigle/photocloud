import { test, expect } from '@playwright/test';

test.describe('Photo Cloud App', () => {
  test('should login via dev and show gallery', async ({ page }) => {
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
          endpoint: 'https://mock-s3.example.com',
          region: 'mock-region',
          bucket: 'mock-bucket',
          email: 'dev@photocloud.local',
          user_key: 'mock-user-key'
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

    // Wait for the app to load
    await expect(page.getByText('Photo Cloud')).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: 'e2e-screenshots/01-auth-screen.png' });

    // Click "Use Developer Account"
    const devButton = page.getByRole('button', { name: 'Use Developer Account' });
    await devButton.click();

    // Check if we are in the Gallery
    // GalleryScreen should show "No photos found." if count is 0
    await expect(page.getByText('No photos found.')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'e2e-screenshots/02-gallery-screen.png' });
  });
});
