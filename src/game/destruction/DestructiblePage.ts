import * as Phaser from 'phaser';
import { RegionMask, type DamageResult } from './RegionMask';
import { PAPER } from '../tuning';
import { drawDemoPage } from '../fixtures/demoPage';

export class DestructiblePage {
  readonly mask = new RegionMask(PAPER.width, PAPER.height);
  readonly original = drawDemoPage();
  readonly regions: { x: number; y: number; texture: Phaser.Textures.CanvasTexture }[] = [];
  readonly source: Phaser.Textures.CanvasTexture;

  constructor(scene: Phaser.Scene) {
    this.source = scene.textures.addCanvas('paper-source', this.original)!;
    const size = this.mask.regionSize;
    for (let y = 0; y < PAPER.height; y += size) for (let x = 0; x < PAPER.width; x += size) {
      const texture = scene.textures.createCanvas(`paper-${x}-${y}`, Math.min(size, PAPER.width - x), Math.min(size, PAPER.height - y))!;
      this.regions.push({ x, y, texture });
      scene.add.image(PAPER.x + x, PAPER.y + y, texture.key).setOrigin(0).setDepth(10);
      this.refresh(this.regions.length - 1);
    }
  }

  hit(x: number, y: number) { return this.mask.solid(x - PAPER.x, y - PAPER.y); }

  damage(x: number, y: number, radius: number, seed: number): DamageResult {
    const damage = this.mask.damage(x - PAPER.x, y - PAPER.y, radius, seed);
    damage.dirty.forEach(index => this.refresh(index));
    return damage;
  }

  refresh(index: number) {
    const { x, y, texture } = this.regions[index];
    const ctx = texture.context;
    ctx.clearRect(0, 0, texture.width, texture.height);
    ctx.drawImage(this.original, -x, -y);
    const step = this.mask.cellSize;
    const step2 = step * 2;
    for (let py = y; py < y + texture.height; py += step) {
      for (let px = x; px < x + texture.width; px += step) {
        if (!this.mask.solid(px, py)) {
          ctx.clearRect(px - x, py - y, step, step);
        } else {
          // Direct border: intense dark carbon charring
          const hasEmptyDirect = (
            (!this.mask.contains(px - step, py) || !this.mask.solid(px - step, py)) ||
            (!this.mask.contains(px + step, py) || !this.mask.solid(px + step, py)) ||
            (!this.mask.contains(px, py - step) || !this.mask.solid(px, py - step)) ||
            (!this.mask.contains(px, py + step) || !this.mask.solid(px, py + step))
          );
          if (hasEmptyDirect) {
            ctx.fillStyle = '#17110dee';
            ctx.fillRect(px - x, py - y, step, step);
            // Incandescent hot ember micro-speck (deterministic from position hash)
            if (((px * 19 + py * 31) & 15) === 0) {
              ctx.fillStyle = '#ff6b00ee';
              ctx.fillRect(px - x, py - y, step, step);
            }
          } else {
            // Secondary halo: burnt umber dither
            const hasEmptyNear = (
              (!this.mask.contains(px - step2, py) || !this.mask.solid(px - step2, py)) ||
              (!this.mask.contains(px + step2, py) || !this.mask.solid(px + step2, py)) ||
              (!this.mask.contains(px, py - step2) || !this.mask.solid(px, py - step2)) ||
              (!this.mask.contains(px, py + step2) || !this.mask.solid(px, py + step2))
            );
            if (hasEmptyNear && ((px + py) & 2) === 0) {
              ctx.fillStyle = '#3c241566';
              ctx.fillRect(px - x, py - y, step, step);
            }
          }
        }
      }
    }
    texture.refresh();
  }

  reset() { this.mask.reset(); this.regions.forEach((_, i) => this.refresh(i)); }
}
