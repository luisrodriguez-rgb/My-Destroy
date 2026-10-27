import { PAPER, WORLD } from './tuning';

/** How many folds a captured page may stack above the current stage. */
export const PAGE_FOLDS = 4;

/** Tallest page the stage will capture or play: four folds of the current paper. */
export const MAX_PAPER_HEIGHT = PAPER.height * PAGE_FOLDS;

/**
 * Page height in paper pixels.
 * A document that fits the first fold, within a few pixels, stays at that fold.
 * Taller documents grow by whole mask cells, up to four folds (1104 × 1952).
 */
export function paperHeightFor(contentHeight: number): number {
  if (!Number.isFinite(contentHeight) || contentHeight <= PAPER.height + 8) return PAPER.height;
  const even = Math.ceil(contentHeight / 2) * 2;
  return Math.min(MAX_PAPER_HEIGHT, even);
}

/** Folds spanned by a page height, from 1 to PAGE_FOLDS. */
export function foldCount(pageHeight: number): number {
  const height = paperHeightFor(pageHeight);
  return Math.max(1, Math.min(PAGE_FOLDS, Math.ceil(height / PAPER.height)));
}

export interface PageWorld {
  paperHeight: number;
  width: number;
  height: number;
  floor: number;
}

/** One fold keeps the current world. Each extra paper pixel lowers the catwalk by the same amount. */
export function worldForPaper(paperHeight: number): PageWorld {
  const height = paperHeightFor(paperHeight);
  const extra = height - PAPER.height;
  return {
    paperHeight: height,
    width: WORLD.width,
    height: WORLD.height + extra,
    floor: WORLD.floor + extra,
  };
}

/**
 * Fraction of the view where the operator's feet sit while the camera can still scroll.
 * Low enough that a player on the bottom catwalk is pinned to the same screen line as the one-fold stage.
 */
export const CAMERA_ANCHOR = 0.72;

/** Vertical scroll that keeps `focusY` in frame and inside the world. A one-fold world never scrolls. */
export function clampCameraY(
  focusY: number,
  worldHeight: number,
  viewHeight = WORLD.height,
  anchor = CAMERA_ANCHOR,
): number {
  const maxScroll = Math.max(0, worldHeight - viewHeight);
  if (maxScroll === 0) return 0;
  const desired = focusY - viewHeight * anchor;
  return Math.min(maxScroll, Math.max(0, desired));
}
