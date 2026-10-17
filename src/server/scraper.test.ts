import { describe, it, expect } from 'vitest';
import {
  prunePlatforms,
  extractDetachables,
  getPresetPage,
  type CandidateElement,
} from './scraper';

describe('Scraper platform pruning & detachables extraction', () => {
  it('filters out elements too narrow or too tall', () => {
    const candidates: CandidateElement[] = [
      { tag: 'span', x: 50, y: 50, width: 30, height: 20 }, // too narrow (< 60)
      { tag: 'div', x: 50, y: 100, width: 200, height: 350 }, // too tall (> 220)
      { tag: 'button', x: 50, y: 150, width: 120, height: 36, text: 'Aceptar' }, // valid
    ];

    const platforms = prunePlatforms(candidates);
    expect(platforms).toHaveLength(1);
    expect(platforms[0].tag).toBe('button');
    expect(platforms[0].width).toBe(120);
  });

  it('enforces minVerticalGap of 42px on horizontally overlapping platforms', () => {
    const candidates: CandidateElement[] = [
      { tag: 'h1', x: 100, y: 100, width: 400, height: 40 },
      // Overlaps horizontally with h1 and vertical distance is only 20px (< 42px) -> must be pruned!
      { tag: 'p', x: 150, y: 120, width: 300, height: 24 },
      // Overlaps horizontally but vertical distance is 60px (>= 42px) -> accepted!
      { tag: 'h2', x: 100, y: 160, width: 400, height: 35 },
      // Does NOT overlap horizontally (x: 600..900 vs 100..500) -> accepted even if same y!
      { tag: 'button', x: 600, y: 110, width: 150, height: 35 },
    ];

    const platforms = prunePlatforms(candidates);
    expect(platforms.some(p => p.tag === 'p')).toBe(false);
    expect(platforms.some(p => p.tag === 'h1')).toBe(true);
    expect(platforms.some(p => p.tag === 'h2')).toBe(true);
    expect(platforms.some(p => p.tag === 'button')).toBe(true);
    expect(platforms).toHaveLength(3);
  });

  it('limits total platforms to a maximum of 14', () => {
    const candidates: CandidateElement[] = [];
    for (let i = 0; i < 30; i++) {
      candidates.push({
        tag: 'div',
        x: 50,
        y: 20 + i * 45,
        width: 300,
        height: 25,
      });
    }

    const platforms = prunePlatforms(candidates);
    expect(platforms.length).toBeLessThanOrEqual(14);
  });

  it('extracts up to 8 detachable media/controls sorted by size', () => {
    const candidates: CandidateElement[] = [
      { tag: 'img', x: 50, y: 50, width: 100, height: 100 },
      { tag: 'button', x: 200, y: 50, width: 80, height: 30 },
      { tag: 'figure', x: 500, y: 100, width: 300, height: 200 }, // largest
      { tag: 'p', x: 50, y: 200, width: 400, height: 50 }, // p is not detachable
    ];

    const detachables = extractDetachables(candidates);
    expect(detachables).toHaveLength(3);
    expect(detachables[0].tag).toBe('figure'); // largest first
    expect(detachables.length).toBeLessThanOrEqual(8);
  });

  it('provides structured presets for offline testing', () => {
    const wiki = getPresetPage('wikipedia');
    expect(wiki.platforms.length).toBeGreaterThan(0);
    expect(wiki.detachables.length).toBeGreaterThan(0);
    expect(wiki.width).toBe(1104);
    expect(wiki.height).toBe(488);

    const gh = getPresetPage('github');
    expect(gh.platforms.length).toBeGreaterThan(0);

    const demo = getPresetPage('demo');
    expect(demo.platforms.length).toBe(7);
  });
});
