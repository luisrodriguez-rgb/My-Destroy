import { expect, it } from 'vitest';
import { screenToWorld } from './coordinates';

it('keeps the same aim point after scaling and scrolling', () => {
  const full = screenToWorld(600, 392, { left: 24, top: 100, width:1152, height:584 });
  const half = screenToWorld(338, 166, { left: 50, top:20, width:576, height:292 });
  expect(full).toEqual({ x:576, y:292 });
  expect(half).toEqual(full);
});

it('uses the canvas bounds instead of its taller letterboxed container', () => {
  const point = screenToWorld(200, 173, { left: 20, top:82, width:360, height:182.5 });
  expect(point.x).toBe(576);
  expect(point.y).toBeCloseTo(291.2);
});

it('adds the vertical camera scroll after scaling the view', () => {
  const point = screenToWorld(600, 392, { left: 24, top: 100, width: 1152, height: 584 }, { scrollY: 488 });
  expect(point).toEqual({ x: 576, y: 292 + 488 });
});
