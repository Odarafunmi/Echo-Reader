'use client';

// A field of wireframe books flying through 3D behind the page.
//
// The books travel on their own headings, wrap from one edge of the frame to the
// other, tumble as they go, and dim with distance. The cursor shoves nearby books
// aside and a click sends a shockwave through the field that lights them up.
// The shapes live in lib/scene/books.ts and the motion in lib/scene/field.ts, so
// both can be exercised outside a browser.
//
// Reduced motion gets one still frame. Touch screens and tabs that are not visible
// do not animate. Without WebGL nothing is drawn and the ambient blobs carry the page.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildBook, KINDS } from '@/lib/scene/books';
import {
  depthFade,
  makeBody,
  shock,
  stepBody,
  type Body,
  type Bounds,
  type Pointer,
} from '@/lib/scene/field';

const CAM_Z = 14;
const FOV = 42;
const MAGENTA = 0xe879f9;
/** How much a full click flash adds to a book's line opacity. */
const GLOW_BOOST = 0.45;

/**
 * Line colours per app theme. On a pale ground the violet has to darken and hold
 * its opacity, or the field disappears into the background.
 */
const PALETTES = {
  dark: { outer: 0x8b5cf6, inner: 0xc4b5fd, outerOpacity: 0.5, innerOpacity: 0.18 },
  light: { outer: 0x6d28d9, inner: 0x7c3aed, outerOpacity: 0.55, innerOpacity: 0.24 },
} as const;

export type SceneVariant = keyof typeof PALETTES;

/** Reused scratch colour so the frame loop allocates nothing. */
const flash = new THREE.Color();

