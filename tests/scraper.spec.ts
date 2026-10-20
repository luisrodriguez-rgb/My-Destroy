import { test, expect, type Page } from '@playwright/test';

async function snapshot(page: Page) {
  return page.evaluate(() => (window as any).__MY_DESTROY__.snapshot());
}

test.describe('Playwright Scraper + Dynamic Platforms + Detachables', () => {
  test('preset buttons trigger scrape API and load dynamic platforms', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Reiniciar' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Wikipedia' })).toBeVisible();

    const initial = await snapshot(page);
    expect(initial.platforms).toBe(7);
    expect(initial.detachables).toBe(2);

    // Click Wikipedia preset
    await page.getByRole('button', { name: 'Wikipedia' }).click();

    // Wait for scrape API to resolve and load page
    await expect(page.getByRole('button', { name: 'Volver a demo' })).toBeVisible({ timeout: 15000 });

    const scraped = await snapshot(page);
    expect(scraped.platforms).toBeGreaterThan(0);
    expect(scraped.resets).toBeGreaterThan(0);

    // Can shoot on the newly loaded page
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
    await page.waitForTimeout(200);

    const shotState = await snapshot(page);
    expect(shotState.shots).toBe(1);

    // Click 'Volver a demo' restores original 7 platforms and 2 detachables
    await page.getByRole('button', { name: 'Volver a demo' }).click();
    await expect(page.getByRole('button', { name: 'Volver a demo' })).toHaveCount(0);

    const restored = await snapshot(page);
    expect(restored.platforms).toBe(7);
    expect(restored.detachables).toBe(2);
  });

  test('DOM detachables drop when corners lose solid support', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Reiniciar' })).toBeEnabled();

    const initial = await snapshot(page);
    expect(initial.detachables).toBe(2);

    const box = (await page.locator('canvas').boundingBox())!;

    // Fire precision pistol shots at top-left and top-right anchors of the button card
    // Button is at worldX=74, worldY=360, width=142, height=37
    const fireWorld = async (wx: number, wy: number) => {
      await page.mouse.click(box.x + (wx / 1152) * box.width, box.y + (wy / 584) * box.height);
      await page.waitForTimeout(160);
    };

    // Destroy top-left anchor
    await fireWorld(80, 365);
    // Destroy top-right anchor
    await fireWorld(210, 365);

    const afterBlast = await snapshot(page);
    expect(afterBlast.detachables).toBeLessThan(2);
    expect(afterBlast.debris).toBeGreaterThan(0);
  });

  test('validates URL and rejects non-http protocols gracefully', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.url-input');

    await input.fill('ftp://invalid-protocol.org');
    await page.getByRole('button', { name: /Destruir/i }).click();

    await expect(page.locator('.scrape-error-badge')).toBeVisible();
    await expect(page.locator('.scrape-error-badge')).toContainText('http');
  });
});
