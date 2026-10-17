import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('captures high-res live screenshot with triangular debris, underlayer, and bayer dither', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.locator('canvas').focus();

  async function fire(x: number, y: number) {
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + (x / 1152) * box.width, box.y + (y / 584) * box.height);
  }

  // 1. Pistol precision shots on the main headline
  for (const [x, y] of [[700, 180], [740, 185], [780, 180], [830, 190], [870, 180]]) {
    await fire(x, y);
    await page.waitForTimeout(140);
  }

  // 2. Switch to Shotgun ('2') for wide spread destruction across the middle article
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(100);

  for (const [x, y] of [
    [720, 240], [760, 270], [810, 250], [860, 260],
    [650, 310], [700, 320], [750, 330], [820, 310], [880, 330],
    [580, 360], [630, 380], [690, 370], [770, 380],
  ]) {
    await fire(x, y);
    await page.waitForTimeout(220);
  }

  // 3. Switch to Grenade launcher ('3') for massive cratering & explosive scatter
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(100);

  // Grenade into the right editorial column
  await fire(850, 340);
  await page.waitForTimeout(800);

  // Grenade onto the footer shelf / debris pile
  await fire(720, 420);
  await page.waitForTimeout(850);

  // Grenade into middle section
  await fire(620, 260);
  await page.waitForTimeout(900);

  // Allow Rapier2D physics to settle debris pieces
  await page.waitForTimeout(1500);

  // Check state
  const state = await page.evaluate(() => (window as any).__MY_DESTROY__.snapshot());
  expect(state.debris).toBeGreaterThan(0);
  expect(state.percent).toBeGreaterThan(2);

  // Ensure previews directory exists and save high-res screenshot
  await mkdir('docs/previews', { recursive: true });
  await page.screenshot({ path: 'docs/previews/debris-dither-live.png', fullPage: true });
});
