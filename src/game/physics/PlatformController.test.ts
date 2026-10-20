import { describe, expect, it } from 'vitest';
import { PlatformController } from './PlatformController';
import type { Platform } from '../platforms/demoPlatforms';

describe('PlatformController', () => {
  const dummyPlatforms: Platform[] = [
    {
      id: 'test-plat-1',
      name: 'Test Platform 1',
      x: 100,
      y: 400,
      width: 200,
      height: 10,
      oneWay: true,
    },
    {
      id: 'test-plat-2',
      name: 'Test Platform 2',
      x: 350,
      y: 300,
      width: 150,
      height: 10,
      oneWay: true,
    },
  ];

  it('moves horizontally and clamps within world bounds', () => {
    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [],
      isSolid: () => true,
    }, 100);

    controller.update({ moveX: 1, jump: false, drop: false, dt: 0.1 });
    expect(controller.x).toBeGreaterThan(100);

    // Clamp at maximum boundary
    for (let i = 0; i < 50; i++) {
      controller.update({ moveX: 1, jump: false, drop: false, dt: 0.5 });
    }
    expect(controller.x).toBe(1104);
  });

  it('jumps upward with jump force and falls under gravity', () => {
    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [],
      isSolid: () => true,
    }, 350, 530);

    expect(controller.onGround).toBe(true);

    // Jump
    controller.update({ moveX: 0, jump: true, drop: false, dt: 0.016 });
    expect(controller.vy).toBeLessThan(0);
    expect(controller.onGround).toBe(false);
    expect(controller.y).toBeLessThan(530);

    // In mid-air gravity accelerates downwards
    const currentVy = controller.vy;
    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.05 });
    expect(controller.vy).toBeGreaterThan(currentVy);
  });

  it('lands on an intact platform when falling downwards', () => {
    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: dummyPlatforms,
      isSolid: () => true,
    }, 150, 380); // 20px above test-plat-1 (y=400)

    controller.onGround = false;
    controller.vy = 200; // falling

    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.15 });

    expect(controller.onGround).toBe(true);
    expect(controller.y).toBe(400);
    expect(controller.currentPlatformId).toBe('test-plat-1');
    expect(controller.vy).toBe(0);
  });

  it('falls through a platform if the mask at that position is destroyed', () => {
    // Hole between x=140 and x=180
    const destroyedHole = (x: number) => x >= 140 && x <= 180;

    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: dummyPlatforms,
      isSolid: (x, y) => !destroyedHole(x),
    }, 150, 380); // Falling directly into the hole!

    controller.onGround = false;
    controller.vy = 200;

    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.15 });

    // Should NOT land on test-plat-1 (y=400) because it was destroyed!
    expect(controller.onGround).toBe(false);
    expect(controller.y).toBeGreaterThan(400);
    expect(controller.currentPlatformId).not.toBe('test-plat-1');
  });

  it('detects when standing platform is destroyed underneath and starts falling', () => {
    let platformIntact = true;

    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: dummyPlatforms,
      isSolid: () => platformIntact,
    }, 150, 400);

    controller.onGround = true;
    controller.currentPlatformId = 'test-plat-1';

    // While intact, player remains on ground
    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });
    expect(controller.onGround).toBe(true);
    expect(controller.y).toBe(400);

    // Gunshot creates a hole right under player!
    platformIntact = false;
    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });

    // Platform lost support -> player starts falling
    expect(controller.onGround).toBe(false);
    expect(controller.currentPlatformId).toBeNull();

    // Next frames apply gravity until landing on catwalk (530)
    for (let i = 0; i < 30; i++) {
      controller.update({ moveX: 0, jump: false, drop: false, dt: 0.05 });
    }

    expect(controller.onGround).toBe(true);
    expect(controller.y).toBe(530);
    expect(controller.currentPlatformId).toBe('catwalk');
  });

  it('drops through one-way platform when drop is requested', () => {
    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: dummyPlatforms,
      isSolid: () => true,
    }, 150, 400);

    controller.onGround = true;
    controller.currentPlatformId = 'test-plat-1';

    controller.update({ moveX: 0, jump: false, drop: true, dt: 0.016 });

    expect(controller.onGround).toBe(false);
    expect(controller.currentPlatformId).toBeNull();
    expect(controller.y).toBeGreaterThan(400);
  });

  it('finds nearest solid ground below for shadow projection', () => {
    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: dummyPlatforms,
      isSolid: () => true,
    }, 150, 200);

    // In air above test-plat-1 (y=400)
    const ground = controller.findGroundBelow();
    expect(ground.y).toBe(400);
    expect(ground.platformId).toBe('test-plat-1');

    // Over empty space outside platforms
    controller.x = 50; // outside x=100..300
    const catwalkGround = controller.findGroundBelow();
    expect(catwalkGround.y).toBe(530);
    expect(catwalkGround.platformId).toBe('catwalk');
  });

  it('updates platform list dynamically via setPlatforms', () => {
    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [],
      isSolid: () => true,
    }, 200, 250);

    expect(controller.findGroundBelow().platformId).toBe('catwalk');

    controller.setPlatforms([
      {
        id: 'new-dynamic-plat',
        name: 'Dynamic Scraped Platform',
        x: 150,
        y: 350,
        width: 100,
        height: 12,
        oneWay: true,
      },
    ]);

    const ground = controller.findGroundBelow();
    expect(ground.y).toBe(350);
    expect(ground.platformId).toBe('new-dynamic-plat');
  });

  it('engages jetpack thrust when holding jump in mid-air to fly upward and clamps at ceiling', () => {
    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [],
      isSolid: () => true,
    }, 350, 530);

    // Initial jump from floor
    controller.update({ moveX: 0, jump: true, drop: false, dt: 0.016 });
    expect(controller.onGround).toBe(false);

    // Continue holding jump in mid-air -> triggers jetpack
    controller.update({ moveX: 0, jump: true, drop: false, dt: 0.05 });
    expect(controller.isJetpacking).toBe(true);
    expect(controller.vy).toBeLessThan(0);

    // Fly continuously upward
    for (let i = 0; i < 40; i++) {
      controller.update({ moveX: 0, jump: true, drop: false, dt: 0.05 });
    }

    // Climbs all the way up and clamps cleanly at minY (64)
    expect(controller.y).toBe(64);
    expect(controller.vy).toBe(0);
    expect(controller.isJetpacking).toBe(true);

    // Release jump -> stops jetpack and falls
    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.05 });
    expect(controller.isJetpacking).toBe(false);
    expect(controller.vy).toBeGreaterThan(0);
  });
});

