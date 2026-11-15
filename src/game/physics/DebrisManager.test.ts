import { describe, it, expect, vi } from 'vitest';
import { DebrisManager, type DebrisHost, type VisualDebris } from './DebrisManager';
import { worldForPaper } from '../pageExtent';
import type { Platform } from '../platforms/demoPlatforms';

describe('DebrisManager (Fracture & Rapier2D Physics)', () => {
  function createMockHost() {
    const mockImage: VisualDebris = {
      setPosition: vi.fn(),
      setRotation: vi.fn(),
      destroy: vi.fn(),
    };
    const mockHost: DebrisHost = {
      createDebrisImage: vi.fn().mockReturnValue(mockImage),
      addDebrisPolygon: vi.fn(),
      addDebrisFrame: vi.fn(),
      addLetterFrame: vi.fn(),
      removeDebrisFrame: vi.fn(),
      onPlatformSegmentCollapse: vi.fn(),
    };
    return { mockHost, mockImage };
  }

  it('initializes Rapier world, thick floor, and segmented platform colliders', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();
    expect(manager.count).toBe(0);
    expect(manager.activeSegmentsCount).toBeGreaterThan(0);
    manager.destroy();
  });

  it('spawns triangular fractured debris with Delaunator and polygon clipping data', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    // Spawn fracture from a hit inside the page area
    manager.spawnFracture(500, 250, 24, 0, 6, 200);
    expect(manager.count).toBeGreaterThan(0);
    expect(mockHost.addDebrisPolygon).toHaveBeenCalled();

    // Check that polygon data contains valid triangular vertices
    const firstCall = vi.mocked(mockHost.addDebrisPolygon!).mock.calls[0][0];
    expect(firstCall.v0).toBeDefined();
    expect(firstCall.v1).toBeDefined();
    expect(firstCall.v2).toBeDefined();
    expect(firstCall.width).toBeGreaterThanOrEqual(8);
    expect(firstCall.height).toBeGreaterThanOrEqual(8);

    const initialCount = manager.count;

    // Simulate several physics steps
    for (let i = 0; i < 30; i++) {
      manager.update();
    }

    // Pieces should still exist and have updated transforms
    expect(manager.count).toBe(initialCount);

    // Reset clears everything
    manager.reset();
    expect(manager.count).toBe(0);
    manager.destroy();
  });

  it('enforces maximum debris capacity to avoid performance degradation', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    // Spawn multiple large fractures exceeding capacity
    for (let i = 0; i < 30; i++) {
      manager.spawnFracture(500, 200, 30, 0, 10, 200);
    }

    expect(manager.count).toBeLessThanOrEqual(manager.maxDebris);
    manager.destroy();
  });

  it('deactivates platform colliders when perforated and wakes up resting debris', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    const initialSegments = manager.activeSegmentsCount;
    expect(initialSegments).toBeGreaterThan(0);

    // Simulate destruction of the first platform area
    manager.syncPlatforms((x, y) => {
      // Perforate everything around x=100..200
      if (x >= 90 && x <= 220) return false;
      return true;
    });

    expect(manager.activeSegmentsCount).toBeLessThan(initialSegments);

    // Simulate repair of the platform surface -> all segments should reactivate
    manager.syncPlatforms(() => true);
    expect(manager.activeSegmentsCount).toBe(initialSegments);

    manager.destroy();
  });

  it('applies radial blast impulse to nearby debris bodies', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    manager.spawnFracture(500, 250, 30, 0, 6, 200);
    expect(manager.count).toBeGreaterThan(0);

    // Apply blast impulse at (500, 250)
    expect(() => {
      manager.applyBlastImpulse(500, 250, 50, 450);
    }).not.toThrow();

    manager.destroy();
  });

  it('spawns dynamic letter debris with custom frame and physics properties', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    manager.spawnLetterDebris(
      {
        id: 'c-1',
        char: 'W',
        x: 400,
        y: 200,
        width: 14,
        height: 20,
        fontSize: 20,
        fontFamily: 'Georgia',
        color: '#2c3431',
      },
      'letter-c-1',
      -Math.PI / 3,
      180
    );

    expect(manager.count).toBe(1);
    expect(mockHost.addLetterFrame).toHaveBeenCalledWith(
      'letter-c-1',
      expect.objectContaining({ char: 'W', id: 'c-1' })
    );
    expect(mockHost.createDebrisImage).toHaveBeenCalledWith(407, 210, 'letter-c-1', 0.5, 0.5);

    // Step physics
    for (let i = 0; i < 15; i++) {
      manager.update();
    }
    expect(manager.count).toBe(1);

    manager.destroy();
  });

  it('applies gravitational vortex pull and swallows matter in event horizon', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    manager.spawnLetterDebris(
      {
        id: 'c-2',
        char: 'X',
        x: 400,
        y: 200,
        width: 14,
        height: 20,
        fontSize: 20,
        fontFamily: 'Georgia',
        color: '#2c3431',
      },
      'letter-c-2',
      0,
      10
    );

    expect(manager.count).toBe(1);

    // Apply vortex pull near the letter at (405, 205)
    manager.applyVortexPull(405, 205, 100, 300, 0.016);

    // Because distance is < 14px, it should be annihilated in the event horizon
    expect(manager.count).toBe(0);

    manager.destroy();
  });

  it('spawns fracture debris on a page taller than one fold', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    manager.spawnFracture(500, 1200, 24, 0, 6, 200);
    expect(manager.count).toBe(0);

    const world = worldForPaper(1952);
    manager.setWorldExtent(world.height, world.floor - 4, world.paperHeight);
    manager.spawnFracture(500, 1200, 24, 0, 6, 200);
    expect(manager.count).toBeGreaterThan(0);
    manager.destroy();
  });

  it('collapses segment when overloaded with debris and invokes onPlatformSegmentCollapse', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    const glassPlatform: Platform = {
      id: 'fragile-glass-shelf',
      name: 'Glass Shelf',
      x: 100,
      y: 300,
      width: 48, // 2 segments: [100..124] (cx=112), [124..148] (cx=136)
      height: 10,
      material: 'glass',
      oneWay: true,
    };
    manager.setPlatforms([glassPlatform]);
    expect(manager.activeSegmentsCount).toBe(2);

    // Glass maxLoad is 4: spawn 5 detachables directly over the first segment (cx=112, cy=302)
    for (let i = 0; i < 5; i++) {
      manager.spawnDetachable(
        {
          id: `weight-${i}`,
          x: 106,
          y: 290,
          width: 12,
          height: 12,
          tag: 'button',
        },
        `frame-weight-${i}`,
      );
    }
    expect(manager.count).toBe(5);

    // Check overload (simulating update() / checkDebrisOverload())
    const collapsed = manager.checkDebrisOverload();
    expect(collapsed).toBe(1);
    expect(manager.activeSegmentsCount).toBe(1);

    expect(mockHost.onPlatformSegmentCollapse).toHaveBeenCalledWith(
      expect.objectContaining({
        platformId: 'fragile-glass-shelf',
        cx: 112,
        cy: 302,
        material: 'glass',
      }),
    );

    manager.destroy();
  });

  it('collapses isolated cantilevered islands on fragile glass platforms and invokes onPlatformSegmentCollapse', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    // Configure a glass platform with >= 4 segments (width: 96 = 4 segments of 24px: 0, 1, 2, 3)
    const glassPlatform: Platform = {
      id: 'glass-bridge',
      name: 'Glass Bridge',
      x: 100,
      y: 200,
      width: 96,
      height: 10,
      material: 'glass',
      oneWay: true,
    };
    manager.setPlatforms([glassPlatform]);
    expect(manager.activeSegmentsCount).toBe(4);

    // Puncture adjacent segments (indices 0 and 2) leaving segment 1 (x: 124..148, cx=136) as an isolated island
    // Seg 0: x in [100, 124)
    // Seg 1: x in [124, 148) -> intact island
    // Seg 2: x in [148, 172)
    // Seg 3: x in [172, 196) -> supported end
    manager.syncPlatforms((x, _y) => {
      if ((x >= 100 && x < 124) || (x >= 148 && x < 172)) {
        return false; // Holes flanking segment 1
      }
      return true;
    });

    // Segment 0, 2 are destroyed by puncture; segment 1 collapses due to structural instability!
    // Only segment 3 remains active.
    expect(manager.activeSegmentsCount).toBe(1);

    expect(mockHost.onPlatformSegmentCollapse).toHaveBeenCalledWith(
      expect.objectContaining({
        platformId: 'glass-bridge',
        cx: 136,
        cy: 202,
        material: 'glass',
      }),
    );

    manager.destroy();
  });
});
