// Checks the maths that drives the 3D book field, by importing the same module
// the scene uses (lib/scene/field.ts) and running it outside a browser.
//
//   node scripts/check-scene-motion.mjs
//
// Node strips the TypeScript types on import, so this executes the shipped code
// rather than a copy of it.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  depthFade,
  makeBody,
  shock,
  stepBody,
  wrap,
  REPEL_RADIUS,
  SHOCK_RADIUS,
} from '../lib/scene/field.ts';
import { buildBook, KINDS } from '../lib/scene/books.ts';

const DT = 1 / 60;
// Same flight volume BookScene starts with before the first resize.
const bounds = { halfX: 8, halfY: 5, minZ: -8, maxZ: 3, margin: 1.8 };

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

// A tiny deterministic PRNG, the same shape BookScene's seeded() returns.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const run = (b, steps, pointer, t0 = 0) => {
  let t = t0;
  let last = null;
  for (let i = 0; i < steps; i++) {
    last = stepBody(b, DT, t, pointer, bounds);
    t += DT;
  }
  return last;
};

console.log('scene motion:');

check('wrap sends a book that left the frame back in from the far side', () => {
  const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
  // Outside the frame by more than the margin: reappears on the other side.
  close(wrap(10, -8, 8, 1.8), -9.6, 'right exit');
  close(wrap(-10, -8, 8, 1.8), 9.6, 'left exit');
  // Inside the frame, or only just past it within the margin band: untouched.
  assert.equal(wrap(7, -8, 8, 1.8), 7);
  assert.equal(wrap(9, -8, 8, 1.8), 9); // 9 < 8 + 1.8, still travelling out
  // A wrapped book lands inside the field, on the opposite side.
  const wrapped = wrap(10, -8, 8, 1.8);
  assert.ok(wrapped > -8 - 1.8 && wrapped < 8 + 1.8, `wrapped out of range: ${wrapped}`);
});

check('books fly across the field instead of drifting in place', () => {
  const b = makeBody(rng(7), bounds);
  let path = 0;
  let px = b.x;
  let py = b.y;
  for (let i = 0; i < 20 * 60; i++) {
    const pose = stepBody(b, DT, i * DT, null, bounds);
    path += Math.hypot(pose.x - px, pose.y - py);
    px = pose.x;
    py = pose.y;
  }
  // 20 s of flight: the straight heading alone covers several scene units.
  assert.ok(path > 6, `expected a long flight path, got ${path.toFixed(2)}`);
});

check('a book leaving the right edge reappears from the left, never off-field', () => {
  const b = { ...makeBody(rng(3), bounds), x: 7.9, vx: 2, vy: 0, vz: 0, spinX: 0, spinY: 0, spinZ: 0 };
  let wrapped = false;
  for (let i = 0; i < 60 * 12; i++) {
    stepBody(b, DT, i * DT, null, bounds);
    if (b.x < 0) wrapped = true;
    assert.ok(b.x <= bounds.halfX + bounds.margin + 0.1, `x escaped the field: ${b.x}`);
  }
  assert.ok(wrapped, 'the book never came back in from the left edge');
});

check('depth bounces between the near and far planes', () => {
  const b = { ...makeBody(rng(11), bounds), z: 2.9, vz: 1.5, vx: 0, vy: 0 };
  let turned = false;
  for (let i = 0; i < 60 * 10; i++) {
    stepBody(b, DT, i * DT, null, bounds);
    if (b.vz < 0) turned = true;
    assert.ok(b.z >= bounds.minZ - 1e-9 && b.z <= bounds.maxZ + 1e-9, `z escaped: ${b.z}`);
  }
  assert.ok(turned, 'z velocity never reversed at the near plane');
});

