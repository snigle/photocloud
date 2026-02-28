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
            // Default response for other S3 calls (like ListObjectsV2)
            await route.fulfill({
                status: 200,
                contentType: 'application/xml',
                body: '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>mock-bucket</Name><Prefix></Prefix><KeyCount>0</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>'
            });
        }
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
