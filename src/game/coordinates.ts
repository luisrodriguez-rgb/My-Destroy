import { WORLD } from './tuning';

/** Read the displayed canvas bounds at input time, including page scroll, FIT letterboxing, and the vertical camera. */
export function screenToWorld(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  camera?: { scrollX?: number; scrollY?: number },
) {
  return {
    x: (clientX - bounds.left) * WORLD.width / bounds.width + (camera?.scrollX ?? 0),
    y: (clientY - bounds.top) * WORLD.height / bounds.height + (camera?.scrollY ?? 0),
  };
}
