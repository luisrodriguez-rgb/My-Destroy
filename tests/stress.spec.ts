import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';

test('one minute of shooting releases fragments and texture frames', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reiniciar' })).toBeEnabled();
  const initial = await page.evaluate(() => (window as any).__MY_DESTROY__.snapshot());
  await page.evaluate(() => {
    const samples: number[] = []; let previous = performance.now();
    (window as any).__frameSamples = samples;
    (window as any).__measureFrames = true;
    const sample = (now: number) => {
      samples.push(now - previous); previous = now;
      if ((window as any).__measureFrames) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const box = (await page.locator('canvas').boundingBox())!;
  const start = Date.now(); let clicks = 0; let maxFragments = 0;
  while (Date.now() - start < 60_000) {
    const x = 75 + (clicks % 21) * 48;
    const y = 75 + (Math.floor(clicks / 21) % 8) * 53;
    await page.mouse.click(box.x + x / 1152 * box.width, box.y + y / 584 * box.height);
    clicks++;
    await page.waitForTimeout(195);
    if (clicks % 10 === 0) maxFragments = Math.max(maxFragments, await page.evaluate(() => (window as any).__MY_DESTROY__.snapshot().fragments));
  }
  const frames = await page.evaluate(() => { (window as any).__measureFrames = false; return (window as any).__frameSamples as number[]; });
  await page.waitForTimeout(1000);
  const settled = await page.evaluate(() => (window as any).__MY_DESTROY__.snapshot());
  expect(settled.shots).toBeGreaterThan(150);
  expect(settled.fragments).toBe(0);
  expect(settled.objects).toBe(initial.objects + settled.debris);
  expect(settled.debris).toBeLessThanOrEqual(120);
  expect(maxFragments).toBeLessThanOrEqual(80);
  await page.getByRole('button', { name: 'Reiniciar' }).click();
  const reset = await page.evaluate(() => (window as any).__MY_DESTROY__.snapshot());
  expect(reset.removed).toBe(0);
  expect(reset.debris).toBe(0);
  expect(reset.objects).toBe(initial.objects);
  expect(errors).toEqual([]);
  frames.sort((a,b) => a-b);
  await mkdir('docs/previews', { recursive: true });
  await writeFile('docs/previews/stress-metrics.json', JSON.stringify({
    test: '60 seconds of real pointer clicks, 1 second settling, then reset',
    browser: browser.version(), system: `${platform()} ${arch()}`, cpu: cpus()[0]?.model,
    viewport: page.viewportSize(), clicks, acceptedShots: settled.shots, hits: settled.hits,
    maxSampledFragments: maxFragments, settledFragments: settled.fragments,
    objectsBefore: initial.objects, objectsAfter: settled.objects,
    sourceFramesBefore: initial.sourceFrames, sourceFramesAfter: settled.sourceFrames,
    requestAnimationFrameMs: { p50: frames[Math.floor(frames.length*.5)], p95: frames[Math.floor(frames.length*.95)], samples: frames.length },
    note: 'Headless Chrome observation, not a performance guarantee for other devices or proof of no heap leaks.',
  }, null, 2) + '\n');
});
