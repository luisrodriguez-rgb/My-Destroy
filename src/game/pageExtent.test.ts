import { expect, it } from 'vitest';
import { PAPER, WORLD } from './tuning';
import { MAX_PAPER_HEIGHT, clampCameraY, foldCount, paperHeightFor, worldForPaper } from './pageExtent';

it('keeps a single fold at the original paper and world size', () => {
  expect(MAX_PAPER_HEIGHT).toBe(PAPER.height * 4);
  expect(MAX_PAPER_HEIGHT).toBe(1952);
  expect(paperHeightFor(100)).toBe(PAPER.height);
  expect(paperHeightFor(PAPER.height)).toBe(488);
  expect(paperHeightFor(PAPER.height + 8)).toBe(488);
  expect(worldForPaper(488)).toEqual({ paperHeight: 488, width: WORLD.width, height: WORLD.height, floor: WORLD.floor });
  expect(foldCount(488)).toBe(1);
});

it('grows taller pages by whole cells up to four folds', () => {
  expect(paperHeightFor(900)).toBe(900);
  expect(paperHeightFor(1001)).toBe(1002);
  expect(paperHeightFor(1952)).toBe(1952);
  expect(paperHeightFor(8000)).toBe(1952);
  expect(paperHeightFor(Number.NaN)).toBe(488);
  expect(foldCount(1952)).toBe(4);

  const tall = worldForPaper(1952);
  const extra = 1952 - PAPER.height;
  expect(tall.paperHeight).toBe(1952);
  expect(tall.width).toBe(WORLD.width);
  expect(tall.height).toBe(WORLD.height + extra);
  expect(tall.floor).toBe(WORLD.floor + extra);
});

it('does not scroll the camera when the page is only one fold', () => {
  expect(clampCameraY(64, WORLD.height)).toBe(0);
  expect(clampCameraY(WORLD.floor - 4, WORLD.height)).toBe(0);
  expect(clampCameraY(2000, WORLD.height)).toBe(0);
});

it('follows the operator and clamps the vertical camera to a tall page', () => {
  const world = worldForPaper(1952);
  const feet = world.floor - 4;
  const bottom = clampCameraY(feet, world.height);
  expect(bottom).toBe(world.height - WORLD.height);
  expect(feet - bottom).toBe(WORLD.floor - 4);

  expect(clampCameraY(64, world.height)).toBe(0);
  const mid = clampCameraY(1000, world.height);
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(world.height - WORLD.height);
  expect(mid).toBeCloseTo(1000 - WORLD.height * 0.72);
});
