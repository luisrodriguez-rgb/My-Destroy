import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function snapshot(page: Page) { return page.evaluate(() => (window as any).__MY_DESTROY__.snapshot()); }
async function fire(page: Page, x: number, y: number) {
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + x / 1152 * box.width, box.y + y / 584 * box.height);
}

test('recovered art direction renders on desktop and mobile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/reference/art-direction.html');
  await page.evaluate(() => document.fonts.ready);
  await mkdir('My-Destroy-recuperado/docs', { recursive: true });
  await page.screenshot({ path: 'My-Destroy-recuperado/docs/art-direction-preview.png', fullPage: true });
  expect(await page.evaluate(() => document.fonts.check('16px Pixelify'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

test('real pointer input makes a hole, respects that hole, resets, and scales', async ({ page }) => {
  const errors: string[] = []; const failed: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failed.push(r.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reiniciar' })).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(1);
  await mkdir('docs/previews', { recursive: true });
  await page.screenshot({ path: 'docs/previews/scene-intact.png', fullPage: true });
  const before = await page.locator('canvas').screenshot();
  await fire(page, 825, 220);
  await expect.poll(async () => (await snapshot(page)).hits).toBe(1);
  expect(await page.evaluate(() => (window as any).__MY_DESTROY__.solid(825,220))).toBe(false);
  const damaged = await snapshot(page);
  expect(damaged.removed).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  await fire(page, 825, 220);
  await expect.poll(async () => (await snapshot(page)).shots).toBe(2);
  expect((await snapshot(page)).removed).toBe(damaged.removed);
  expect((await snapshot(page)).hits).toBe(1);
  expect(before.equals(await page.locator('canvas').screenshot())).toBe(false);

  for (const [x,y] of [[780,210],[820,260],[862,220],[780,260],[862,265],[810,305],[901,255],[830,175]]) {
    await page.waitForTimeout(185); await fire(page,x,y);
  }
  await page.mouse.move(0,0);
  await page.waitForTimeout(800);
  expect((await snapshot(page)).fragments).toBe(0);
  await page.screenshot({ path: 'docs/previews/scene-damaged.png', fullPage: true });
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(page.getByText('El caos puede esperar.')).toBeVisible();
  const pausedShots = (await snapshot(page)).shots;
  await fire(page, 500, 100);
  expect((await snapshot(page)).shots).toBe(pausedShots);
  await page.getByRole('button', { name: 'Continuar', exact: true }).first().click();

  await page.getByRole('button', { name: 'Sonido activado' }).click();
  expect((await snapshot(page)).muted).toBe(true);
  await page.getByRole('button', { name: 'Efectos suaves' }).click();
  expect((await snapshot(page)).reducedMotion).toBe(true);
  for (let i=0;i<10;i++) await page.getByRole('button', { name: 'Reiniciar' }).click();
  const reset = await snapshot(page);
  expect(reset).toMatchObject({ shots:0, hits:0, percent:0, removed:0, fragments:0, muted:true, reducedMotion:true, resets:10 });
  expect(await page.evaluate(() => (window as any).__MY_DESTROY__.solid(825,220))).toBe(true);
  await page.keyboard.down('d'); await page.waitForTimeout(150); await page.keyboard.up('d');
  expect((await snapshot(page)).playerX).toBeGreaterThan(350);
  await page.keyboard.press('r'); expect((await snapshot(page)).playerX).toBe(350);
  await page.setViewportSize({ width: 960, height: 900 });
  await fire(page, 500, 200);
  await expect.poll(async () => (await snapshot(page)).hits).toBe(1);
  expect(await page.evaluate(() => (window as any).__MY_DESTROY__.solid(500,200))).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await snapshot(page)).paused).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/previews/scene-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]); expect(failed).toEqual([]);
});

test('player jumps onto destructible platform and falls when destroyed underneath', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(1);
  const canvas = page.locator('canvas');
  await canvas.click();

  // Initial state on catwalk
  const initial = await snapshot(page);
  expect(initial.playerY).toBe(530);
  expect(initial.onGround).toBe(true);

  // Jump with Space or W
  await page.keyboard.press('Space');
  // Wait brief moment for jump to ascend and land on footer-shelf (y = 451)
  await expect.poll(async () => (await snapshot(page)).playerY).toBeLessThan(530);

  // Wait for landing on the footer shelf (y = 451)
  await expect.poll(async () => (await snapshot(page)).playerY, { timeout: 3000 }).toBe(451);
  const onPlatform = await snapshot(page);
  expect(onPlatform.onGround).toBe(true);
  expect(onPlatform.platform).toBe('footer-shelf');

  // Shoot the platform right under the player's position (x=350, y=451)
  await fire(page, 350, 451);
  await expect.poll(async () => (await snapshot(page)).hits).toBeGreaterThan(0);

  // The platform was destroyed at this spot -> player should lose footing and fall back to catwalk (530)
  await expect.poll(async () => (await snapshot(page)).playerY, { timeout: 3000 }).toBe(530);
  const landedCatwalk = await snapshot(page);
  expect(landedCatwalk.onGround).toBe(true);
  expect(landedCatwalk.platform).toBe('catwalk');
});

