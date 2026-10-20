import { describe, expect, it } from 'vitest';
import { calculateSpreadAngles, WEAPONS, WEAPON_ORDER } from './weapons';

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
