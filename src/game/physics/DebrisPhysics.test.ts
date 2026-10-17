import { describe, it, expect } from 'vitest';
import Delaunator from 'delaunator';
import RAPIER from '@dimforge/rapier2d-compat';

describe('Physics and Triangulation dependencies', () => {
  it('delaunator creates triangles from 2D points', () => {
    const points = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]];
    const delaunay = Delaunator.from(points);
    expect(delaunay.triangles.length).toBeGreaterThan(0);
    expect(delaunay.triangles.length % 3).toBe(0);
  });

  it('rapier2d initializes world and simulates rigid bodies', async () => {
    await RAPIER.init();
    const gravity = { x: 0.0, y: 980.0 };
    const world = new RAPIER.World(gravity);

    // Create ground
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0.0, 530.0);
    const ground = world.createRigidBody(groundDesc);
    const groundCollider = RAPIER.ColliderDesc.cuboid(600.0, 10.0);
    world.createCollider(groundCollider, ground);

    // Create dynamic body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(100.0, 200.0);
    const body = world.createRigidBody(bodyDesc);
    const collider = RAPIER.ColliderDesc.cuboid(10.0, 10.0);
    world.createCollider(collider, body);

    // Create dynamic body with convex hull triangle collider
    const trianglePoints = new Float32Array([-10.0, -10.0, 10.0, -10.0, 0.0, 15.0]);
    const triDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(150.0, 100.0);
    const triBody = world.createRigidBody(triDesc);
    const triCollider = RAPIER.ColliderDesc.convexHull(trianglePoints);
    expect(triCollider).toBeDefined();
    world.createCollider(triCollider!, triBody);

    // Step world
    for (let i = 0; i < 60; i++) world.step();

    // Body should have fallen due to gravity towards ground
    expect(body.translation().y).toBeGreaterThan(200.0);
    expect(body.translation().y).toBeLessThanOrEqual(530.0);
    expect(triBody.translation().y).toBeGreaterThan(100.0);
    world.free();
  });
});
