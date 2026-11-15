import { PLATFORM_MATERIALS, PLAYER_PHYSICS, type PlatformMaterial } from '../tuning';
import type { Platform } from '../platforms/demoPlatforms';

export interface ControllerOptions {
  floorY: number;
  worldBounds: { minX: number; maxX: number };
  platforms: Platform[];
  isSolid: (x: number, y: number) => boolean;
}

export interface ControllerInput {
  moveX: number;
  jump: boolean;
  drop: boolean;
  dt: number;
}

export class PlatformController {
  x = 350;
  y: number;
  vx = 0;
  vy = 0;
  onGround = true;
  isJetpacking = false;
  currentPlatformId: string | null = 'catwalk';
  /** Material under the operator's feet (last surface landed on). */
  currentMaterial: PlatformMaterial = 'metal';
  /** How many px the operator sits below the platform's top crust (crater floor). */
  craterDepth = 0;
  /** Tilt in radians of the supporting surface; positive = right side lower. */
  surfaceSlope = 0;
  /** 1 when the last jump was boosted by an elastic surface, else 0. */
  lastBounceBoost = 0;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;

  constructor(private options: ControllerOptions, initialX = 350, initialY?: number) {
    this.x = initialX;
    this.y = initialY ?? options.floorY;
  }

  reset(x = 350, y?: number) {
    this.x = x;
    this.y = y ?? this.options.floorY;
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.isJetpacking = false;
    this.currentPlatformId = 'catwalk';
    this.currentMaterial = 'metal';
    this.craterDepth = 0;
    this.surfaceSlope = 0;
    this.lastBounceBoost = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  requestJump() {
    this.jumpBufferTimer = PLAYER_PHYSICS.jumpBufferTime;
  }

  setPlatforms(platforms: Platform[]) {
    this.options.platforms = platforms;
  }

  setFloor(floorY: number) {
    this.options.floorY = floorY;
  }

  /**
   * Samples the platform under the operator's feet across its strata.
   * The top crust (platform.y + 2) gives depth 0; on thick slabs (height >= 10) a destroyed crust
   * can still be backed by inner layers at dy = 6 / 10, letting the operator sink into craters.
   * The shallowest supported foot wins, so a boot on the crater rim keeps the operator up.
   */
  private sampleFootingStrata(platform: Platform): { solid: boolean; depthOffset: number; slope: number } {
    const footOffsets = [-6, 0, 6];
    const crustY = platform.y + 2;
    const maxDy = Math.min(platform.height, 12);
    const depths: Array<number | null> = footOffsets.map(offset => {
      const x = this.x + offset;
      if (this.options.isSolid(x, crustY)) return 0;
      if (platform.height < 10) return null;
      for (const dy of [6, 10]) {
        if (dy > maxDy) break;
        if (this.options.isSolid(x, platform.y + dy)) return dy - 2;
      }
      return null;
    });

    const validDepths = depths.filter((d): d is number => d !== null);
    if (validDepths.length === 0) return { solid: false, depthOffset: 0, slope: 0 };

    const depthOffset = Math.min(...validDepths);
    const [leftDepth, , rightDepth] = depths;
    let slope = 0;
    if (leftDepth !== null && rightDepth !== null) {
      slope = Math.max(-0.35, Math.min(0.35, Math.atan2(rightDepth - leftDepth, 12)));
    } else if (leftDepth !== null) {
      slope = 0.18; // only the left boot is supported: the surface dips to the right
    } else if (rightDepth !== null) {
      slope = -0.18;
    }
    return { solid: true, depthOffset, slope };
  }

  private leaveGround() {
    this.onGround = false;
    this.currentPlatformId = null;
    this.craterDepth = 0;
    this.surfaceSlope = 0;
  }

  update(input: ControllerInput) {
    const { moveX, jump, drop, dt } = input;
    const { speed, jumpForce, gravity, maxFallSpeed, coyoteTime, jumpBufferTime } = PLAYER_PHYSICS;

    // 1. Horizontal movement (low-traction surfaces keep inertia and slide)
    const groundProfile = PLATFORM_MATERIALS[this.currentMaterial];
    if (this.onGround && groundProfile.traction < 0.6) {
      const target = moveX * speed;
      const accel = speed * groundProfile.traction * 10 * dt;
      const delta = target - this.vx;
      this.vx = Math.abs(delta) <= accel ? target : this.vx + Math.sign(delta) * accel;
    } else {
      this.vx = moveX * speed;
    }
    this.x = Math.max(this.options.worldBounds.minX, Math.min(this.options.worldBounds.maxX, this.x + this.vx * dt));

    // 2. Jump input buffering and coyote time tracking
    if (jump) {
      this.jumpBufferTimer = jumpBufferTime;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt * 1000);
    }

    if (this.onGround) {
      this.coyoteTimer = coyoteTime;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt * 1000);
    }

