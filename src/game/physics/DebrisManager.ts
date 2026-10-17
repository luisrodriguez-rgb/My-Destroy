import RAPIER from '@dimforge/rapier2d-compat';
import Delaunator from 'delaunator';
import { PAPER, WORLD } from '../tuning';
import { getDemoPlatforms } from '../platforms/demoPlatforms';

export interface VisualDebris {
  setPosition(x: number, y: number): void;
  setRotation(angle: number): void;
  destroy(): void;
}

export interface DebrisHost {
  createDebrisImage(x: number, y: number, frameKey: string): VisualDebris;
  addDebrisFrame(frameKey: string, x: number, y: number, w: number, h: number): void;
  removeDebrisFrame(frameKey: string): void;
}

export interface DebrisPiece {
  visual: VisualDebris;
  body: RAPIER.RigidBody;
  frameKey: string;
  createdTime: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export class DebrisManager {
  private world: RAPIER.World | null = null;
  private activeDebris: DebrisPiece[] = [];
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
    const floorY = WORLD.floor;
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(WORLD.width / 2, floorY + 12);
    const floorBody = this.world.createRigidBody(floorDesc);
    const floorCollider = RAPIER.ColliderDesc.cuboid(WORLD.width / 2 + 100, 10.0);
    floorCollider.setFriction(0.85);
    floorCollider.setRestitution(0.25);
    this.world.createCollider(floorCollider, floorBody);

    // 2. Side walls to contain debris within screen bounds
    const leftWallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(-15, WORLD.height / 2);
    const leftWall = this.world.createRigidBody(leftWallDesc);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(10.0, WORLD.height / 2 + 50), leftWall);

    const rightWallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(WORLD.width + 15, WORLD.height / 2);
    const rightWall = this.world.createRigidBody(rightWallDesc);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(10.0, WORLD.height / 2 + 50), rightWall);

    // 3. Static platform colliders (so debris can stack on platforms too)
    const platforms = getDemoPlatforms();
    for (const p of platforms) {
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      const pBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy));
      const pCol = RAPIER.ColliderDesc.cuboid(p.width / 2, p.height / 2);
      pCol.setFriction(0.8);
      pCol.setRestitution(0.2);
      this.world.createCollider(pCol, pBody);
    }

    this.isInitialized = true;
  }

  get count(): number {
    return this.activeDebris.length;
  }

  spawnFracture(x: number, y: number, radius: number, blastAngle: number, targetCount = 6, impulseForce = 220): void {
    if (!this.world || !this.isInitialized) return;

    // Generate points around blast center
    const points: [number, number][] = [[x, y]];
    const n = Math.max(5, Math.min(10, targetCount + 2));
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = radius * (0.35 + Math.random() * 0.7);
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

      const w = Math.max(6, Math.min(36, Math.round(maxX - minX)));
      const h = Math.max(6, Math.min(36, Math.round(maxY - minY)));

      const frameCropX = clamp(Math.round(minX - PAPER.x), 0, PAPER.width - w);
      const frameCropY = clamp(Math.round(minY - PAPER.y), 0, PAPER.height - h);

      // Enforce debris capacity to maintain stable 60 FPS
      if (this.activeDebris.length >= this.maxDebris) {
        this.removeDebris(0);
      }

      const frameKey = `poly-${this.serial++}`;
      this.host.addDebrisFrame(frameKey, frameCropX, frameCropY, w, h);
      const visual = this.host.createDebrisImage(gx, gy, frameKey);

      // Create dynamic rigid body in Rapier
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(gx, gy);
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

      colliderDesc.setRestitution(0.3);
      colliderDesc.setFriction(0.7);
      this.world.createCollider(colliderDesc, body);

      // Velocity impulse: outward blast + lift
      const radialAngle = Math.atan2(gy - y, gx - x);
      const speed = impulseForce * (0.6 + Math.random() * 0.7);
      const vx = Math.cos(radialAngle) * speed + Math.cos(blastAngle) * 35;
      const vy = Math.sin(radialAngle) * speed - (80 + Math.random() * 140);
      const angularVel = (Math.random() - 0.5) * 14;

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

      piece.visual.setPosition(pos.x, pos.y);
      piece.visual.setRotation(rot);

      // Recycle if fallen below screen
      if (pos.y > WORLD.height + 60 || pos.x < -60 || pos.x > WORLD.width + 60) {
        this.removeDebris(i);
      }
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
