import { describe, expect, it } from 'vitest';
import {
  calculateSpreadAngles,
  computeEffectiveDamageRadius,
  computeKnockbackVector,
  generateClusterImpacts,
  WEAPONS,
  WEAPON_ORDER,
} from './weapons';

describe('weapons', () => {
  it('defines all 5 arsenal weapons with valid configs', () => {
    expect(WEAPON_ORDER).toEqual(['pistol', 'shotgun', 'grenade', 'laser', 'vortex']);
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id];
      expect(weapon.id).toBe(id);
      expect(weapon.cooldown).toBeGreaterThan(0);
      expect(weapon.radius).toBeGreaterThan(0);
      expect(weapon.recovery).toBeGreaterThan(0);
      expect(weapon.recoil).toBeGreaterThan(0);
    }
  });

  it('calculates spread angles symmetrically around base angle', () => {
    const baseAngle = 0; // pointing right
    const angles = calculateSpreadAngles(baseAngle, 5, 10);
    expect(angles).toHaveLength(5);

    // Center pellet should be at baseAngle
    expect(angles[2]).toBeCloseTo(0, 5);

    // Outer pellets should be at -10 and +10 degrees in radians
    const expectedRad = (10 * Math.PI) / 180;
    expect(angles[0]).toBeCloseTo(-expectedRad, 5);
    expect(angles[4]).toBeCloseTo(expectedRad, 5);
  });

  it('handles single pellet without spread', () => {
    const angles = calculateSpreadAngles(Math.PI / 4, 1, 15);
    expect(angles).toHaveLength(1);
    expect(angles[0]).toBe(Math.PI / 4);
  });
});

describe('weapon ballistics properties', () => {
  const materials = ['glass', 'paper', 'wood', 'elastic', 'concrete', 'metal'] as const;

  it('defines positive ballistic stats and all material multipliers for every weapon', () => {
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      expect(w.damagePower).toBeGreaterThan(0);
      expect(w.knockback).toBeGreaterThan(0);
      expect(w.blastForce).toBeGreaterThan(0);
      expect(w.ditherWidth).toBeGreaterThan(0);
      expect(w.shakeIntensity).toBeGreaterThan(0);
      expect(w.shakeDuration).toBeGreaterThan(0);
      for (const m of materials) {
        expect(w.materialMultipliers[m]).toBeGreaterThan(0);
      }
    }
  });

  it('matches the specified values', () => {
    expect(WEAPONS.pistol).toMatchObject({ damagePower: 32, knockback: 28, blastForce: 190, ditherWidth: 4, shakeIntensity: 0.0022, shakeDuration: 45 });
    expect(WEAPONS.shotgun).toMatchObject({ damagePower: 20, knockback: 155, blastForce: 175, ditherWidth: 5, shakeIntensity: 0.0055, shakeDuration: 85 });
    expect(WEAPONS.grenade).toMatchObject({ damagePower: 145, knockback: 175, blastForce: 560, ditherWidth: 6, shakeIntensity: 0.0085, shakeDuration: 135, clusterCount: 5, clusterRadius: 15 });
    expect(WEAPONS.laser).toMatchObject({ damagePower: 24, knockback: 14, blastForce: 95, ditherWidth: 2, shakeIntensity: 0.0014, shakeDuration: 35 });
    expect(WEAPONS.vortex).toMatchObject({ damagePower: 230, knockback: 220, blastForce: 680, ditherWidth: 7, shakeIntensity: 0.013, shakeDuration: 190 });
    expect(WEAPONS.laser.materialMultipliers).toEqual({ paper: 1.35, wood: 1.25, glass: 0.85, elastic: 1.15, metal: 1.2, concrete: 0.95 });
    expect(WEAPONS.vortex.materialMultipliers.metal).toBe(1.05);
  });

  it('only the grenade has cluster config', () => {
    expect(WEAPONS.pistol.clusterCount).toBeUndefined();
    expect(WEAPONS.grenade.clusterCount).toBe(5);
  });
});

