// Motion maths for the 3D book field, shared with components/BookScene.tsx.
//
// Deliberately free of three.js and of the DOM: everything here is plain numbers,
// so the flight, wrapping and cursor physics can be run and asserted in Node
// (see scripts/check-scene-motion.mjs) rather than only looked at in a browser.

/** The box the books fly through, in scene units. x and y wrap; z bounces. */
export interface Bounds {
  halfX: number;
  halfY: number;
  minZ: number;
  maxZ: number;
  /** How far a book may travel past the edge before it reappears on the far side. */
  margin: number;
}

/** Where the cursor is on the z = 0 plane, in scene units. */
export interface Pointer {
  x: number;
  y: number;
  active: boolean;
}

/** One book: flight state, tumble, and the spring displacement the cursor pushes into it. */
export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  /** Displacement away from the cursor, and the velocity of its return spring. */
  offX: number;
  offY: number;
  offZ: number;
  velX: number;
  velY: number;
  velZ: number;
  /** 0..1 flash left by a click shockwave; drives the material brightening. */
  glow: number;
}

/** The transform to apply to a book this frame. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  glow: number;
}

/** Books closer than this to the cursor are pushed aside. */
export const REPEL_RADIUS = 2.9;
/** How hard the cursor pushes sideways, and how much it pulls books towards the viewer. */
export const PUSH = 2.4;
export const LIFT = 1.3;
/** Damped spring constants for the push, so books settle back instead of snapping. */
export const SPRING_K = 18;
export const SPRING_D = 7;
/** Per second: how fast a click flash dies, and how much faster books tumble near the cursor. */
export const GLOW_DECAY = 1.5;
export const GUST_GAIN = 2.2;
/** Click shockwaves reach this far and shove this hard. */
export const SHOCK_RADIUS = 3.6;
export const SHOCK_STRENGTH = 3.2;

const sign = (n: number) => (n < 0 ? -1 : 1);

/**
 * Send a value that has left [min, max] by more than `margin` back in from the
 * opposite side, so books crossing the frame reappear from the other edge.
 */
export function wrap(value: number, min: number, max: number, margin: number): number {
  const span = max - min;
  if (span <= 0) return value;
  const room = span + margin * 2;
  if (value > max + margin) return value - room;
  if (value < min - margin) return value + room;
  return value;
}

/** A book with a random heading, tumble and sway. `rand` returns 0..1. */
export function makeBody(rand: () => number, bounds: Bounds, speed = 1): Body {
  const angle = rand() * Math.PI * 2;
  const v = (0.2 + rand() * 0.4) * speed;
  const tumble = (lo: number, hi: number) => sign(rand() - 0.5) * (lo + rand() * (hi - lo));
  return {
    x: (rand() * 2 - 1) * bounds.halfX,
    y: (rand() * 2 - 1) * bounds.halfY,
    z: bounds.minZ + rand() * (bounds.maxZ - bounds.minZ),
    vx: Math.cos(angle) * v,
    vy: Math.sin(angle) * v,
    vz: (rand() * 2 - 1) * v * 0.35,
    rx: rand() * Math.PI,
    ry: rand() * Math.PI,
    rz: rand() * Math.PI,
    spinX: tumble(0.05, 0.21),
    spinY: tumble(0.08, 0.3),
    spinZ: tumble(0.03, 0.15),
    swayAmp: 0.25 + rand() * 0.45,
    swayFreq: 0.18 + rand() * 0.3,
    swayPhase: rand() * Math.PI * 2,
    offX: 0,
    offY: 0,
    offZ: 0,
    velX: 0,
    velY: 0,
    velZ: 0,
    glow: 0,
  };
}

/**
 * Advance one book by `dt` seconds at scene time `t` and return the pose to draw.
 * `pointer` may be null (touch screens, or the cursor is off the page).
 */
