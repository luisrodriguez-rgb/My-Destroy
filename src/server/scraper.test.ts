import { describe, it, expect } from 'vitest';
import {
  prunePlatforms,
  extractDetachables,
  getPresetPage,
  isPrivateOrReservedIp,
  validateUrlTarget,
  assertPublicHostname,
  scrapeUrl,
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

  it('blocks private, loopback, link-local, metadata, and IPv6 local IP ranges (SSRF protection)', () => {
    // Blocked private/reserved IPs
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.50')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);

    // Allowed public IPs
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('rejects non-HTTP protocols, credentials, localhost, and private IP targets in validateUrlTarget', () => {
    expect(() => validateUrlTarget('ftp://example.com')).toThrow(/protocolos http/i);
    expect(() => validateUrlTarget('file:///etc/passwd')).toThrow(/protocolos http/i);
    expect(() => validateUrlTarget('http://user:pass@example.com')).toThrow(/credenciales/i);
    expect(() => validateUrlTarget('http://localhost:5173')).toThrow(/privadas o locales/i);
    expect(() => validateUrlTarget('http://127.0.0.1:8080')).toThrow(/privadas o locales/i);
    expect(() => validateUrlTarget('http://169.254.169.254/latest/meta-data/')).toThrow(/privadas o locales/i);
    expect(() => validateUrlTarget('http://[::1]:3000')).toThrow(/privadas o locales/i);

    const valid = validateUrlTarget('es.wikipedia.org');
    expect(valid.href).toBe('https://es.wikipedia.org/');
  });

  it('detects DNS rebinding to private IPs in assertPublicHostname and scrapeUrl', async () => {
    await expect(
      assertPublicHostname('evil-rebind.example.com', async () => [{ address: '127.0.0.1' }])
    ).rejects.toThrow(/privadas o locales/i);

    await expect(
      assertPublicHostname('valid.example.com', async () => [{ address: '93.184.216.34' }])
    ).resolves.toBeUndefined();

    await expect(scrapeUrl('http://127.0.0.1:5173')).rejects.toThrow(/privadas o locales/i);
    await expect(scrapeUrl('http://localhost:3000')).rejects.toThrow(/privadas o locales/i);
  });
});
