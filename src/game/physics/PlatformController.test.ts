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

  it('supports multi-stratum crater footing on thick platforms and falls when fully punctured', () => {
    // Platform height: 12, top crust y = 400 + 2 = 402 is destroyed, but inner stratum y = 400 + 6 = 406 is solid
    const thickPlatform: Platform = {
      id: 'thick-slab',
      name: 'Thick Concrete Slab',
      x: 100,
      y: 400,
      width: 200,
      height: 12,
      material: 'concrete',
      oneWay: true,
    };

    let innerStratumSolid = true;

    // Crust at platform.y + 2 (402) is destroyed around player x=150 (foot offsets [-6, 0, 6] -> 144..156)
    // Inner stratum at platform.y + 6 (406) is solid initially
    const isSolid = (_x: number, y: number) => {
      if (y === 402) {
        // Destroyed top crust
        return false;
      }
      if (y === 406 || y === 410) {
        return innerStratumSolid;
      }
      return true;
    };

    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [thickPlatform],
      isSolid,
    }, 150, 400);
    controller.currentPlatformId = 'thick-slab';
    controller.currentMaterial = 'concrete';

    // Initial update on platform
    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });

    // Multi-layer footing: sunken into crater at dy - 2 = 6 - 2 = 4
    expect(controller.onGround).toBe(true);
    expect(controller.craterDepth).toBe(4);
    expect(controller.y).toBe(404); // platform.y (400) + depthOffset (4)
    expect(controller.currentPlatformId).toBe('thick-slab');

    // Now puncture the inner stratum as well (entire thickness punctured)
    innerStratumSolid = false;
    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });

    // Platform completely perforated -> player falls into void
    expect(controller.onGround).toBe(false);
    expect(controller.currentPlatformId).toBeNull();
    expect(controller.craterDepth).toBe(0);
  });

  it('boosts jump impulse and altitude on elastic platforms compared to standard floor', () => {
    const elasticPlatform: Platform = {
      id: 'elastic-plat',
      name: 'Elastic Platform',
      x: 100,
      y: 400,
      width: 200,
      height: 10,
      material: 'elastic',
      oneWay: true,
    };
    const concretePlatform: Platform = {
      id: 'concrete-plat',
      name: 'Concrete Platform',
      x: 400,
      y: 400,
      width: 200,
      height: 10,
      material: 'concrete',
      oneWay: true,
    };

    // Controller on concrete
    const concreteController = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [concretePlatform],
      isSolid: () => true,
    }, 450, 400);
    concreteController.currentPlatformId = 'concrete-plat';
    concreteController.currentMaterial = 'concrete';

    concreteController.update({ moveX: 0, jump: true, drop: false, dt: 0.016 });
    expect(concreteController.lastBounceBoost).toBe(0);
    const concreteInitialVy = concreteController.vy;

    // Controller on elastic
    const elasticController = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [elasticPlatform],
      isSolid: () => true,
    }, 150, 400);
    elasticController.currentPlatformId = 'elastic-plat';
    elasticController.currentMaterial = 'elastic';

    elasticController.update({ moveX: 0, jump: true, drop: false, dt: 0.016 });
    expect(elasticController.lastBounceBoost).toBe(1);
    const elasticInitialVy = elasticController.vy;

    // Vy is negative when jumping upwards; elastic vy has larger upward magnitude
    expect(elasticInitialVy).toBeLessThan(concreteInitialVy);

    // Simulate jump rise until peak altitude
    let minConcreteY = concreteController.y;
    let minElasticY = elasticController.y;

    for (let i = 0; i < 40; i++) {
      concreteController.update({ moveX: 0, jump: false, drop: false, dt: 0.02 });
      elasticController.update({ moveX: 0, jump: false, drop: false, dt: 0.02 });
      minConcreteY = Math.min(minConcreteY, concreteController.y);
      minElasticY = Math.min(minElasticY, elasticController.y);
    }

    // Elastic jump reaches higher altitude (lower Y coordinate)
    expect(minElasticY).toBeLessThan(minConcreteY);
  });

  it('slides with residual horizontal velocity on low-traction glass floors after releasing movement', () => {
    const glassPlatform: Platform = {
      id: 'glass-plat',
      name: 'Glass Platform',
      x: 100,
      y: 400,
      width: 400,
      height: 10,
      material: 'glass',
      oneWay: true,
    };

    const controller = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [glassPlatform],
      isSolid: () => true,
    }, 150, 400);
    controller.currentPlatformId = 'glass-plat';
    controller.currentMaterial = 'glass';

    // Accelerate horizontally on glass
    for (let i = 0; i < 15; i++) {
      controller.update({ moveX: 1, jump: false, drop: false, dt: 0.016 });
    }
    expect(controller.vx).toBeGreaterThan(150);

    // Release movement controls: moveX = 0
    controller.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });

    // Glass traction is 0.35 (< 0.6), so operator slides with residual vx > 0
    expect(controller.vx).toBeGreaterThan(0);
    const residualVx = controller.vx;

    // Standard high-traction platform (e.g. concrete) stops immediately on moveX: 0
    const concretePlatform: Platform = {
      id: 'concrete-plat',
      name: 'Concrete Platform',
      x: 100,
      y: 400,
      width: 400,
      height: 10,
      material: 'concrete',
      oneWay: true,
    };
    const concreteController = new PlatformController({
      floorY: 530,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: [concretePlatform],
      isSolid: () => true,
    }, 150, 400);
    concreteController.currentPlatformId = 'concrete-plat';
    concreteController.currentMaterial = 'concrete';

    concreteController.update({ moveX: 1, jump: false, drop: false, dt: 0.016 });
    concreteController.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });
    expect(concreteController.vx).toBe(0);

    // Meanwhile, glass controller continues to slide
    expect(residualVx).toBeGreaterThan(0);
  });

  describe('applyRecoil', () => {
    const makeOnMaterial = (material: 'glass' | 'concrete' | 'metal') => {
      const platform: Platform = {
        id: `${material}-plat`,
        name: `${material} platform`,
        x: 100,
        y: 400,
        width: 600,
        height: 10,
        material,
        oneWay: true,
      };
      const controller = new PlatformController({
        floorY: 530,
        worldBounds: { minX: 48, maxX: 1104 },
        platforms: [platform],
        isSolid: () => true,
      }, 300, 400);
      controller.currentPlatformId = platform.id;
      controller.currentMaterial = material;
      return controller;
    };

    it('pushes the operator horizontally without input and decays slower on glass than concrete/metal', () => {
      const glass = makeOnMaterial('glass');
      const concrete = makeOnMaterial('concrete');
      const metal = makeOnMaterial('metal');

      for (const c of [glass, concrete, metal]) c.applyRecoil(-300, 0);
      for (const c of [glass, concrete, metal]) c.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });

      // Pushed left with moveX = 0, while staying on the ground (no vertical component)
      for (const c of [glass, concrete, metal]) {
        expect(c.x).toBeLessThan(300);
        expect(c.onGround).toBe(true);
        expect(c.vx).toBe(0);
        expect(c.recoilVx).toBeLessThan(0);
      }

      // Slick glass keeps more recoil than grippy surfaces after the same frame
      expect(Math.abs(glass.recoilVx)).toBeGreaterThan(Math.abs(concrete.recoilVx));
      expect(Math.abs(glass.recoilVx)).toBeGreaterThan(Math.abs(metal.recoilVx));

      for (let i = 0; i < 30; i++) {
        for (const c of [glass, concrete, metal]) c.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });
      }
      // Concrete fully bleeds 300 px/s at 680 px/s² in < 0.5 s; glass is still sliding and travelled farther
      expect(concrete.recoilVx).toBe(0);
      expect(metal.recoilVx).toBe(0);
      expect(glass.recoilVx).toBeLessThan(0);
      expect(glass.x).toBeLessThan(concrete.x);
    });

    it('clamps accumulated recoil, ignores non-finite impulses and clears on reset', () => {
      const controller = makeOnMaterial('concrete');
      controller.applyRecoil(300, 0);
      controller.applyRecoil(300, 0);
      expect(controller.recoilVx).toBe(420);

      controller.applyRecoil(Number.NaN, -200);
      controller.applyRecoil(10, Number.POSITIVE_INFINITY);
      expect(controller.recoilVx).toBe(420);
      expect(controller.onGround).toBe(true);
      expect(controller.vy).toBe(0);

      controller.reset(300);
      expect(controller.recoilVx).toBe(0);
    });

    it('launches a ballistic hop off the floor when firing a heavy shot downward', () => {
      const controller = new PlatformController({
        floorY: 530,
        worldBounds: { minX: 48, maxX: 1104 },
        platforms: [],
        isSolid: () => true,
      }, 350, 530);
      expect(controller.onGround).toBe(true);

      controller.applyRecoil(0, -180);
      expect(controller.onGround).toBe(false);
      expect(controller.vy).toBe(-180);

      controller.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });
      expect(controller.onGround).toBe(false);
      expect(controller.vy).toBeLessThan(0);
      expect(controller.y).toBeLessThan(530);

      // Gravity brings the operator back down onto the catwalk
      for (let i = 0; i < 60; i++) controller.update({ moveX: 0, jump: false, drop: false, dt: 0.016 });
      expect(controller.onGround).toBe(true);
      expect(controller.y).toBe(530);
    });

    it('cushions a fall when firing downward mid-air and only softens trajectory for light impulses', () => {
      const controller = new PlatformController({
        floorY: 530,
        worldBounds: { minX: 48, maxX: 1104 },
        platforms: [],
        isSolid: () => true,
      }, 350, 300);
      controller.onGround = false;
      controller.currentPlatformId = null;

      controller.vy = 100; // falling gently
      controller.applyRecoil(0, -180);
      expect(controller.vy).toBe(-80);

      controller.vy = 100;
      controller.applyRecoil(0, -20); // light impulse: half applied
      expect(controller.vy).toBe(90);

      // A light impulse on the ground must not lift the operator
      const grounded = new PlatformController({
        floorY: 530,
        worldBounds: { minX: 48, maxX: 1104 },
        platforms: [],
        isSolid: () => true,
      }, 350, 530);
      grounded.applyRecoil(0, -20);
      expect(grounded.onGround).toBe(true);
      expect(grounded.vy).toBe(0);
    });
  });
});

