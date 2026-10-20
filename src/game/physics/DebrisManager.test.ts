import { describe, it, expect, vi } from 'vitest';
import { DebrisManager, type DebrisHost, type VisualDebris } from './DebrisManager';

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
});
