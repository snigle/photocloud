import { expect, Page, Locator } from '@playwright/test';

export async function expectWithReload(
    page: Page,
    locator: Locator,
    options: { timeout?: number; reloadCount?: number } = {}
) {
    const { timeout = 15000, reloadCount = 3 } = options;

    for (let i = 0; i < reloadCount; i++) {
        try {
            await expect(locator).toBeVisible({ timeout });
            return;
        } catch (e) {
            console.log(`[E2E Utils] Element not found, reloading (${i + 1}/${reloadCount})...`);
            await page.reload();
            // Small wait after reload for app to stabilize
            await page.waitForTimeout(2000);
        }
    }

    // Final attempt with full timeout to throw if still not visible
    await expect(locator).toBeVisible({ timeout });
}

export async function expectNotVisibleWithReload(
    page: Page,
    locator: Locator,
    options: { timeout?: number; reloadCount?: number } = {}
) {
    const { timeout = 10000, reloadCount = 3 } = options;

    for (let i = 0; i < reloadCount; i++) {
        try {
            await expect(locator).not.toBeVisible({ timeout });
            return;
        } catch (e) {
            console.log(`[E2E Utils] Element still visible, reloading (${i + 1}/${reloadCount})...`);
            await page.reload();
            await page.waitForTimeout(2000);
        }
    }

    await expect(locator).not.toBeVisible({ timeout });
}
