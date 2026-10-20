import type { WeaponConfig, WeaponId } from './types';

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  pistol: {
    id: 'pistol',
    name: 'Pistola',
    category: 'SEMIAUTOMÁTICA',
    cooldown: 180,
    radius: 24,
    flash: 45,
    recovery: 110,
    recoil: 5,
    fragments: 11,
    pellets: 1,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Escopeta',
    category: 'DISPERSIÓN PESADA',
    cooldown: 480,
    radius: 16,
    flash: 60,
    recovery: 220,
    recoil: 10,
    fragments: 18,
    pellets: 5,
    spreadDeg: 12,
  },
  grenade: {
    id: 'grenade',
    name: 'Lanzagranadas',
    category: 'EXPLOSIVO BALÍSTICO',
    cooldown: 650,
    radius: 54,
    flash: 75,
    recovery: 260,
    recoil: 12,
    fragments: 26,
    projectile: {
      speed: 460,
      gravity: 860,
      bounce: 0.52,
      friction: 0.88,
      fuseMs: 1150,
      radius: 4,
      blastRadius: 54,
    },
  },
  laser: {
    id: 'laser',
    name: 'Láser Térmico',
    category: 'RAYO CONTINUO',
    cooldown: 42,
    radius: 12,
    flash: 28,
    recovery: 35,
    recoil: 1.2,
    fragments: 4,
  },
  vortex: {
    id: 'vortex',
    name: 'Singularidad',
    category: 'VÓRTICE GRAVITATORIO',
    cooldown: 1150,
    radius: 76,
    flash: 85,
    recovery: 320,
    recoil: 14,
    fragments: 30,
    projectile: {
      speed: 380,
      gravity: 340,
      bounce: 0.2,
      friction: 0.95,
      fuseMs: 1600,
      radius: 8,
      blastRadius: 76,
    },
  },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'shotgun', 'grenade', 'laser', 'vortex'];

/**
 * Calculates spread angles for multi-pellet weapons.
 */
export function calculateSpreadAngles(baseAngle: number, pellets: number, spreadDeg: number): number[] {
  if (pellets <= 1) return [baseAngle];
  const spreadRad = (spreadDeg * Math.PI) / 180;
  const step = (spreadRad * 2) / (pellets - 1);
  const start = baseAngle - spreadRad;
  const angles: number[] = [];
  for (let i = 0; i < pellets; i++) {
    angles.push(start + step * i);
  }
  return angles;
}