describe('computeEffectiveDamageRadius', () => {
  it('returns the base radius when no options are given', () => {
    expect(computeEffectiveDamageRadius('pistol', 13)).toBe(13);
  });

  it('glass yields a larger radius than metal for shotgun and pistol', () => {
    for (const id of ['shotgun', 'pistol'] as const) {
      const glass = computeEffectiveDamageRadius(id, 40, { material: 'glass' });
      const metal = computeEffectiveDamageRadius(id, 40, { material: 'metal' });
      expect(glass).toBeGreaterThan(metal);
    }
  });

  it('applies material multiplier and rounds', () => {
    expect(computeEffectiveDamageRadius('pistol', 100, { material: 'glass' })).toBe(135);
  });

  it('shotgun gets point-blank bonus and falls off with distance', () => {
    const close = computeEffectiveDamageRadius('shotgun', 100, { distance: 0 });
    const mid = computeEffectiveDamageRadius('shotgun', 100, { distance: 160 });
    const far = computeEffectiveDamageRadius('shotgun', 100, { distance: 520 });
    const beyond = computeEffectiveDamageRadius('shotgun', 100, { distance: 2000 });
    expect(close).toBe(122);
    expect(mid).toBe(100);
    expect(far).toBe(68);
    expect(beyond).toBe(68);
    expect(computeEffectiveDamageRadius('shotgun', 100, { distance: 140 })).toBe(100);
    expect(computeEffectiveDamageRadius('shotgun', 100, { distance: 70 })).toBe(111);
    expect(computeEffectiveDamageRadius('shotgun', 100, { distance: 350 })).toBe(84);
  });

  it('ignores non-finite distance and distance for other weapons', () => {
    expect(computeEffectiveDamageRadius('shotgun', 100, { distance: Number.NaN })).toBe(100);
    expect(computeEffectiveDamageRadius('shotgun', 100, { distance: Infinity })).toBe(100);
    expect(computeEffectiveDamageRadius('pistol', 100, { distance: 0 })).toBe(100);
  });

  it('laser scales with thermal charge and clamps to [0, 1]', () => {
    expect(computeEffectiveDamageRadius('laser', 100, { chargeFactor: 0 })).toBe(100);
    expect(computeEffectiveDamageRadius('laser', 100, { chargeFactor: 0.5 })).toBe(138);
    expect(computeEffectiveDamageRadius('laser', 100, { chargeFactor: 1 })).toBe(175);
    expect(computeEffectiveDamageRadius('laser', 100, { chargeFactor: 5 })).toBe(175);
    expect(computeEffectiveDamageRadius('laser', 100, { chargeFactor: -3 })).toBe(100);
    expect(computeEffectiveDamageRadius('laser', 100, { chargeFactor: Number.NaN })).toBe(100);
  });

  it('never returns less than 4px', () => {
    expect(computeEffectiveDamageRadius('pistol', 1)).toBe(4);
    expect(computeEffectiveDamageRadius('shotgun', 2, { material: 'metal', distance: 520 })).toBe(4);
    expect(computeEffectiveDamageRadius('pistol', -10)).toBe(4);
  });
});

describe('computeKnockbackVector', () => {
  it('pushes opposite to the aim direction', () => {
    const right = computeKnockbackVector(0, 'shotgun', true);
    expect(right.vx).toBeCloseTo(-WEAPONS.shotgun.knockback, 5);
    expect(right.vy).toBeCloseTo(0, 5);
    const left = computeKnockbackVector(Math.PI, 'shotgun', true);
    expect(left.vx).toBeCloseTo(WEAPONS.shotgun.knockback, 5);
  });

  it('has stronger vertical recoil in the air', () => {
    const angle = Math.PI / 2; // aiming down
    const ground = computeKnockbackVector(angle, 'grenade', true);
    const air = computeKnockbackVector(angle, 'grenade', false);
    expect(ground.vy).toBeCloseTo(-WEAPONS.grenade.knockback, 5);
    expect(Math.abs(air.vy)).toBeGreaterThan(Math.abs(ground.vy));
    expect(air.vy).toBeCloseTo(-WEAPONS.grenade.knockback * 1.25, 5);
  });

  it('slides further horizontally on low-traction surfaces like glass', () => {
    const normal = computeKnockbackVector(0, 'shotgun', true, 1);
    const slippery = computeKnockbackVector(0, 'shotgun', true, 0.4);
    expect(Math.abs(slippery.vx)).toBeGreaterThan(Math.abs(normal.vx));
    expect(slippery.vx).toBeCloseTo(-WEAPONS.shotgun.knockback * 1.35, 5);
  });

  it('does not apply the slide bonus in the air or at traction >= 0.6', () => {
    expect(computeKnockbackVector(0, 'pistol', false, 0.2).vx).toBeCloseTo(-WEAPONS.pistol.knockback, 5);
    expect(computeKnockbackVector(0, 'pistol', true, 0.6).vx).toBeCloseTo(-WEAPONS.pistol.knockback, 5);
  });
});

describe('generateClusterImpacts', () => {
  it('returns an empty array for non-positive counts', () => {
    expect(generateClusterImpacts(0, 0, 0, 15)).toEqual([]);
    expect(generateClusterImpacts(0, 0, -2, 15)).toEqual([]);
  });

  it('returns the exact number of impacts around the origin within the ring bounds', () => {
    const ox = 100;
    const oy = 50;
    const impacts = generateClusterImpacts(ox, oy, 5, 15, 3);
    expect(impacts).toHaveLength(5);
    for (const p of impacts) {
      const dist = Math.hypot(p.x - ox, p.y - oy);
      expect(dist).toBeGreaterThanOrEqual(15 * 0.85 - 1e-9);
      expect(dist).toBeLessThanOrEqual(15 * 1.15 + 1e-9);
      expect(p.angle).toBeGreaterThan(-0.28 - 1e-9);
      expect(p.angle).toBeLessThan(Math.PI * 2 + 0.28);
    }
  });

  it('is deterministic for the same seed and varies with seed', () => {
    const a = generateClusterImpacts(0, 0, 4, 20, 1);
    const b = generateClusterImpacts(0, 0, 4, 20, 1);
    const c = generateClusterImpacts(0, 0, 4, 20, 2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('spreads impacts across distinct angles', () => {
    const impacts = generateClusterImpacts(0, 0, 6, 15);
    const angles = new Set(impacts.map((p) => p.angle.toFixed(4)));
    expect(angles.size).toBe(6);
  });
});