check('the cursor pushes nearby books aside and they spring back when it leaves', () => {
  const b = { ...makeBody(rng(5), bounds), x: 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, swayAmp: 0 };
  const pointer = { x: 0, y: 0, active: true };
  run(b, 120, pointer);
  const away = Math.hypot(b.offX, b.offY);
  assert.ok(away > 0.5, `expected a visible shove, got ${away.toFixed(3)}`);
  // Farther than the repel radius: untouched.
  const far = { ...makeBody(rng(5), bounds), x: REPEL_RADIUS + 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  run(far, 120, pointer);
  assert.ok(Math.hypot(far.offX, far.offY) < 1e-6, 'a distant book was pushed');
  // Pointer gone: the spring settles it back home.
  run(b, 900, null);
  assert.ok(Math.hypot(b.offX, b.offY) < 0.02, `did not settle, off=${Math.hypot(b.offX, b.offY)}`);
});

check('books tumble faster while the cursor is close', () => {
  const spin = 0.3;
  const base = { ...makeBody(rng(9), bounds), x: 6, y: 0, vx: 0, vy: 0, vz: 0, spinY: spin, spinX: 0, spinZ: 0 };
  const near = { ...makeBody(rng(9), bounds), x: 0.5, y: 0, vx: 0, vy: 0, vz: 0, spinY: spin, spinX: 0, spinZ: 0 };
  const pointer = { x: 0, y: 0, active: true };
  const before = base.ry;
  run(base, 60, null);
  const plain = Math.abs(base.ry - before);
  const beforeNear = near.ry;
  run(near, 60, pointer);
  const gusting = Math.abs(near.ry - beforeNear);
  assert.ok(gusting > plain, `gust ${gusting.toFixed(4)} was not faster than plain ${plain.toFixed(4)}`);
});

check('a click throws nearby books outwards and lights them up, then the flash fades', () => {
  const b = { ...makeBody(rng(13), bounds), x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, offX: 0, offY: 0, offZ: 0 };
  const hit = shock(b, 0, 0);
  assert.ok(hit > 0 && hit <= 1, `shock strength out of range: ${hit}`);
  assert.ok(b.velX > 0, 'the book was not thrown away from the click');
  assert.equal(b.glow, hit);
  const far = { ...makeBody(rng(13), bounds), x: SHOCK_RADIUS + 2, y: 0 };
  assert.equal(shock(far, 0, 0), 0, 'a book outside the shockwave was hit');
  run(b, 120, null);
  assert.equal(b.glow, 0, 'the flash never faded out');
});

check('nearer books are brighter than distant ones', () => {
  const near = depthFade(bounds.maxZ, bounds);
  const far = depthFade(bounds.minZ, bounds);
  assert.equal(near, 1);
  assert.ok(Math.abs(far - 0.45) < 1e-9, `expected 0.45 at the far plane, got ${far}`);
  assert.ok(depthFade(0, bounds) < near && depthFade(0, bounds) > far, 'not monotonic with depth');
});

check('a crowded field with a moving cursor stays finite and on-field for 3000 frames', () => {
  const rand = rng(21);
  const bodies = Array.from({ length: 18 }, () => makeBody(rand, bounds));
  const pointer = { x: 0, y: 0, active: true };
  for (let i = 0; i < 3000; i++) {
    pointer.x = Math.sin(i / 40) * 5;
    pointer.y = Math.cos(i / 55) * 3;
    if (i % 137 === 0) for (const b of bodies) shock(b, pointer.x, pointer.y);
    for (const b of bodies) {
      const pose = stepBody(b, DT, i * DT, pointer, bounds);
      for (const [key, v] of Object.entries(pose)) {
        assert.ok(Number.isFinite(v), `${key} went ${v} at frame ${i}`);
      }
      // Books may travel one margin past the frame before wrapping.
      assert.ok(Math.abs(pose.x) <= bounds.halfX + bounds.margin + 4, `x drifted off: ${pose.x}`);
      assert.ok(Math.abs(pose.y) <= bounds.halfY + bounds.margin + 4, `y drifted off: ${pose.y}`);
    }
  }
});

check('every book shape builds real wireframe geometry', () => {
  const outer = new THREE.LineBasicMaterial();
  const inner = new THREE.LineBasicMaterial();
  const counts = new Map();
  const sizes = new Map();
  for (const kind of new Set(KINDS)) {
    const { group, geometries } = buildBook(kind, outer, inner);
    let segments = 0;
    group.traverse((o) => {
      if (!(o instanceof THREE.LineSegments)) return;
      const pos = o.geometry.attributes.position;
      segments += pos.count / 2;
      for (let i = 0; i < pos.array.length; i++) {
        assert.ok(Number.isFinite(pos.array[i]), `${kind}: non-finite vertex`);
      }
    });
    assert.ok(geometries.length >= 2, `${kind}: expected an outline plus a page block, got ${geometries.length}`);
    assert.ok(segments >= 10, `${kind}: only ${segments} line segments`);
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(group).getSize(size);
    assert.ok(size.x > 0.3 && size.y > 0.3, `${kind}: degenerate size ${size.toArray()}`);
    counts.set(kind, segments);
    sizes.set(kind, size.toArray().map((n) => n.toFixed(2)).join('x'));
  }
  // Different topologies, not one box relabelled seven times.
  const topologies = new Set(counts.values()).size;
  assert.ok(topologies >= 4, `only ${topologies} distinct topologies across ${counts.size} kinds`);
  // The four plain boxes must differ in proportion too.
  const boxes = ['hardcover', 'paperback', 'tome', 'square'].map((k) => sizes.get(k));
  assert.equal(new Set(boxes).size, 4, `book proportions collide: ${boxes.join(' | ')}`);
  console.log(`        ${[...counts].map(([k, v]) => `${k}=${v}`).join(' ')} (segments per shape)`);
});

console.log(`\n${passed} checks passed`);
