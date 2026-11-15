import type { PlatformMaterial } from '../tuning';
import type { WeaponConfig, WeaponId } from './types';

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  pistol: {
    id: 'pistol',
    name: 'Pistola',
    category: 'SEMIAUTOMÁTICA',
    cooldown: 180,
    radius: 13,
    flash: 45,
    recovery: 110,
    recoil: 4.5,
    fragments: 8,
    pellets: 1,
    damagePower: 32,
    knockback: 28,
    blastForce: 190,
    ditherWidth: 4,
    shakeIntensity: 0.0022,
    shakeDuration: 45,
    materialMultipliers: { glass: 1.35, paper: 1.15, wood: 1.05, elastic: 0.9, concrete: 0.85, metal: 0.75 },
  },
  shotgun: {
    id: 'shotgun',
    name: 'Escopeta',
    category: 'DISPERSIÓN PESADA',
    cooldown: 480,
    radius: 8,
    flash: 60,
    recovery: 220,
    recoil: 9,
    fragments: 14,
    pellets: 5,
    spreadDeg: 14,
    damagePower: 20,
    knockback: 155,
    blastForce: 175,
    ditherWidth: 5,
    shakeIntensity: 0.0055,
    shakeDuration: 85,
    materialMultipliers: { glass: 1.45, paper: 1.25, wood: 1.15, elastic: 0.92, concrete: 0.82, metal: 0.72 },
  },
  grenade: {
    id: 'grenade',
    name: 'Lanzagranadas',
    category: 'EXPLOSIVO BALÍSTICO',
    cooldown: 650,
    radius: 38,
    flash: 75,
    recovery: 260,
    recoil: 11,
    fragments: 22,
    projectile: {
      speed: 460,
      gravity: 860,
      bounce: 0.52,
      friction: 0.88,
      fuseMs: 1150,
      radius: 4,
      blastRadius: 38,
    },
    damagePower: 145,
    knockback: 175,
    blastForce: 560,
    ditherWidth: 6,
    shakeIntensity: 0.0085,
    shakeDuration: 135,
    clusterCount: 5,
    clusterRadius: 15,
    materialMultipliers: { glass: 1.4, paper: 1.3, wood: 1.2, elastic: 1.0, concrete: 1.05, metal: 0.9 },
  },
  laser: {
    id: 'laser',
    name: 'Láser Térmico',
    category: 'RAYO CONTINUO',
    cooldown: 35,
    radius: 8,
    flash: 28,
    recovery: 35,
    recoil: 1.0,
    fragments: 3,
    damagePower: 24,
    knockback: 14,
    blastForce: 95,
    ditherWidth: 2,
    shakeIntensity: 0.0014,
    shakeDuration: 35,
    materialMultipliers: { paper: 1.35, wood: 1.25, glass: 0.85, elastic: 1.15, metal: 1.2, concrete: 0.95 },
  },
  vortex: {
    id: 'vortex',
    name: 'Singularidad',
    category: 'VÓRTICE GRAVITATORIO',
    cooldown: 1150,
    radius: 56,
    flash: 85,
    recovery: 320,
    recoil: 14,
    fragments: 26,
    projectile: {
      speed: 380,
      gravity: 340,
      bounce: 0.2,
      friction: 0.95,
      fuseMs: 1600,
      radius: 8,
      blastRadius: 56,
    },
    damagePower: 230,
    knockback: 220,
    blastForce: 680,
    ditherWidth: 7,
    shakeIntensity: 0.013,
    shakeDuration: 190,
    materialMultipliers: { glass: 1.3, paper: 1.25, wood: 1.2, elastic: 1.15, concrete: 1.1, metal: 1.05 },
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

/**
 * Computes the effective damage radius given weapon, distance, material and charge.
 */
export function computeEffectiveDamageRadius(
  weaponId: WeaponId,
  baseRadius: number,
  options?: { distance?: number; material?: PlatformMaterial; chargeFactor?: number },
): number {
  let radius = baseRadius;
  if (options?.material) {
    radius *= WEAPONS[weaponId].materialMultipliers[options.material];
  }
  if (weaponId === 'shotgun' && typeof options?.distance === 'number' && Number.isFinite(options.distance)) {
    const distance = options.distance;
    if (distance <= 140) {
      const t = Math.max(0, distance) / 140;
      radius *= 1.22 + (1.0 - 1.22) * t;
    } else if (distance > 180) {
      const t = Math.min(1, (distance - 180) / (520 - 180));
      radius *= 1.0 + (0.68 - 1.0) * t;
    }
  }
  if (weaponId === 'laser' && typeof options?.chargeFactor === 'number' && Number.isFinite(options.chargeFactor)) {
    const charge = Math.min(1, Math.max(0, options.chargeFactor));
    radius *= 1 + charge * 0.75;
  }
  return Math.max(4, Math.round(radius));
}

/**
 * Computes the recoil velocity applied to the shooter (opposite to the aim direction).
 */
export function computeKnockbackVector(
  aimAngle: number,
  weaponId: WeaponId,
  onGround: boolean,
  surfaceTraction = 1,
): { vx: number; vy: number } {
  const nx = -Math.cos(aimAngle);
  const ny = -Math.sin(aimAngle);
  const mag = WEAPONS[weaponId].knockback;
  const vx = nx * mag * (onGround && surfaceTraction < 0.6 ? 1.35 : 1);
  const vy = ny * mag * (!onGround ? 1.25 : 1);
  return { vx, vy };
}

/**
 * Generates deterministic cluster impact points on a ring around an origin.
 */
export function generateClusterImpacts(
  originX: number,
  originY: number,
  count: number,
  ringRadius: number,
  seed = 0,
): Array<{ x: number; y: number; angle: number }> {
  if (count <= 0) return [];
  const impacts: Array<{ x: number; y: number; angle: number }> = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.sin(seed + i * 2.17) * 0.28;
    const radiusFactor = 0.85 + 0.3 * ((Math.sin(seed * 1.31 + i * 4.73) + 1) / 2);
    const r = ringRadius * radiusFactor;
    impacts.push({ x: originX + Math.cos(angle) * r, y: originY + Math.sin(angle) * r, angle });
  }
  return impacts;
}
