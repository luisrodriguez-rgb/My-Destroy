import type { PlatformMaterial } from '../tuning';

export type WeaponId = 'pistol' | 'shotgun' | 'grenade' | 'laser' | 'vortex';

export interface ProjectileConfig {
  speed: number;
  gravity: number;
  bounce: number;
  friction: number;
  fuseMs: number;
  radius: number;
  blastRadius: number;
}

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  category: string;
  cooldown: number;
  radius: number;
  flash: number;
  recovery: number;
  recoil: number;
  fragments: number;
  pellets?: number;
  spreadDeg?: number;
  projectile?: ProjectileConfig;
  damagePower: number;
  knockback: number;
  blastForce: number;
  ditherWidth: number;
  shakeIntensity: number;
  shakeDuration: number;
  clusterCount?: number;
  clusterRadius?: number;
  materialMultipliers: Record<PlatformMaterial, number>;
}
