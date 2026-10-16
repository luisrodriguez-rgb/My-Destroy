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
    ctx.fillStyle = '#51433088';
    for (let py = y; py < y + texture.height; py += step) for (let px = x; px < x + texture.width; px += step) {
      if (!this.mask.solid(px, py)) ctx.clearRect(px - x, py - y, step, step);
      else if ([[px-step, py], [px+step, py], [px, py-step], [px, py+step]].some(([nx, ny]) => this.mask.contains(nx, ny) && !this.mask.solid(nx, ny))) {
        ctx.fillRect(px - x, py - y, step, step);
      }
    }
    texture.refresh();
  }

  reset() { this.mask.reset(); this.regions.forEach((_, i) => this.refresh(i)); }
}
