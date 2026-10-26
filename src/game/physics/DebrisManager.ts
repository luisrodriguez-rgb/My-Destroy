import RAPIER from '@dimforge/rapier2d-compat';
import Delaunator from 'delaunator';
import { PAPER, WORLD } from '../tuning';
import { getDemoPlatforms, type Platform } from '../platforms/demoPlatforms';

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
  v0?: { x: number; y: number };
  v1?: { x: number; y: number };
  v2?: { x: number; y: number };
  vertices?: Array<{ x: number; y: number }>;
}

export interface LetterDebrisData {
  id: string;
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface DebrisHost {
  createDebrisImage(x: number, y: number, frameKey: string, originX?: number, originY?: number): VisualDebris;
  addDebrisPolygon?(data: DebrisPolygonData): void;
  addDebrisFrame?(frameKey: string, x: number, y: number, w: number, h: number): void;
  addLetterFrame?(frameKey: string, charData: LetterDebrisData): void;
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

export interface DetachableData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tag: string;
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
  private currentPlatforms: Platform[] = getDemoPlatforms();

  constructor(private host: DebrisHost) {}

  async init(): Promise<void> {
    if (this.isInitialized) return;
    await RAPIER.init();
    // Gravity pointing downwards towards catwalk
    this.world = new RAPIER.World({ x: 0.0, y: 880.0 });

    // 1. Catwalk floor collider at y = 524 (6px margin above catwalk line y=530 to guarantee zero protrusion)
    const floorTop = 524;
    const floorHalfHeight = 50.0;
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(WORLD.width / 2, floorTop + floorHalfHeight);
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
    this.buildPlatformColliders(this.currentPlatforms);

    this.isInitialized = true;
  }

  setPlatforms(platforms: Platform[]): void {
    this.currentPlatforms = platforms;
    if (!this.world) return;
    for (const seg of this.platformSegments) {
      this.world.removeRigidBody(seg.body);
    }
    this.platformSegments = [];
    this.buildPlatformColliders(this.currentPlatforms);
  }

  private buildPlatformColliders(platforms: Platform[] = this.currentPlatforms): void {
    if (!this.world) return;
    const segWidth = 24;
    for (const p of platforms) {
      for (let sx = p.x; sx < p.x + p.width; sx += segWidth) {
        const sw = Math.min(segWidth, p.x + p.width - sx);
        const cx = sx + sw / 2;
        const cy = p.y + 2.0; // Thin landing sheet at the very top edge of platform
        const pBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy));
        const pCol = RAPIER.ColliderDesc.cuboid(sw / 2, 2.0);
        pCol.setFriction(0.8);
        pCol.setRestitution(0.2);
        const collider = this.world.createCollider(pCol, pBody);
        this.platformSegments.push({
          cx,
          cy,
          width: sw,
          height: 4.0,
          body: pBody,
          collider,
          active: true,
        });
      }
    }
  }

  spawnDetachable(data: DetachableData, frameKey: string): void {
    if (!this.world || !this.isInitialized) return;

    if (this.activeDebris.length >= this.maxDebris) {
      this.removeDebris(0);
    }

    const cx = data.x + data.width / 2;
    const cy = data.y + data.height / 2;

    const visual = this.host.createDebrisImage(cx, cy, frameKey, 0.5, 0.5);

    // Dynamic rectangular rigid body in Rapier2D with CCD
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(cx, cy)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(data.width / 2, data.height / 2);
    colliderDesc.setRestitution(0.2);
    colliderDesc.setFriction(0.75);
    this.world.createCollider(colliderDesc, body);

    const kickX = (Math.random() - 0.5) * 45;
    const kickY = 15 + Math.random() * 25;
    const torque = (Math.random() - 0.5) * 9;
    body.setLinvel({ x: kickX, y: kickY }, true);
    body.setAngvel(torque, true);

    this.activeDebris.push({
      visual,
      body,
      frameKey,
      createdTime: Date.now(),
    });
  }

  spawnLetterDebris(
    data: LetterDebrisData,
    frameKey: string,
    radialAngle = -Math.PI / 2,
    blastSpeed = 160
  ): void {
    if (!this.world || !this.isInitialized) return;

    if (this.activeDebris.length >= this.maxDebris) {
      this.removeDebris(0);
    }

    if (this.host.addLetterFrame) {
      this.host.addLetterFrame(frameKey, data);
    }

    const cx = data.x + data.width / 2;
    const cy = data.y + data.height / 2;

    const visual = this.host.createDebrisImage(cx, cy, frameKey, 0.5, 0.5);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(cx, cy)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);

    const halfW = Math.max(3, data.width / 2);
    const halfH = Math.max(4, data.height / 2);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, halfH);
    colliderDesc.setRestitution(0.35);
    colliderDesc.setFriction(0.65);
    this.world.createCollider(colliderDesc, body);

    const speed = blastSpeed * (0.7 + Math.random() * 0.6);
    const vx = Math.cos(radialAngle) * speed + (Math.random() - 0.5) * 35;
    const vy = Math.sin(radialAngle) * speed - (60 + Math.random() * 90);
    const torque = (Math.random() - 0.5) * 16;

    body.setLinvel({ x: vx, y: vy }, true);
    body.setAngvel(torque, true);

    this.activeDebris.push({
      visual,
      body,
      frameKey,
      createdTime: Date.now(),
    });
  }

  get count(): number {
    return this.activeDebris.length;
  }

  get activeSegmentsCount(): number {
    return this.platformSegments.filter(s => s.active).length;
  }

  /**
   * Synchronizes platform colliders against RegionMask destruction.
   * If any supporting point is damaged, the Rapier collider is immediately removed
   * and resting debris receives a downward nudge so nothing hangs like stalactites.
   */
  syncPlatforms(isSolid: (x: number, y: number) => boolean): void {
    if (!this.world || !this.isInitialized) return;
    for (const seg of this.platformSegments) {
      // Sample 3 points along the thin top edge
      const topY = seg.cy - 1;
      const solidLeft = isSolid(seg.cx - seg.width * 0.35, topY);
      const solidCenter = isSolid(seg.cx, topY);
      const solidRight = isSolid(seg.cx + seg.width * 0.35, topY);
      const allSolid = solidCenter && solidLeft && solidRight;

      // Aggressive deactivation: if any sample point is punctured, dissolve collider
      if (seg.active && !allSolid) {
        this.world.removeCollider(seg.collider, true);
        seg.active = false;
        // Wake up resting debris and apply a downward push
        for (const piece of this.activeDebris) {
          const pos = piece.body.translation();
          if (Math.abs(pos.x - seg.cx) < seg.width / 2 + 10 && Math.abs(pos.y - seg.cy) < 24) {
            piece.body.wakeUp();
            piece.body.applyImpulse({ x: (Math.random() - 0.5) * 12, y: 16 }, true);
          }
        }
      } else if (!seg.active && allSolid) {
        // Reactivate collider when platform surface is repaired
        const pCol = RAPIER.ColliderDesc.cuboid(seg.width / 2, 2.0);
        pCol.setFriction(0.8);
        pCol.setRestitution(0.2);
        seg.collider = this.world.createCollider(pCol, seg.body);
        seg.active = true;
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

  /**
   * Applies an inward gravitational vortex force pulling nearby debris towards (x, y)
   * with tangential spiral torque and event horizon annihilation.
   */
  applyVortexPull(x: number, y: number, pullRadius: number, pullForce = 350, dt = 0.016): void {
    if (!this.world || !this.isInitialized) return;
    const pullRadiusSq = pullRadius * pullRadius;

    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const piece = this.activeDebris[i];
      const pos = piece.body.translation();
      const dx = x - pos.x;
      const dy = y - pos.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < pullRadiusSq && distSq > 0.01) {
        const dist = Math.sqrt(distSq);

        // If swallowed into event horizon (< 14px), annihilate
        if (dist < 14) {
          this.removeDebris(i);
          continue;
        }

        piece.body.wakeUp();
        const factor = Math.max(0.15, 1 - dist / pullRadius);
        const force = pullForce * factor;

        // Inward pull towards singularity center
        const pullX = (dx / dist) * force;
        const pullY = (dy / dist) * force;

        // Tangential spiral swirl
        const swirlSpeed = force * 0.45;
        const swirlX = (-dy / dist) * swirlSpeed;
        const swirlY = (dx / dist) * swirlSpeed;

        const impulseX = (pullX + swirlX) * dt * 35;
        const impulseY = (pullY + swirlY) * dt * 35;

        piece.body.applyImpulse({ x: impulseX, y: impulseY }, true);
        piece.body.applyTorqueImpulse((Math.random() - 0.5) * 8 * dt, true);
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

      // Triangle area via cross product
      const area2 = Math.abs(
        p0[0] * (p1[1] - p2[1]) +
        p1[0] * (p2[1] - p0[1]) +
        p2[0] * (p0[1] - p1[1])
      );
      const area = 0.5 * area2;

      // Discard micro-crumbs (< 45 px^2) to prevent small crumbs lining up on text platforms
      if (area < 45.0) continue;

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
          vertices: [v0, v1, v2],
        });
      } else if (this.host.addDebrisFrame) {
        this.host.addDebrisFrame(frameKey, frameCropX, frameCropY, w, h);
      }

      // Spawn clearance: prevent triangles from spawning inside or stuck against platform colliders
      let spawnY = gy;
      for (const seg of this.platformSegments) {
        if (!seg.active) continue;
        if (Math.abs(gx - seg.cx) < seg.width / 2 + 6) {
          const dy = spawnY - seg.cy;
          if (Math.abs(dy) < 10) {
            spawnY = dy < 0 ? seg.cy - 12 : seg.cy + 12;
          }
        }
      }

      const visual = this.host.createDebrisImage(gx, spawnY, frameKey, originX, originY);

      // Create dynamic rigid body in Rapier with Continuous Collision Detection (CCD)
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(gx, spawnY)
        .setCcdEnabled(true);
      const body = this.world.createRigidBody(bodyDesc);

      // Local triangle coordinates relative to centroid
      const la = [p0[0] - gx, p0[1] - gy];
      const lb = [p1[0] - gx, p1[1] - gy];
      const lc = [p2[0] - gx, p2[1] - gy];

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

    // Spawn varied paper tear splinters (elongated strips)
    const splinterCount = Math.min(2, Math.max(1, Math.floor(targetCount / 3)));
    for (let s = 0; s < splinterCount; s++) {
      if (this.activeDebris.length >= this.maxDebris) this.removeDebris(0);
      const sAngle = blastAngle + (Math.random() - 0.5) * 1.6;
      const sDist = radius * (0.45 + Math.random() * 0.45);
      const sx = x + Math.cos(sAngle) * sDist;
      const sy = y + Math.sin(sAngle) * sDist;
      const paperX = sx - PAPER.x;
      const paperY = sy - PAPER.y;
      if (paperX < 0 || paperX >= PAPER.width - 24 || paperY < 0 || paperY >= PAPER.height - 24) continue;

      const sw = Math.round(5 + Math.random() * 4); // 5-9px narrow strip
      const sh = Math.round(16 + Math.random() * 16); // 16-32px elongated strip
      const cropX = clamp(Math.round(paperX), 0, PAPER.width - sw);
      const cropY = clamp(Math.round(paperY), 0, PAPER.height - sh);

      const frameKey = `splinter-${this.serial++}`;
      if (this.host.addDebrisPolygon) {
        const skew = (Math.random() - 0.5) * 4;
        this.host.addDebrisPolygon({
          frameKey,
          cropX,
          cropY,
          width: sw,
          height: sh,
          vertices: [
            { x: Math.max(0, skew), y: 0 },
            { x: sw, y: Math.max(0, -skew) },
            { x: Math.max(0, sw - skew), y: sh },
            { x: 0, y: Math.max(0, sh + skew) },
          ],
        });
      } else if (this.host.addDebrisFrame) {
        this.host.addDebrisFrame(frameKey, cropX, cropY, sw, sh);
      }

      const visual = this.host.createDebrisImage(sx, sy, frameKey, 0.5, 0.5);
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(sx, sy).setCcdEnabled(true);
      const body = this.world.createRigidBody(bodyDesc);
      const colDesc = RAPIER.ColliderDesc.cuboid(sw / 2, sh / 2);
      colDesc.setRestitution(0.3);
      colDesc.setFriction(0.7);
      this.world.createCollider(colDesc, body);

      const speed = impulseForce * (0.8 + Math.random() * 0.5);
      const vx = Math.cos(sAngle) * speed;
      const vy = Math.sin(sAngle) * speed - (100 + Math.random() * 120);
      body.setLinvel({ x: vx, y: vy }, true);
      body.setAngvel((Math.random() - 0.5) * 20, true);

      this.activeDebris.push({ visual, body, frameKey, createdTime: Date.now() });
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
      this.buildPlatformColliders(this.currentPlatforms);
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