interface Book {
  group: THREE.Group;
  body: Body;
  outer: THREE.LineBasicMaterial;
  inner: THREE.LineBasicMaterial;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function BookScene({ variant = 'dark' }: { variant?: SceneVariant }) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Read through a ref so the animation loop always sees the current theme without
  // tearing down and rebuilding the scene when it changes.
  const paletteRef = useRef(PALETTES[variant]);
  paletteRef.current = PALETTES[variant];
  const repaintRef = useRef<() => void>(() => {});
  const booksRef = useRef<Book[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: leave the ambient blobs as they are
    }
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reduceMq.matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAM_Z);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

    const geoms: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    const rand = seeded(7);
    const narrow = host.clientWidth < 700;
    const count = narrow ? 11 : 18;
    const bounds: Bounds = { halfX: 8, halfY: 5, minZ: -8, maxZ: 3, margin: 1.8 };

    const books: Book[] = (booksRef.current = []);
    for (let i = 0; i < count; i++) {
      // Each book gets its own materials so depth fade and click flashes can differ.
      const palette = paletteRef.current;
      const outer = new THREE.LineBasicMaterial({
        color: palette.outer,
        transparent: true,
        opacity: palette.outerOpacity,
        depthWrite: false,
      });
      const inner = new THREE.LineBasicMaterial({
        color: palette.inner,
        transparent: true,
        opacity: palette.innerOpacity,
        depthWrite: false,
      });
      mats.push(outer, inner);
      const built = buildBook(KINDS[i % KINDS.length], outer, inner);
      geoms.push(...built.geometries);
      built.group.scale.setScalar(0.55 + rand() * 0.5);
      scene.add(built.group);
      books.push({ group: built.group, body: makeBody(rand, bounds), outer, inner });
    }

    // Pointer position on the z = 0 plane, in scene units.
    const pointer: Pointer = { x: 0, y: 0, active: false };
    const target = { x: 0, y: 0 };
    const cam = { x: 0, y: 0, ndcX: 0, ndcY: 0 };
    let halfH = 1;
    let halfW = 1;

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      halfH = CAM_Z * tanHalf;
      halfW = halfH * camera.aspect;
      // Keep the flight volume just outside the frame at any aspect ratio. Books
      // already outside a shrunken frame are wrapped back in by the next step.
      bounds.halfX = halfW * 1.15;
      bounds.halfY = halfH * 1.15;
    };

    const toWorld = (clientX: number, clientY: number) => {
      const ndcX = (clientX / window.innerWidth) * 2 - 1;
      const ndcY = -(clientY / window.innerHeight) * 2 + 1;
      target.x = ndcX * halfW;
      target.y = ndcY * halfH;
      cam.ndcX = ndcX;
      cam.ndcY = ndcY;
      pointer.active = true;
    };

    const step = (t: number, dt: number) => {
      const k = 1 - Math.exp(-dt * 8);
      pointer.x += (target.x - pointer.x) * k;
      pointer.y += (target.y - pointer.y) * k;
      cam.x += ((pointer.active ? cam.ndcX * 0.5 : 0) - cam.x) * k;
      cam.y += ((pointer.active ? -cam.ndcY * 0.3 : 0) - cam.y) * k;
      camera.position.set(cam.x, cam.y, CAM_Z);
      camera.lookAt(cam.x * 0.2, cam.y * 0.2, 0);

      const live = pointer.active && !coarse && !reduced ? pointer : null;
      for (const book of books) {
        const pose = stepBody(book.body, dt, t, live, bounds);
        book.group.position.set(pose.x, pose.y, pose.z);
        book.group.rotation.set(pose.rx, pose.ry, pose.rz);
        // Farther books fade back; a click flash pushes them towards magenta.
        const palette = paletteRef.current;
        const fade = depthFade(pose.z, bounds);
        const glow = pose.glow;
        book.outer.opacity = (palette.outerOpacity + glow * GLOW_BOOST) * fade;
        book.inner.opacity = (palette.innerOpacity + glow * GLOW_BOOST * 0.6) * fade;
        if (glow > 0.001) {
          flash.setHex(MAGENTA);
          book.outer.color.setHex(palette.outer).lerp(flash, glow * 0.8);
        } else if (book.outer.color.getHex() !== palette.outer) {
          book.outer.color.setHex(palette.outer);
        }
      }
      renderer.render(scene, camera);
    };

    // Click shockwave: books near the pointer are thrown outwards and light up.
    const onPointerDown = (e: PointerEvent) => {
      if (reduced || e.pointerType === 'touch') return;
      toWorld(e.clientX, e.clientY);
      for (const book of books) shock(book.body, target.x, target.y);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      toWorld(e.clientX, e.clientY);
    };
    const onLeave = () => {
      pointer.active = false;
    };

    let raf = 0;
    let last = 0;
    let running = false;
    const start = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step((now - start) / 1000, dt);
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };
    const runAnimated = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const runStill = () => {
      stop();
      pointer.active = false;
      step(0, 0);
    };

    const applyMotion = () => {
      if (reduced) runStill();
      else if (document.hidden) stop();
      else runAnimated();
    };
    const onMotionChange = (e: MediaQueryListEvent) => {
      reduced = e.matches;
      applyMotion();
    };

    resize();
    applyMotion();
    repaintRef.current = () => step(reduced ? 0 : (performance.now() - start) / 1000, 0);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) step(0, 0);
    });
    ro.observe(host);
    reduceMq.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', applyMotion);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    document.documentElement.addEventListener('pointerleave', onLeave);
    if (coarse) pointer.active = false;

    return () => {
      stop();
      repaintRef.current = () => {};
      ro.disconnect();
      reduceMq.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', applyMotion);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // Recolour in place when the app theme changes, then repaint once so a still
  // frame (reduced motion) picks it up too.
  useEffect(() => {
    const palette = PALETTES[variant];
    for (const book of booksRef.current) {
      book.outer.color.setHex(palette.outer);
      book.outer.opacity = palette.outerOpacity;
      book.inner.color.setHex(palette.inner);
      book.inner.opacity = palette.innerOpacity;
    }
    repaintRef.current();
  }, [variant]);

  return <div ref={hostRef} className="absolute inset-0 h-full w-full" />;
}
