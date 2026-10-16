import { describe, expect, it } from 'vitest';
import { RegionMask } from './RegionMask';

describe('shared destruction mask', () => {
  it('removes surface collision and counts each cell only once', () => {
    const mask = new RegionMask(256, 256);
    expect(mask.solid(50, 50)).toBe(true);
    const result = mask.damage(50, 50, 16, 123);
    expect(result.removed.length).toBeGreaterThan(100);
    expect(mask.solid(50, 50)).toBe(false);
    expect(mask.solid(90, 50)).toBe(true);
    const percent = mask.percent;
    expect(mask.damage(50, 50, 16, 123).removed.length).toBe(0);
    expect(mask.percent).toBe(percent);
  });
  it('updates all four regions across a seam', () => {
    const mask = new RegionMask(256, 256);
    const result = mask.damage(128, 128, 14, 0);
    expect([...result.dirty].sort()).toEqual([0, 1, 2, 3]);
    for (const [x, y] of [[126,126],[130,126],[126,130],[130,130]]) expect(mask.solid(x, y)).toBe(false);
  });
  it('is deterministic, bounds edge impacts, and restores exactly', () => {
    const a = new RegionMask(256, 256), b = new RegionMask(256, 256);
    const initial = a.cells.slice();
    for (const [x, y] of [[0,0],[255,255],[128,128],[-10,40]]) { a.damage(x,y,24,8); b.damage(x,y,24,8); }
    expect(a.cells).toEqual(b.cells);
    expect(a.percent).toBeGreaterThan(0);
    expect(a.percent).toBeLessThan(100);
    expect(a.solid(-1,0)).toBe(false);
    expect(a.solid(256,0)).toBe(false);
    a.reset(); expect(a.cells).toEqual(initial); expect(a.percent).toBe(0);
  });
  it('rejects invalid damage without altering the mask', () => {
    const mask = new RegionMask(128, 128);
    for (const value of [NaN, Infinity, -Infinity]) expect(mask.damage(value,20,8,1).removed).toHaveLength(0);
    expect(mask.damage(20,20,-1,1).removed).toHaveLength(0);
    expect(mask.damage(200,200,10,1).removed).toHaveLength(0);
    expect(mask.percent).toBe(0);
  });
});
