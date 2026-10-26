import * as Phaser from 'phaser';
import { RegionMask, type DamageResult } from './RegionMask';
import { PAPER } from '../tuning';
import { drawDemoPage } from '../fixtures/demoPage';

export class DestructiblePage {
  readonly mask = new RegionMask(PAPER.width, PAPER.height);
  readonly original = drawDemoPage();
  readonly regions: { x: number; y: number; texture: Phaser.Textures.CanvasTexture }[] = [];
  readonly source: Phaser.Textures.CanvasTexture;
  private readonly pendingDirty = new Set<number>();

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

  damage(x: number, y: number, radius: number, seed: number, deferRefresh = false): DamageResult {
    const damage = this.mask.damage(x - PAPER.x, y - PAPER.y, radius, seed);
    if (deferRefresh) {
      damage.dirty.forEach(index => this.pendingDirty.add(index));
    } else {
      damage.dirty.forEach(index => this.refresh(index));
    }
    return damage;
  }

  repair(x: number, y: number, radius: number, deferRefresh = false): DamageResult {
    const repaired = this.mask.repair(x - PAPER.x, y - PAPER.y, radius);
    if (deferRefresh) {
      repaired.dirty.forEach(index => this.pendingDirty.add(index));
    } else {
      repaired.dirty.forEach(index => this.refresh(index));
    }
    return repaired;
  }

  flushDirty(): void {
    if (this.pendingDirty.size === 0) return;
    for (const index of this.pendingDirty) {
      if (index >= 0 && index < this.regions.length) {
        this.refresh(index);
      }
    }
    this.pendingDirty.clear();
  }

  refresh(index: number) {
    const { x, y, texture } = this.regions[index];
    const ctx = texture.context;
    ctx.clearRect(0, 0, texture.width, texture.height);
    ctx.drawImage(this.original, -x, -y);
    const step = this.mask.cellSize;
    const cols = this.mask.columns;
    const rows = this.mask.rows;
    const cells = this.mask.cells;
    const startCx = x / step;
    const endCx = (x + texture.width) / step;
    const startCy = y / step;
    const endCy = (y + texture.height) / step;

    for (let cy = startCy; cy < endCy; cy++) {
      const py = cy * step;
      const localY = py - y;
      const rowOffset = cy * cols;
      for (let cx = startCx; cx < endCx; cx++) {
        const px = cx * step;
        const localX = px - x;
        if (cells[rowOffset + cx] === 0) {
          ctx.clearRect(localX, localY, step, step);
        } else {
          // Direct border: intense dark carbon charring
          const hasEmptyDirect =
            cx === 0 || cells[rowOffset + cx - 1] === 0 ||
            cx + 1 >= cols || cells[rowOffset + cx + 1] === 0 ||
            cy === 0 || cells[rowOffset - cols + cx] === 0 ||
            cy + 1 >= rows || cells[rowOffset + cols + cx] === 0;

          if (hasEmptyDirect) {
            ctx.fillStyle = '#17110dee';
            ctx.fillRect(localX, localY, step, step);
            // Incandescent hot ember micro-speck (deterministic from position hash)
            if (((px * 19 + py * 31) & 15) === 0) {
              ctx.fillStyle = '#ff6b00ee';
              ctx.fillRect(localX, localY, step, step);
            }
          } else {
            // Secondary halo: burnt umber dither
            const hasEmptyNear =
              cx < 2 || cells[rowOffset + cx - 2] === 0 ||
              cx + 2 >= cols || cells[rowOffset + cx + 2] === 0 ||
              cy < 2 || cells[rowOffset - cols * 2 + cx] === 0 ||
              cy + 2 >= rows || cells[rowOffset + cols * 2 + cx] === 0;

            if (hasEmptyNear && ((px + py) & 2) === 0) {
              ctx.fillStyle = '#3c241566';
              ctx.fillRect(localX, localY, step, step);
            }
          }
        }
      }
    }
    texture.refresh();
  }

  loadPage(image: HTMLCanvasElement | HTMLImageElement) {
    const ctx = this.original.getContext('2d')!;
    ctx.clearRect(0, 0, PAPER.width, PAPER.height);
    ctx.drawImage(image, 0, 0, PAPER.width, PAPER.height);
    this.source.refresh();
    this.reset();
  }

  clearArea(x: number, y: number, width: number, height: number, deferRefresh = false): void {
    const damage = this.mask.clearRect(x, y, width, height);
    if (deferRefresh) {
      damage.dirty.forEach(index => this.pendingDirty.add(index));
    } else {
      damage.dirty.forEach(index => {
        if (index >= 0 && index < this.regions.length) {
          this.refresh(index);
        }
      });
    }
  }

  reset() {
    this.pendingDirty.clear();
    this.mask.reset();
    this.regions.forEach((_, i) => this.refresh(i));
  }
}
