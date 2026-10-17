import RAPIER from '@dimforge/rapier2d-compat';
import Delaunator from 'delaunator';
import { PAPER, WORLD } from '../tuning';
import { getDemoPlatforms } from '../platforms/demoPlatforms';

export interface VisualDebris {
  setPosition(x: number, y: number): void;
  setRotation(angle: number): void;
  destroy(): void;
  setOrigin?(x: number, y: number): void;
}

export interface DebrisPolygonData {
  frameKey: string;
  cropX: number;
  cropY: number;
  width: number;
  height: number;
  v0: { x: number; y: number };
  v1: { x: number; y: number };
  v2: { x: number; y: number };
}

export interface DebrisHost {
  createDebrisImage(x: number, y: number, frameKey: string, originX?: number, originY?: number): VisualDebris;
  addDebrisPolygon?(data: DebrisPolygonData): void;
  addDebrisFrame?(frameKey: string, x: number, y: number, w: number, h: number): void;
  removeDebrisFrame(frameKey: string): void;
}

export interface DebrisPiece {
  visual: VisualDebris;
  body: RAPIER.RigidBody;
  frameKey: string;
  createdTime: number;
}

export interface PlatformSegment {
  cx: number;
  cy: number;
  width: number;
  height: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  active: boolean;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export class DebrisManager {
  private world: RAPIER.World | null = null;
  private activeDebris: DebrisPiece[] = [];
  private platformSegments: PlatformSegment[] = [];
  private serial = 0;
  readonly maxDebris = 120;
  private isInitialized = false;

  constructor(private host: DebrisHost) {}

  async init(): Promise<void> {
    if (this.isInitialized) return;
    await RAPIER.init();
    // Gravity pointing downwards towards catwalk
    this.world = new RAPIER.World({ x: 0.0, y: 880.0 });

    // 1. Catwalk floor collider at y = 530
    // Thick 100px block positioned under y = 530 to guarantee zero tunneling into HUD
    const floorY = WORLD.floor; // 530
    const floorHalfHeight = 50.0;
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(WORLD.width / 2, floorY + floorHalfHeight);
    const floorBody = this.world.createRigidBody(floorDesc);
    const floorCollider = RAPIER.ColliderDesc.cuboid(WORLD.width / 2 + 100, floorHalfHeight);
    floorCollider.setFriction(0.85);
    floorCollider.setRestitution(0.2);
    this.world.createCollider(floorCollider, floorBody);

    // 2. Side walls to contain debris within screen bounds
    const leftWallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(-15, WORLD.height / 2);
    const leftWall = this.world.createRigidBody(leftWallDesc);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(10.0, WORLD.height / 2 + 50), leftWall);

    const rightWallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(WORLD.width + 15, WORLD.height / 2);
    const rightWall = this.world.createRigidBody(rightWallDesc);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(10.0, WORLD.height / 2 + 50), rightWall);

    // 3. Segmented platform colliders (so debris can stack and fall when platforms are destroyed)
    this.buildPlatformColliders();

