import RAPIER from '@dimforge/rapier2d-compat';
import Delaunator from 'delaunator';
import { PAPER, PLATFORM_MATERIALS, WORLD, type PlatformMaterial } from '../tuning';
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
  /** Fired when a slab segment gives way structurally (unstable island or debris overload). */
  onPlatformSegmentCollapse?(seg: {
    platformId: string;
    cx: number;
    cy: number;
    width: number;
    height: number;
    material: PlatformMaterial;
  }): void;
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
  platformId: string;
  material: PlatformMaterial;
  /** 0..1 fraction of crust + inner stratum samples still solid in the mask. */
  integrity: number;
  /** Max debris pieces resting on the segment before it fails. */
  maxLoad: number;
  /** Set when debris weight broke the segment; only a real mask repair restores it. */
  collapsedByOverload?: boolean;
  /** Set when the segment was an unsupported island; restored once its neighbours hold again. */
  collapsedByInstability?: boolean;
  /** Crust state seen in the previous sync, used to detect repair transitions. */
  wasTopSolid?: boolean;
}

/** Materials too brittle to keep a lone segment hanging between two holes. */
const FRAGILE_MATERIALS: ReadonlySet<PlatformMaterial> = new Set<PlatformMaterial>(['glass', 'paper', 'wood']);

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
  private boundsHeight = WORLD.height;
  private paperHeight = PAPER.height;
  private playerFloorY = WORLD.floor - 4;
  private floorBody: RAPIER.RigidBody | null = null;
  private wallBodies: RAPIER.RigidBody[] = [];

  constructor(private host: DebrisHost) {}

  async init(): Promise<void> {
    if (this.isInitialized) return;
    await RAPIER.init();
    // Gravity pointing downwards towards catwalk
    this.world = new RAPIER.World({ x: 0.0, y: 880.0 });
    this.rebuildBounds();

    // Segmented platform colliders (so debris can stack and fall when platforms are destroyed)
    this.buildPlatformColliders(this.currentPlatforms);

    this.isInitialized = true;
  }

  /** Lengthen the shaft when the page grows. A one-fold call rebuilds the same floor and walls. */
  setWorldExtent(worldHeight: number, playerFloorY: number, paperHeight: number): void {
    this.boundsHeight = worldHeight;
    this.playerFloorY = playerFloorY;
    this.paperHeight = paperHeight;
    if (!this.world) return;
    this.rebuildBounds();
  }

  private rebuildBounds(): void {
    if (!this.world) return;
    if (this.floorBody) {
      this.world.removeRigidBody(this.floorBody);
      this.floorBody = null;
    }
    for (const wall of this.wallBodies) this.world.removeRigidBody(wall);
    this.wallBodies = [];

    // Catwalk collider sits 6px above the player's feet so debris cannot poke through the floor line.
    const floorTop = this.playerFloorY - 6;
    const floorHalfHeight = 50.0;
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(WORLD.width / 2, floorTop + floorHalfHeight);
    this.floorBody = this.world.createRigidBody(floorDesc);
    const floorCollider = RAPIER.ColliderDesc.cuboid(WORLD.width / 2 + 100, floorHalfHeight);
    floorCollider.setFriction(0.85);
    floorCollider.setRestitution(0.2);
    this.world.createCollider(floorCollider, this.floorBody);

    const midY = this.boundsHeight / 2;
    const halfH = this.boundsHeight / 2 + 50;
    const leftWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-15, midY));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(10.0, halfH), leftWall);
    const rightWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(WORLD.width + 15, midY));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(10.0, halfH), rightWall);
    this.wallBodies = [leftWall, rightWall];
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
      const material = p.material ?? 'paper';
      const profile = PLATFORM_MATERIALS[material];
      for (let sx = p.x; sx < p.x + p.width; sx += segWidth) {
        const sw = Math.min(segWidth, p.x + p.width - sx);
        const cx = sx + sw / 2;
        const cy = p.y + 2.0; // Thin landing sheet at the very top edge of platform
        const pBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy));
        const collider = this.world.createCollider(this.segmentColliderDesc(sw, material), pBody);
        this.platformSegments.push({
          cx,
          cy,
          width: sw,
          height: 4.0,
          body: pBody,
          collider,
          active: true,
          platformId: p.id,
          material,
          integrity: 1,
          maxLoad: profile.maxLoad,
          wasTopSolid: true,
        });
      }
    }
  }

  private segmentColliderDesc(width: number, material: PlatformMaterial): RAPIER.ColliderDesc {
    const profile = PLATFORM_MATERIALS[material];
    const desc = RAPIER.ColliderDesc.cuboid(width / 2, 2.0);
    desc.setFriction(profile.friction);
    desc.setRestitution(profile.restitution);
    return desc;
  }

  private deactivateSegment(seg: PlatformSegment): void {
    if (!this.world || !seg.active) return;
    this.world.removeCollider(seg.collider, true);
    seg.active = false;
  }

  private reactivateSegment(seg: PlatformSegment): void {
    if (!this.world || seg.active) return;
    seg.collider = this.world.createCollider(this.segmentColliderDesc(seg.width, seg.material), seg.body);
    seg.active = true;
    seg.collapsedByOverload = false;
    seg.collapsedByInstability = false;
  }

  /** Wakes debris resting near a segment and nudges it downward so nothing hangs mid-air. */
  private wakeDebrisNear(seg: PlatformSegment, pushY = 16): void {
    for (const piece of this.activeDebris) {
      const pos = piece.body.translation();
      if (Math.abs(pos.x - seg.cx) < seg.width / 2 + 10 && Math.abs(pos.y - seg.cy) < 24) {
        piece.body.wakeUp();
        piece.body.applyImpulse({ x: (Math.random() - 0.5) * 12, y: pushY }, true);
      }
    }
  }

  private notifyCollapse(seg: PlatformSegment): void {
    this.host.onPlatformSegmentCollapse?.({
      platformId: seg.platformId,
      cx: seg.cx,
      cy: seg.cy,
      width: seg.width,
      height: seg.height,
      material: seg.material,
    });
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
   * Pass 1: any punctured crust sample removes the Rapier collider immediately (resting debris
   * gets a downward nudge so nothing hangs like stalactites); integrity also samples the inner stratum.
   * Pass 2: on brittle materials, a lone segment left between two holes collapses as well.
   */
  syncPlatforms(isSolid: (x: number, y: number) => boolean): void {
    if (!this.world || !this.isInitialized) return;
    const topSolidBySeg = new Map<PlatformSegment, boolean>();

    // Pass 1: crust puncture + integrity
    for (const seg of this.platformSegments) {
      const topY = seg.cy - 1;
      const midY = seg.cy + Math.min(6, seg.height);
      const xs = [seg.cx - seg.width * 0.35, seg.cx, seg.cx + seg.width * 0.35];
      const top = xs.map(x => isSolid(x, topY));
      const mid = xs.map(x => isSolid(x, midY));
      const allSolid = top[0] && top[1] && top[2];
      seg.integrity = [...top, ...mid].filter(Boolean).length / 6;
      topSolidBySeg.set(seg, allSolid);

      if (seg.active && !allSolid) {
        this.deactivateSegment(seg);
        this.wakeDebrisNear(seg);
      } else if (!seg.active && allSolid) {
        if (seg.collapsedByOverload) {
          // Overload broke it: only a real repair (crust going from damaged to solid) restores it.
          if (seg.wasTopSolid === false) this.reactivateSegment(seg);
        } else if (!seg.collapsedByInstability) {
          // Reactivate collider when platform surface is repaired
          this.reactivateSegment(seg);
        }
        // Instability-collapsed segments are resolved in pass 2.
      }
      seg.wasTopSolid = allSolid;
    }

    // Pass 2: collapse unsupported islands on brittle slabs
    const groups = new Map<string, PlatformSegment[]>();
    for (const seg of this.platformSegments) {
      const list = groups.get(seg.platformId);
      if (list) list.push(seg);
      else groups.set(seg.platformId, [seg]);
    }

    for (const segs of groups.values()) {
      segs.sort((a, b) => a.cx - b.cx);
      // A segment "stands" if active, or if it only fell for lack of neighbours and its crust is intact.
      const standing = segs.map(seg => seg.active || (!!seg.collapsedByInstability && !!topSolidBySeg.get(seg)));
      const inactiveCount = standing.filter(st => !st).length;
      const eligible = segs.length >= 4 && inactiveCount >= 2 && FRAGILE_MATERIALS.has(segs[0].material);
      const unstable = new Set<number>();

      if (eligible) {
        let i = 0;
        while (i < segs.length) {
          if (!standing[i]) { i++; continue; }
          let j = i;
          while (j + 1 < segs.length && standing[j + 1]) j++;
          const runLength = j - i + 1;
          const flankedLeft = i > 0 && !standing[i - 1];
          const flankedRight = j < segs.length - 1 && !standing[j + 1];
          if (runLength <= 1 && flankedLeft && flankedRight) {
            for (let k = i; k <= j; k++) unstable.add(k);
          }
          i = j + 1;
        }
      }

      segs.forEach((seg, idx) => {
        if (unstable.has(idx)) {
          if (seg.active) {
            this.deactivateSegment(seg);
            seg.collapsedByInstability = true;
            this.wakeDebrisNear(seg, 22);
            this.notifyCollapse(seg);
          }
        } else if (!seg.active && seg.collapsedByInstability && topSolidBySeg.get(seg)) {
          // Neighbours hold again (or the slab is no longer eligible): the segment is supported.
          this.reactivateSegment(seg);
        }
      });
    }
  }

  /**
   * Fails active segments carrying more resting debris than their material allows.
   * Returns how many segments collapsed this step.
   */
  checkDebrisOverload(): number {
    if (!this.world || !this.isInitialized) return 0;
    let collapsed = 0;
    for (const seg of this.platformSegments) {
      if (!seg.active) continue;
      const load: DebrisPiece[] = [];
      for (const piece of this.activeDebris) {
        const pos = piece.body.translation();
        if (Math.abs(pos.x - seg.cx) < seg.width / 2 + 4 && pos.y >= seg.cy - 18 && pos.y <= seg.cy + 6) {
          load.push(piece);
        }
      }
      if (load.length <= seg.maxLoad) continue;

      this.deactivateSegment(seg);
      seg.collapsedByOverload = true;
      for (const piece of load) {
        piece.body.wakeUp();
        piece.body.applyImpulse({ x: (Math.random() - 0.5) * 10, y: 24 }, true);
      }
      this.notifyCollapse(seg);
      collapsed++;
    }
    return collapsed;
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
      if (sx < 0 || sx >= PAPER.width || sy < 0 || sy >= this.paperHeight) continue;

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
      const frameCropY = clamp(Math.round(minY - PAPER.y), 0, this.paperHeight - h);

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
      if (paperX < 0 || paperX >= PAPER.width - 24 || paperY < 0 || paperY >= this.paperHeight - 24) continue;

      const sw = Math.round(5 + Math.random() * 4); // 5-9px narrow strip
      const sh = Math.round(16 + Math.random() * 16); // 16-32px elongated strip
      const cropX = clamp(Math.round(paperX), 0, PAPER.width - sw);
      const cropY = clamp(Math.round(paperY), 0, this.paperHeight - sh);

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
    this.checkDebrisOverload();

    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const piece = this.activeDebris[i];
      const pos = piece.body.translation();
      const rot = piece.body.rotation();

      // Recycle pieces that have left the playable shaft.
      if (pos.y > this.boundsHeight + 40 || pos.x < -60 || pos.x > WORLD.width + 60) {
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
