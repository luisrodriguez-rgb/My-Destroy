export const WORLD = { width: 1152, height: 584, floor: 534 };
export const PAPER = { x: 24, y: 22, width: 1104, height: 488 };
export const COLORS = { amber: 0xffb454, cyan: 0x79e3d8, ink: 0x0b1018, paper: 0xf3f1e9 };
export const PLAYER_PHYSICS = {
  width: 24,
  height: 46,
  speed: 185,
  jumpForce: -440,
  gravity: 980,
  maxFallSpeed: 580,
  coyoteTime: 100,
  jumpBufferTime: 120,
  jetpackThrust: 1720,
  maxClimbSpeed: -320,
  minY: 64,
};


export type PlatformMaterial = 'concrete' | 'metal' | 'wood' | 'glass' | 'elastic' | 'paper';

export interface MaterialPhysicsProfile {
  /** 0..1 grip under the operator's boots; below 0.6 the controller slides with inertia. */
  traction: number;
  /** Multiplies the base jump force when leaving this surface. */
  jumpMultiplier: number;
  /** Rapier restitution for debris bouncing on the slab. */
  restitution: number;
  /** Rapier friction for debris resting on the slab. */
  friction: number;
  /** Max consecutive collapsed segments the slab tolerates before islands give way. */
  maxUnsupportedSpan: number;
  /** Max debris pieces a single 24px segment can carry before failing by overload. */
  maxLoad: number;
  /** Visual/structural thickness of the slab in px. */
  slabDepth: number;
}

export const PLATFORM_MATERIALS: Record<PlatformMaterial, MaterialPhysicsProfile> = {
  concrete: { traction: 1.0, jumpMultiplier: 1.0, restitution: 0.2, friction: 0.85, maxUnsupportedSpan: 5, maxLoad: 14, slabDepth: 12 },
  metal: { traction: 0.92, jumpMultiplier: 1.02, restitution: 0.25, friction: 0.75, maxUnsupportedSpan: 6, maxLoad: 18, slabDepth: 10 },
  wood: { traction: 0.85, jumpMultiplier: 1.05, restitution: 0.3, friction: 0.75, maxUnsupportedSpan: 4, maxLoad: 9, slabDepth: 10 },
  glass: { traction: 0.35, jumpMultiplier: 1.0, restitution: 0.4, friction: 0.25, maxUnsupportedSpan: 2, maxLoad: 4, slabDepth: 6 },
  elastic: { traction: 0.95, jumpMultiplier: 1.32, restitution: 0.75, friction: 0.8, maxUnsupportedSpan: 4, maxLoad: 12, slabDepth: 10 },
  paper: { traction: 0.8, jumpMultiplier: 1.0, restitution: 0.2, friction: 0.7, maxUnsupportedSpan: 3, maxLoad: 6, slabDepth: 8 },
};
