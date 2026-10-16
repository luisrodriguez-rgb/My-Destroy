export type Cell = { x: number; y: number };
export type DamageResult = { removed: Cell[]; dirty: Set<number> };

/** The CPU mask is shared by hit detection, visible holes, and the area counter. */
export class RegionMask {
  readonly columns: number;
  readonly rows: number;
  readonly regionColumns: number;
  readonly cells: Uint8Array;
  removedCount = 0;

  constructor(readonly width: number, readonly height: number, readonly cellSize = 2, readonly regionSize = 128) {
    if (width <= 0 || height <= 0 || cellSize <= 0 || regionSize % cellSize !== 0 || width % cellSize !== 0 || height % cellSize !== 0) {
      throw new Error('Mask dimensions must be positive and aligned to whole cells.');
    }
    this.columns = width / cellSize;
    this.rows = height / cellSize;
    this.regionColumns = Math.ceil(width / regionSize);
    this.cells = new Uint8Array(this.columns * this.rows).fill(1);
  }

  contains(x: number, y: number) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  solid(x: number, y: number): boolean {
    return this.contains(x, y) && this.cells[Math.floor(y / this.cellSize) * this.columns + Math.floor(x / this.cellSize)] === 1;
  }
  regionAt(x: number, y: number) { return Math.floor(y / this.regionSize) * this.regionColumns + Math.floor(x / this.regionSize); }
  get percent() { return this.removedCount / this.cells.length * 100; }

  damage(x: number, y: number, radius: number, seed: number): DamageResult {
    const result: DamageResult = { removed: [], dirty: new Set() };
    if (![x, y, radius, seed].every(Number.isFinite) || radius <= 0) return result;
    const extent = radius * 1.16;
    const minX = Math.max(0, Math.floor((x - extent) / this.cellSize));
    const maxX = Math.min(this.columns - 1, Math.floor((x + extent) / this.cellSize));
    const minY = Math.max(0, Math.floor((y - extent) / this.cellSize));
    const maxY = Math.min(this.rows - 1, Math.floor((y + extent) / this.cellSize));
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      const dx = (cx + 0.5) * this.cellSize - x;
      const dy = (cy + 0.5) * this.cellSize - y;
      const angle = Math.atan2(dy, dx);
      const edge = radius * (1 + 0.09 * Math.sin(angle * 7 + seed) + 0.06 * Math.cos(angle * 11 - seed));
      const index = cy * this.columns + cx;
      if (dx * dx + dy * dy > edge * edge || !this.cells[index]) continue;
      this.cells[index] = 0;
      this.removedCount++;
      const px = cx * this.cellSize, py = cy * this.cellSize;
      result.removed.push({ x: px, y: py });
      // Adjacent regions can acquire a scorched edge even when only this cell is removed.
      for (const [ox, oy] of [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
        if (this.contains(px + ox, py + oy)) result.dirty.add(this.regionAt(px + ox, py + oy));
      }
    }
    return result;
  }

  reset() { this.cells.fill(1); this.removedCount = 0; }
}
