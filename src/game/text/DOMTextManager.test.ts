import { describe, it, expect } from 'vitest';
import { DOMTextManager, type TextRunInput } from './DOMTextManager';
import { PAPER } from '../tuning';

describe('DOMTextManager', () => {
  const sampleRuns: TextRunInput[] = [
    {
      id: 'title',
      text: 'Hello World',
      x: 100,
      y: 120,
      fontSize: 24,
      fontFamily: 'Georgia',
      color: '#2c3431',
    },
    {
      id: 'mono-line',
      text: 'ABC 123',
      x: 100,
      y: 200,
      fontSize: 16,
      fontFamily: 'monospace',
      color: '#7b8177',
    },
  ];

  it('loads runs and extracts visible characters skipping spaces', () => {
    const mgr = new DOMTextManager(sampleRuns);
    // 'Hello World' has 10 non-space characters
    // 'ABC 123' has 6 non-space characters
    expect(mgr.totalChars).toBe(16);
    expect(mgr.remainingChars).toBe(16);
    expect(mgr.detachedChars).toBe(0);
  });

  it('calculates valid world coordinates and bounding boxes', () => {
    const mgr = new DOMTextManager([sampleRuns[0]]);
    const firstChar = mgr.splitOnImpact(PAPER.x + 105, PAPER.y + 115, 30);
    expect(firstChar.length).toBeGreaterThan(0);

    const hit = firstChar[0].char;
    expect(hit.worldX).toBe(PAPER.x + hit.paperX);
    expect(hit.worldY).toBe(PAPER.y + hit.paperY);
    expect(hit.width).toBeGreaterThanOrEqual(6);
    expect(hit.height).toBe(24);
    expect(hit.fontFamily).toBe('Georgia');
    expect(hit.color).toBe('#2c3431');
  });

  it('detaches characters within impact blast radius and sorts by distance', () => {
    const mgr = new DOMTextManager(sampleRuns);
    // Impact centered near the first word 'Hello'
    const impactX = PAPER.x + 105;
    const impactY = PAPER.y + 115;
    const results = mgr.splitOnImpact(impactX, impactY, 26, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);

    // Verify distance sorting
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
    }

    // Verify detached count
    expect(mgr.detachedChars).toBe(results.length);
    expect(mgr.remainingChars).toBe(mgr.totalChars - results.length);

    // Repeating impact in same area should not re-detach already detached characters
    const secondWave = mgr.splitOnImpact(impactX, impactY, 26, 5);
    for (const res of secondWave) {
      expect(results.some(r => r.char.id === res.char.id)).toBe(false);
    }
  });

  it('does not detach characters outside the blast radius', () => {
    const mgr = new DOMTextManager(sampleRuns);
    // Blast far away in the bottom right corner
    const results = mgr.splitOnImpact(PAPER.x + 800, PAPER.y + 400, 20);
    expect(results.length).toBe(0);
    expect(mgr.detachedChars).toBe(0);
  });

  it('resets detached characters back to attached state', () => {
    const mgr = new DOMTextManager(sampleRuns);
    mgr.splitOnImpact(PAPER.x + 105, PAPER.y + 115, 50);
    expect(mgr.detachedChars).toBeGreaterThan(0);

    mgr.reset();
    expect(mgr.detachedChars).toBe(0);
    expect(mgr.remainingChars).toBe(mgr.totalChars);
  });
});
