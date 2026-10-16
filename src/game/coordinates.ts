import { WORLD } from './tuning';

/** Read the displayed canvas bounds at input time, including scroll and FIT letterboxing. */
export function screenToWorld(clientX: number, clientY: number, bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>) {
  return { x: (clientX - bounds.left) * WORLD.width / bounds.width, y: (clientY - bounds.top) * WORLD.height / bounds.height };
}