    this.isInitialized = true;
  }

  private buildPlatformColliders(): void {
    if (!this.world) return;
    const platforms = getDemoPlatforms();
    const segWidth = 24;
    for (const p of platforms) {
      for (let sx = p.x; sx < p.x + p.width; sx += segWidth) {
        const sw = Math.min(segWidth, p.x + p.width - sx);
        const cx = sx + sw / 2;
        const cy = p.y + p.height / 2;
        const pBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy));
        const pCol = RAPIER.ColliderDesc.cuboid(sw / 2, p.height / 2);
        pCol.setFriction(0.8);
        pCol.setRestitution(0.2);
        const collider = this.world.createCollider(pCol, pBody);
        this.platformSegments.push({
          cx,
          cy,
          width: sw,
          height: p.height,
          body: pBody,
          collider,
          active: true,
        });
      }
    }
  }

  get count(): number {
    return this.activeDebris.length;
  }

  get activeSegmentsCount(): number {
    return this.platformSegments.filter(s => s.active).length;
  }

  /**
   * Synchronizes platform colliders against RegionMask destruction.
   * If a platform section is destroyed, its Rapier collider is removed and resting debris falls!
   */
  syncPlatforms(isSolid: (x: number, y: number) => boolean): void {
    if (!this.world || !this.isInitialized) return;
    for (const seg of this.platformSegments) {
      if (!seg.active) continue;
      // Sample 3 points along the segment top to detect perforation
      const topY = seg.cy - seg.height / 2 + 2;
      const solidLeft = isSolid(seg.cx - seg.width * 0.35, topY);
      const solidCenter = isSolid(seg.cx, topY);
      const solidRight = isSolid(seg.cx + seg.width * 0.35, topY);

      if (!solidLeft && !solidCenter && !solidRight) {
        this.world.removeCollider(seg.collider, true);
        seg.active = false;
        // Wake up nearby sleeping debris resting on this segment so they tumble down!
        for (const piece of this.activeDebris) {
          const pos = piece.body.translation();
          if (Math.abs(pos.x - seg.cx) < seg.width / 2 + 10 && Math.abs(pos.y - seg.cy) < 28) {
            piece.body.wakeUp();
            piece.body.applyImpulse({ x: (Math.random() - 0.5) * 18, y: 14 }, true);
          }
        }
      }
    }
  }

  /**
   * Applies an explosive radial impulse to all nearby debris bodies.
   */
  applyBlastImpulse(x: number, y: number, blastRadius: number, maxForce = 450): void {
    if (!this.world || !this.isInitialized) return;
    const effectRadius = blastRadius * 1.5;
    const effectRadiusSq = effectRadius * effectRadius;

    for (const piece of this.activeDebris) {
      const pos = piece.body.translation();
      const dx = pos.x - x;
      const dy = pos.y - y;
      const distSq = dx * dx + dy * dy;

      if (distSq < effectRadiusSq && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const factor = Math.max(0.1, 1 - dist / effectRadius);
        const impulse = maxForce * factor;
        const angle = Math.atan2(dy, dx);

        // Radial outward blast + vertical lift
        const ix = Math.cos(angle) * impulse;
        const iy = Math.sin(angle) * impulse - factor * 140;
        const torque = (Math.random() - 0.5) * impulse * 14;

        piece.body.wakeUp();
        piece.body.applyImpulse({ x: ix, y: iy }, true);
        piece.body.applyTorqueImpulse(torque, true);
      }
    }
  }

  spawnFracture(x: number, y: number, radius: number, blastAngle: number, targetCount = 6, impulseForce = 220): void {
    if (!this.world || !this.isInitialized) return;

    // Generate irregular points around blast center for varied Delaunay shards
    const points: [number, number][] = [[x, y]];
    const n = Math.max(6, Math.min(14, targetCount + 3));

    // Inner ring (close, jagged)
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = radius * (0.28 + Math.random() * 0.42);
      points.push([x + Math.cos(angle) * dist, y + Math.sin(angle) * dist]);
    }
    // Outer perimeter points (producing elongated or sharp peripheral shards)
    const outerCount = Math.max(4, Math.floor(n * 0.7));
    for (let i = 0; i < outerCount; i++) {
      const angle = (i / outerCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const dist = radius * (0.75 + Math.random() * 0.45);
      points.push([x + Math.cos(angle) * dist, y + Math.sin(angle) * dist]);
    }

    const delaunay = Delaunator.from(points);
    const triangles = delaunay.triangles;

    for (let i = 0; i < triangles.length; i += 3) {
      const p0 = points[triangles[i]];
      const p1 = points[triangles[i + 1]];
      const p2 = points[triangles[i + 2]];

      const gx = (p0[0] + p1[0] + p2[0]) / 3;
      const gy = (p0[1] + p1[1] + p2[1]) / 3;

      // Verify centroid is within paper coordinates
      const sx = gx - PAPER.x;
      const sy = gy - PAPER.y;
      if (sx < 0 || sx >= PAPER.width || sy < 0 || sy >= PAPER.height) continue;

      const minX = Math.min(p0[0], p1[0], p2[0]);
      const maxX = Math.max(p0[0], p1[0], p2[0]);
      const minY = Math.min(p0[1], p1[1], p2[1]);
      const maxY = Math.max(p0[1], p1[1], p2[1]);

      // Allow varied shard sizes between 8px and 52px
      const w = Math.max(8, Math.min(54, Math.round(maxX - minX)));
      const h = Math.max(8, Math.min(54, Math.round(maxY - minY)));

      const frameCropX = clamp(Math.round(minX - PAPER.x), 0, PAPER.width - w);
      const frameCropY = clamp(Math.round(minY - PAPER.y), 0, PAPER.height - h);

      // Local triangle coordinates relative to bounding box for canvas clipping
      const paperLeft = frameCropX + PAPER.x;
      const paperTop = frameCropY + PAPER.y;
      const v0 = { x: p0[0] - paperLeft, y: p0[1] - paperTop };
      const v1 = { x: p1[0] - paperLeft, y: p1[1] - paperTop };
      const v2 = { x: p2[0] - paperLeft, y: p2[1] - paperTop };

      // Precise origin offset so visual sprite rotates exactly around centroid (gx, gy)
      const originX = clamp((gx - paperLeft) / w, 0.05, 0.95);
      const originY = clamp((gy - paperTop) / h, 0.05, 0.95);

      // Enforce debris capacity to maintain stable 60 FPS
      if (this.activeDebris.length >= this.maxDebris) {
        this.removeDebris(0);
      }

      const frameKey = `poly-${this.serial++}`;
      if (this.host.addDebrisPolygon) {
        this.host.addDebrisPolygon({
          frameKey,
          cropX: frameCropX,
          cropY: frameCropY,
          width: w,
          height: h,
          v0,
          v1,
          v2,
        });
      } else if (this.host.addDebrisFrame) {
        this.host.addDebrisFrame(frameKey, frameCropX, frameCropY, w, h);
      }

      const visual = this.host.createDebrisImage(gx, gy, frameKey, originX, originY);

      // Create dynamic rigid body in Rapier with Continuous Collision Detection (CCD)
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(gx, gy)
        .setCcdEnabled(true);
      const body = this.world.createRigidBody(bodyDesc);

      // Local triangle coordinates relative to centroid
      const la = [p0[0] - gx, p0[1] - gy];
      const lb = [p1[0] - gx, p1[1] - gy];
      const lc = [p2[0] - gx, p2[1] - gy];

      // Area of triangle (twice the signed area)
      const area2 = Math.abs(la[0] * (lb[1] - lc[1]) + lb[0] * (lc[1] - la[1]) + lc[0] * (la[1] - lb[1]));
      let colliderDesc: RAPIER.ColliderDesc;

      if (area2 > 8.0) {
        colliderDesc = RAPIER.ColliderDesc.triangle(
          { x: la[0], y: la[1] },
          { x: lb[0], y: lb[1] },
          { x: lc[0], y: lc[1] },
        );
      } else {
        colliderDesc = RAPIER.ColliderDesc.cuboid(Math.max(2, w / 2), Math.max(2, h / 2));
      }

      colliderDesc.setRestitution(0.25);
      colliderDesc.setFriction(0.75);
      this.world.createCollider(colliderDesc, body);

      // Velocity impulse: outward blast + lift
      const radialAngle = Math.atan2(gy - y, gx - x);
      const speed = impulseForce * (0.65 + Math.random() * 0.7);
      const vx = Math.cos(radialAngle) * speed + Math.cos(blastAngle) * 40;
      const vy = Math.sin(radialAngle) * speed - (85 + Math.random() * 150);
      const angularVel = (Math.random() - 0.5) * 16;

      body.setLinvel({ x: vx, y: vy }, true);
      body.setAngvel(angularVel, true);

      this.activeDebris.push({
        visual,
        body,
        frameKey,
        createdTime: Date.now(),
      });
    }
  }

  update(): void {
    if (!this.world || !this.isInitialized) return;
    this.world.step();

    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const piece = this.activeDebris[i];
      const pos = piece.body.translation();
      const rot = piece.body.rotation();

      // If fallen below viewport, recycle
      if (pos.y > WORLD.height + 40 || pos.x < -60 || pos.x > WORLD.width + 60) {
        this.removeDebris(i);
        continue;
      }

      piece.visual.setPosition(pos.x, pos.y);
      piece.visual.setRotation(rot);
    }
  }

  private removeDebris(index: number): void {
    const [piece] = this.activeDebris.splice(index, 1);
    if (!piece) return;

    piece.visual.destroy();
    this.host.removeDebrisFrame(piece.frameKey);

    if (this.world) {
      this.world.removeRigidBody(piece.body);
    }
  }

  reset(): void {
    while (this.activeDebris.length > 0) {
      this.removeDebris(0);
    }

    // Rebuild platform colliders on reset
    if (this.world) {
      for (const seg of this.platformSegments) {
        this.world.removeRigidBody(seg.body);
      }
      this.platformSegments = [];
      this.buildPlatformColliders();
    }
  }

  destroy(): void {
    this.reset();
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.isInitialized = false;
  }
}
