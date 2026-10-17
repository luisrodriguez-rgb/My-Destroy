export type WeaponId = 'pistol' | 'shotgun' | 'grenade';

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
}
