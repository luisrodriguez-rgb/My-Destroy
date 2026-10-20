import { PLAYER_PHYSICS } from '../tuning';
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
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  requestJump() {
    this.jumpBufferTimer = PLAYER_PHYSICS.jumpBufferTime;
  }

  setPlatforms(platforms: Platform[]) {
    this.options.platforms = platforms;
  }

  /** Checks if any sample point across the player's feet width is solid. */
  private checkFootingSolid(platformY: number): boolean {
    const footOffsets = [-6, 0, 6];
    return footOffsets.some(offset => this.options.isSolid(this.x + offset, platformY + 2));
  }

  update(input: ControllerInput) {
    const { moveX, jump, drop, dt } = input;
    const { speed, jumpForce, gravity, maxFallSpeed, coyoteTime, jumpBufferTime } = PLAYER_PHYSICS;

    // 1. Horizontal movement
    this.vx = moveX * speed;
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
      this.vy = jumpForce;
      this.onGround = false;
      this.currentPlatformId = null;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    }

    // 4. Drop-down through one-way platforms
    if (drop && this.onGround && this.currentPlatformId && this.currentPlatformId !== 'catwalk') {
      this.onGround = false;
      this.currentPlatformId = null;
      this.y += 4;
      this.vy = 80;
    }

    // 5. If resting on ground, check if footing is STILL solid and valid
    if (this.onGround) {
      if (this.currentPlatformId === 'catwalk') {
        // Permanent floor is always solid
        this.y = this.options.floorY;
        this.vy = 0;
      } else {
        const platform = this.options.platforms.find(p => p.id === this.currentPlatformId);
        const withinHorizontal = platform && this.x >= platform.x - 8 && this.x <= platform.x + platform.width + 8;
        const stillSolid = platform && withinHorizontal && this.checkFootingSolid(platform.y);

        if (!stillSolid) {
          // Platform was destroyed beneath player or player walked off ledge!
          this.onGround = false;
          this.currentPlatformId = null;
          this.coyoteTimer = 0;
        } else {
          this.y = platform.y;
          this.vy = 0;
        }
      }
    }

    // 6. In-air physics, Jetpack thrust and landing resolution
    if (!this.onGround) {
      if (jump && !drop) {
        this.isJetpacking = true;
        this.vy = Math.max(PLAYER_PHYSICS.maxClimbSpeed, this.vy + (gravity - PLAYER_PHYSICS.jetpackThrust) * dt);
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
              if (this.checkFootingSolid(platform.y)) {
                this.y = platform.y;
                this.vy = 0;
                this.onGround = true;
                this.isJetpacking = false;
                this.currentPlatformId = platform.id;
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
        if (platform.y >= this.y - 2 && platform.y < groundY) {
          if (this.checkFootingSolid(platform.y)) {
            groundY = platform.y;
            groundId = platform.id;
          }
        }
      }
    }

    return { y: groundY, platformId: groundId };
  }
}
