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
      addDebrisFrame: vi.fn(),
      removeDebrisFrame: vi.fn(),
    };
    return { mockHost, mockImage };
  }

  it('initializes Rapier world and static colliders', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();
    expect(manager.count).toBe(0);
    manager.destroy();
  });

  it('spawns triangular fractured debris and simulates physics', async () => {
    const { mockHost } = createMockHost();
    const manager = new DebrisManager(mockHost);
    await manager.init();

    // Spawn fracture from a hit inside the page area
    manager.spawnFracture(500, 250, 24, 0, 6, 200);
    expect(manager.count).toBeGreaterThan(0);
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
});
