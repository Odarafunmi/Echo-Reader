'use client';

// A slow field of wireframe books in 3D. The books drift, turn, and are gently pushed away by the cursor.
// Reduced motion gets one still frame. If WebGL is unavailable, nothing is drawn and the page keeps its blobs.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Kind = 'hardcover' | 'paperback' | 'tome' | 'square' | 'open';

// Width, height and depth in scene units.
const DIMS: Record<Exclude<Kind, 'open'>, [number, number, number]> = {
  hardcover: [1.0, 1.42, 0.2],
  paperback: [0.82, 1.22, 0.1],
  tome: [1.12, 1.56, 0.5],
  square: [1.36, 1.36, 0.16],
};
const KINDS: Kind[] = ['hardcover', 'paperback', 'open', 'tome', 'square', 'paperback', 'hardcover', 'open'];

const CAM_Z = 14;
const FOV = 42;
const REPEL_RADIUS = 2.6;
const SPRING_K = 18;
const SPRING_D = 7;

interface Body {
  group: THREE.Group;
  home: THREE.Vector3; // position in the scene, before drift and push
  nx: number; // home position in normalised screen space (-1..1), so it survives resizing
  ny: number;
  z: number;
  offset: THREE.Vector3; // spring displacement caused by the cursor
  vel: THREE.Vector3;
  amp: THREE.Vector3;
  freq: number;
  phase: number;
  spin: number;
  tilt: THREE.Vector3;
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

export default function BookScene() {
  const hostRef = useRef<HTMLDivElement>(null);

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

    const outerMat = new THREE.LineBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.55, depthWrite: false });
    const innerMat = new THREE.LineBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.2, depthWrite: false });
    const geoms: THREE.BufferGeometry[] = [];

    const addEdges = (group: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const box = new THREE.BoxGeometry(w, h, d);
      const edges = new THREE.EdgesGeometry(box);
      box.dispose();
      geoms.push(edges);
      const line = new THREE.LineSegments(edges, mat);
      line.position.set(x, y, z);
      group.add(line);
      return line;
    };

    const buildBook = (kind: Kind): THREE.Group => {
      const group = new THREE.Group();
      if (kind === 'open') {
        // Two covers hinged at the spine, opening towards the viewer.
        const W = 0.9;
        const H = 1.3;
        const a = 0.55;
        for (const s of [-1, 1]) {
          const page = new THREE.Group();
          page.position.set(0, 0, 0);
          page.rotation.y = -s * a;
          addEdges(page, W, H, 0.05, outerMat, s * (W / 2), 0, 0);
          addEdges(page, W - 0.06, H - 0.06, 0.02, innerMat, s * (W / 2), 0, 0.01);
          group.add(page);
        }
        return group;
      }
      const [w, h, d] = DIMS[kind];
      addEdges(group, w, h, d, outerMat);
      // A slightly smaller box suggests the block of pages.
      addEdges(group, w * 0.92, h * 0.94, d * 0.6, innerMat, 0.03 * w, 0, 0);
      return group;
    };

    const rand = seeded(7);
    const narrow = host.clientWidth < 700;
    const count = narrow ? 9 : 15;
    const bodies: Body[] = [];
    for (let i = 0; i < count; i++) {
      const kind = KINDS[i % KINDS.length];
      const group = buildBook(kind);
      const s = 0.8 + rand() * 0.5;
      group.scale.setScalar(s);
      scene.add(group);
      bodies.push({
        group,
        home: new THREE.Vector3(),
        nx: rand() * 2 - 1,
        ny: rand() * 2 - 1,
        z: -7 + rand() * 10,
        offset: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        amp: new THREE.Vector3(0.5 + rand() * 0.6, 0.3 + rand() * 0.4, 0.3 + rand() * 0.5),
        freq: 0.05 + rand() * 0.07,
        phase: rand() * Math.PI * 2,
        spin: (rand() < 0.5 ? -1 : 1) * (0.05 + rand() * 0.15),
        tilt: new THREE.Vector3(rand() * 0.6 - 0.3, rand() * 0.6 - 0.3, rand() * 0.4 - 0.2),
      });
    }

    // Pointer position on the z = 0 plane, in scene units. `active` is false while the pointer is off the page.
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, ndcX: 0, ndcY: 0, active: false };
    const cam = { x: 0 };
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
      for (const b of bodies) {
        b.home.set(b.nx * halfW * 1.05, b.ny * halfH * 1.05, b.z);
      }
    };

    const toWorld = (clientX: number, clientY: number) => {
      const ndcX = (clientX / window.innerWidth) * 2 - 1;
      const ndcY = -(clientY / window.innerHeight) * 2 + 1;
      pointer.ndcX = ndcX;
      pointer.ndcY = ndcY;
      pointer.tx = ndcX * halfW;
      pointer.ty = ndcY * halfH;
      pointer.active = true;
    };

    const step = (t: number, dt: number) => {
      const k = 1 - Math.exp(-dt * 8);
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      cam.x += ((pointer.active ? pointer.ndcX * 0.5 : 0) - cam.x) * k;
      camera.position.x = cam.x;
      camera.position.y = pointer.active ? -pointer.ndcY * 0.3 : 0;
      camera.lookAt(0, 0, 0);

      for (const b of bodies) {
        const f = t * b.freq + b.phase;
        const tx = b.home.x + Math.sin(f) * b.amp.x;
        const ty = b.home.y + Math.cos(f * 0.83) * b.amp.y;
        const tz = b.home.z + Math.sin(f * 0.6 + 1.3) * b.amp.z;

        // Push away from the cursor. Closer books are pushed further and move towards the viewer.
        let px = 0;
        let py = 0;
        let pz = 0;
        if (pointer.active && !reduced) {
          const dx = tx + b.offset.x - pointer.x;
          const dy = ty + b.offset.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < REPEL_RADIUS && d > 1e-3) {
            const s = 1 - d / REPEL_RADIUS;
            px = (dx / d) * s * 2.2;
            py = (dy / d) * s * 2.2;
            pz = s * 1.2;
          }
        }
        // Damped spring, so the books move back smoothly.
        b.vel.x += (SPRING_K * (px - b.offset.x) - SPRING_D * b.vel.x) * dt;
        b.vel.y += (SPRING_K * (py - b.offset.y) - SPRING_D * b.vel.y) * dt;
        b.vel.z += (SPRING_K * (pz - b.offset.z) - SPRING_D * b.vel.z) * dt;
        b.offset.addScaledVector(b.vel, dt);

        b.group.position.set(tx + b.offset.x, ty + b.offset.y, tz + b.offset.z);
        b.group.rotation.set(
          b.tilt.x + Math.sin(f * 0.7) * 0.35 - b.offset.y * 0.2,
          b.tilt.y + t * b.spin,
          b.tilt.z - b.offset.x * 0.25,
        );
      }
      renderer.render(scene, camera);
    };

    // Click impulse: a short shove for books near the pointer.
    const onPointerDown = (e: PointerEvent) => {
      if (reduced || e.pointerType === 'touch') return;
      toWorld(e.clientX, e.clientY);
      for (const b of bodies) {
        const dx = b.group.position.x - pointer.tx;
        const dy = b.group.position.y - pointer.ty;
        const d = Math.hypot(dx, dy);
        if (d < 3.5 && d > 1e-3) {
          const s = (1 - d / 3.5) * 3;
          b.vel.x += (dx / d) * s;
          b.vel.y += (dy / d) * s;
        }
      }
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
    const start = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step((now - start) / 1000, dt);
      raf = requestAnimationFrame(loop);
    };
    const runStill = () => {
      cancelAnimationFrame(raf);
      pointer.active = false;
      step(0, 0);
    };
    const runAnimated = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const applyMotion = () => {
      if (reduced) runStill();
      else runAnimated();
    };
    const onMotionChange = (e: MediaQueryListEvent) => {
      reduced = e.matches;
      applyMotion();
    };

    resize();
    applyMotion();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) step(0, 0);
    });
    ro.observe(host);
    reduceMq.addEventListener('change', onMotionChange);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    document.documentElement.addEventListener('pointerleave', onLeave);
    if (coarse) pointer.active = false;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      reduceMq.removeEventListener('change', onMotionChange);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      for (const g of geoms) g.dispose();
      outerMat.dispose();
      innerMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0 h-full w-full" />;
}
