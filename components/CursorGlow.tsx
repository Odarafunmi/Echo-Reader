'use client';

// A small violet dot with a ring that follows the mouse.
//
// The ring stretches along the direction of travel, so a fast flick pulls it into
// a comet and it settles back to a circle when the pointer stops. It grows over
// links and buttons, shrinks while pressed, and a click drops two expanding rings.
// Only mouse and pen users see it. It is off under reduced motion and on touch
// screens, and it never replaces the system cursor.

import { useEffect } from 'react';

const INTERACTIVE = 'a,button,[role=button],[role=radio],[role=tab],[role=switch],input,select,textarea,label,summary';

/** Pixels of travel per frame before the ring starts to stretch, and how far it goes. */
const STRETCH_PER_PX = 0.014;
const MAX_STRETCH = 0.38;
/** Below this speed the ring is treated as still, so it never jitters on a slow move. */
const STILL_SPEED = 0.4;

export default function CursorGlow() {
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;

    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.className = 'cursor-layer';
    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    layer.append(ring, dot);
    document.body.appendChild(layer);

    let x = -100;
    let y = -100;
    let rx = -100;
    let ry = -100;
    let scale = 1;
    let hover = false;
    let down = false;
    let shown = false;
    let raf = 0;

    // Smoothed travel per frame, used for the stretch direction and amount.
    let vx = 0;
    let vy = 0;
    let lastX = x;
    let lastY = y;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      if (!shown) {
        shown = true;
        layer.style.opacity = '1';
        rx = x;
        ry = y;
        lastX = x;
        lastY = y;
      }
      const target = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      const isHover = !!target;
      if (isHover !== hover) {
        hover = isHover;
        ring.dataset.hover = hover ? 'true' : 'false';
      }
    };

    // One click drops a tight ripple and a slower, wider echo behind it.
    const dropRing = (className: string, px: number, py: number) => {
      const el = document.createElement('div');
      el.className = className;
      el.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
      el.addEventListener('animationend', () => el.remove());
      layer.appendChild(el);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      down = true;
      dropRing('cursor-ripple', e.clientX, e.clientY);
      dropRing('cursor-echo', e.clientX, e.clientY);
    };
    const onUp = () => {
      down = false;
    };
    const onLeave = () => {
      shown = false;
      layer.style.opacity = '0';
    };

    const tick = () => {
      vx += (x - lastX - vx) * 0.3;
      vy += (y - lastY - vy) * 0.3;
      lastX = x;
      lastY = y;

      rx += (x - rx) * 0.22;
      ry += (y - ry) * 0.22;
      const targetScale = down ? 0.7 : hover ? 1.8 : 1;
      scale += (targetScale - scale) * 0.2;

      const speed = Math.hypot(vx, vy);
      const stretch = speed > STILL_SPEED ? Math.min(speed * STRETCH_PER_PX, MAX_STRETCH) : 0;
      const angle = stretch > 0 ? Math.atan2(vy, vx) : 0;
      ring.style.transform =
        `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) ` +
        `rotate(${angle.toFixed(4)}rad) scale(${(scale * (1 + stretch)).toFixed(3)}, ${(scale / (1 + stretch)).toFixed(3)})`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    document.documentElement.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      layer.remove();
    };
  }, []);

  return null;
}