export function stepBody(
  b: Body,
  dt: number,
  t: number,
  pointer: Pointer | null,
  bounds: Bounds,
): Pose {
  // Flight. The books keep travelling rather than oscillating about a home spot.
  b.x = wrap(b.x + b.vx * dt, -bounds.halfX, bounds.halfX, bounds.margin);
  b.y = wrap(b.y + b.vy * dt, -bounds.halfY, bounds.halfY, bounds.margin);

  // Depth bounces between the far and near planes, which reads as coming and going.
  b.z += b.vz * dt;
  if (b.z > bounds.maxZ) {
    b.z = bounds.maxZ;
    b.vz = -Math.abs(b.vz);
  } else if (b.z < bounds.minZ) {
    b.z = bounds.minZ;
    b.vz = Math.abs(b.vz);
  }

  // A little sway on top of the straight flight, so paths do not look mechanical.
  const swayX = Math.sin(t * b.swayFreq + b.swayPhase) * b.swayAmp;
  const swayY = Math.cos(t * b.swayFreq * 0.8 + b.swayPhase) * b.swayAmp * 0.6;
  const px = b.x + swayX;
  const py = b.y + swayY;

  // Cursor repulsion. Nearer books are shoved further and lifted towards the viewer.
  let targetX = 0;
  let targetY = 0;
  let targetZ = 0;
  let gust = 0;
  if (pointer && pointer.active) {
    const dx = px + b.offX - pointer.x;
    const dy = py + b.offY - pointer.y;
    const d = Math.hypot(dx, dy);
    if (d < REPEL_RADIUS && d > 1e-3) {
      const s = 1 - d / REPEL_RADIUS;
      targetX = (dx / d) * s * PUSH;
      targetY = (dy / d) * s * PUSH;
      targetZ = s * LIFT;
      gust = s;
    }
  }
  b.velX += (SPRING_K * (targetX - b.offX) - SPRING_D * b.velX) * dt;
  b.velY += (SPRING_K * (targetY - b.offY) - SPRING_D * b.velY) * dt;
  b.velZ += (SPRING_K * (targetZ - b.offZ) - SPRING_D * b.velZ) * dt;
  b.offX += b.velX * dt;
  b.offY += b.velY * dt;
  b.offZ += b.velZ * dt;

  // Constant tumble, whipping up while the cursor is close.
  const g = 1 + gust * GUST_GAIN;
  b.rx += b.spinX * g * dt;
  b.ry += b.spinY * g * dt;
  b.rz += b.spinZ * g * dt;

  if (b.glow > 0) b.glow = Math.max(0, b.glow - GLOW_DECAY * dt);

  return {
    x: px + b.offX,
    y: py + b.offY,
    z: b.z + b.offZ,
    // Leaning away from the push sells the shove.
    rx: b.rx - b.offY * 0.18,
    ry: b.ry,
    rz: b.rz - b.offX * 0.22,
    glow: b.glow,
  };
}

/**
 * Kick one book outwards from a click at (px, py) and light it up.
 * Returns how strongly it was caught, 0 when it was out of reach.
 */
export function shock(
  b: Body,
  px: number,
  py: number,
  radius = SHOCK_RADIUS,
  strength = SHOCK_STRENGTH,
): number {
  const dx = b.x + b.offX - px;
  const dy = b.y + b.offY - py;
  const d = Math.hypot(dx, dy);
  if (d >= radius || d <= 1e-3) return 0;
  const s = 1 - d / radius;
  b.velX += (dx / d) * s * strength;
  b.velY += (dy / d) * s * strength;
  b.velZ += s * strength * 0.5;
  b.glow = Math.max(b.glow, s);
  return s;
}

/** 1 at the near plane falling to 0.45 at the far one, so depth reads without fog. */
export function depthFade(z: number, bounds: Bounds): number {
  const span = Math.max(1e-3, bounds.maxZ - bounds.minZ);
  const far = Math.min(Math.max((bounds.maxZ - z) / span, 0), 1);
  return 1 - far * 0.55;
}
