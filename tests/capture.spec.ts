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

test('captures real scraped Wikipedia destruction with dynamic platforms and falling detachable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Reiniciar' })).toBeEnabled();

  // 1. Click Wikipedia preset
  await page.getByRole('button', { name: 'Wikipedia' }).click();
  await expect(page.getByRole('button', { name: 'Volver a demo' })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);

  async function fire(x: number, y: number) {
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + (x / 1152) * box.width, box.y + (y / 584) * box.height);
  }

  // 2. Precision pistol shots on the main title and right summary card
  for (const [x, y] of [[200, 75], [260, 75], [750, 150], [820, 160]]) {
    await fire(x, y);
    await page.waitForTimeout(220);
  }

  // 3. Switch to Shotgun ('2') for blast across the image gallery and middle section
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(100);

  for (const [x, y] of [[650, 350], [720, 360], [800, 350]]) {
    await fire(x, y);
    await page.waitForTimeout(420);
  }

  // 4. Detach button/card: target corners of detachable button at x=48+24=72, y=245+22=267
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(100);
  await fire(80, 275);
  await page.waitForTimeout(220);
  await fire(260, 275);
  await page.waitForTimeout(220);

  // 5. Grenade launcher ('3') for cratering
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(100);
  await fire(750, 340);
  await page.waitForTimeout(1000);

  // Allow Rapier2D physics to settle debris pieces
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => (window as any).__MY_DESTROY__.snapshot());
  expect(state.shots).toBeGreaterThan(0);
  expect(state.percent).toBeGreaterThan(0.5);

  await mkdir('docs/previews', { recursive: true });
  await page.screenshot({ path: 'docs/previews/scraped-wikipedia-destroyed.png', fullPage: true });
});

test('captures DOM text splitting with tumbling letter physics', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Reiniciar' })).toBeEnabled();
  await page.locator('canvas').focus();

  async function fire(x: number, y: number) {
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + (x / 1152) * box.width, box.y + (y / 584) * box.height);
  }

  // Shoot into the large headline "Internet, hecho pedazos."
  for (const [x, y] of [[110, 195], [170, 195], [230, 195]]) {
    await fire(x, y);
    await page.waitForTimeout(220);
  }

  // Shoot into 'hecho pedazos.'
  for (const [x, y] of [[120, 260], [180, 260], [250, 260]]) {
    await fire(x, y);
    await page.waitForTimeout(220);
  }

  // Shoot into paragraph text
  for (const [x, y] of [[120, 300], [220, 315]]) {
    await fire(x, y);
    await page.waitForTimeout(220);
  }

  // Allow letters and debris to tumble and settle with Rapier2D physics
  await page.waitForTimeout(1600);

  const state = await page.evaluate(() => (window as any).__MY_DESTROY__.snapshot());
  expect(state.textDetached).toBeGreaterThan(10);

  await mkdir('docs/previews', { recursive: true });
  await page.screenshot({ path: 'docs/previews/dom-text-splitting.png', fullPage: true });
});