    // 3. Initiate Jump
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !drop) {
      const matProfile = PLATFORM_MATERIALS[this.currentMaterial];
      this.vy = jumpForce * matProfile.jumpMultiplier;
      this.lastBounceBoost = matProfile.jumpMultiplier > 1.05 ? 1 : 0;
      this.leaveGround();
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    }

    // 4. Drop-down through one-way platforms
    if (drop && this.onGround && this.currentPlatformId && this.currentPlatformId !== 'catwalk') {
      this.leaveGround();
      this.y += 4;
      this.vy = 80;
    }

    // 5. If resting on ground, check if footing is STILL solid and valid
    if (this.onGround) {
      if (this.currentPlatformId === 'catwalk') {
        // Permanent floor is always solid
        this.y = this.options.floorY;
        this.vy = 0;
        this.currentMaterial = 'metal';
        this.craterDepth = 0;
        this.surfaceSlope = 0;
      } else {
        const platform = this.options.platforms.find(p => p.id === this.currentPlatformId);
        const withinHorizontal = platform && this.x >= platform.x - 8 && this.x <= platform.x + platform.width + 8;
        const footing = platform && withinHorizontal ? this.sampleFootingStrata(platform) : null;

        if (!platform || !footing || !footing.solid) {
          // Platform was destroyed beneath player or player walked off ledge!
          this.leaveGround();
          this.coyoteTimer = 0;
        } else {
          this.y = platform.y + footing.depthOffset;
          this.vy = 0;
          this.craterDepth = footing.depthOffset;
          this.surfaceSlope = footing.slope;
        }
      }
    }

    // 6. In-air physics, Jetpack thrust and landing resolution
    if (!this.onGround) {
      if (jump && !drop) {
        this.isJetpacking = true;
        if (this.lastBounceBoost > 0 && this.vy < PLAYER_PHYSICS.maxClimbSpeed) {
          // Elastic bounce rises faster than the jetpack climbs: coast instead of snapping to the cap.
          this.vy += gravity * dt;
        } else {
          this.vy = Math.max(PLAYER_PHYSICS.maxClimbSpeed, this.vy + (gravity - PLAYER_PHYSICS.jetpackThrust) * dt);
        }
      } else {
        this.isJetpacking = false;
        this.vy = Math.min(this.vy + gravity * dt, maxFallSpeed);
      }

      const prevY = this.y;
      this.y += this.vy * dt;

      // Top ceiling clamp so player doesn't fly out of the canvas
      if (this.y < PLAYER_PHYSICS.minY) {
        this.y = PLAYER_PHYSICS.minY;
        if (this.vy < 0) this.vy = 0;
      }

      // Landing detection only when falling downwards
      if (this.vy >= 0) {
        // Check permanent catwalk floor first as safety floor
        if (this.y >= this.options.floorY) {
          this.y = this.options.floorY;
          this.vy = 0;
          this.onGround = true;
          this.isJetpacking = false;
          this.currentPlatformId = 'catwalk';
          this.currentMaterial = 'metal';
          this.craterDepth = 0;
          this.surfaceSlope = 0;
          this.lastBounceBoost = 0;
        } else if (!drop) {
          // Check destructible platforms, sorted from highest to lowest in collision path
          for (const platform of this.options.platforms) {
            const horizontalOverlap = this.x >= platform.x - 6 && this.x <= platform.x + platform.width + 6;
            if (!horizontalOverlap) continue;

            const wasAbove = prevY <= platform.y + 4;
            const nowBelowOrAt = this.y >= platform.y;
            const withinStep = this.y <= platform.y + Math.max(14, this.vy * dt + 4);

            if (wasAbove && nowBelowOrAt && withinStep) {
              // Crucial step: verify whether the platform is intact in the CPU occupancy mask
              const footing = this.sampleFootingStrata(platform);
              if (footing.solid) {
                this.y = platform.y + footing.depthOffset;
                this.vy = 0;
                this.onGround = true;
                this.isJetpacking = false;
                this.currentPlatformId = platform.id;
                this.currentMaterial = platform.material ?? 'paper';
                this.craterDepth = footing.depthOffset;
                this.surfaceSlope = footing.slope;
                this.lastBounceBoost = 0;
                break;
              }
              // If destroyed at this point, player naturally falls through the hole
            }
          }
        }
      }
    } else {
      this.isJetpacking = false;
    }
  }

  /**
   * Find the nearest solid surface directly below current position for shadow projection.
   */
  findGroundBelow(): { y: number; platformId: string } {
    let groundY = this.options.floorY;
    let groundId = 'catwalk';

    for (const platform of this.options.platforms) {
      if (this.x >= platform.x - 6 && this.x <= platform.x + platform.width + 6) {
        // Cheap reject: even the deepest stratum (y + 10) cannot beat the current best
        if (platform.y + 10 < this.y - 2 || platform.y >= groundY) continue;
        const footing = this.sampleFootingStrata(platform);
        if (!footing.solid) continue;
        const surfaceY = platform.y + footing.depthOffset;
        if (surfaceY >= this.y - 2 && surfaceY < groundY) {
          groundY = surfaceY;
          groundId = platform.id;
        }
      }
    }

    return { y: groundY, platformId: groundId };
  }
}
