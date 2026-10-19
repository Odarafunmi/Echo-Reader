'use client';

// A small violet dot with a ring that follows the mouse. The ring grows over links and buttons and shrinks while pressed.
// A click leaves a ripple. Only mouse and pen users see it. It is off under reduced motion, and it does not replace the system cursor.

import { useEffect } from 'react';

const INTERACTIVE = 'a,button,[role=button],[role=radio],[role=tab],[role=switch],input,select,textarea,label,summary';

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
      }
      const target = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      const isHover = !!target;
      if (isHover !== hover) {
        hover = isHover;
        ring.dataset.hover = hover ? 'true' : 'false';
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      down = true;
      const r = document.createElement('div');
      r.className = 'cursor-ripple';
      r.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      r.addEventListener('animationend', () => r.remove());
      layer.appendChild(r);
    };
    const onUp = () => {
      down = false;
    };
    const onLeave = () => {
      shown = false;
      layer.style.opacity = '0';
    };

    const tick = () => {
      rx += (x - rx) * 0.22;
      ry += (y - ry) * 0.22;
      const target = down ? 0.7 : hover ? 1.8 : 1;
      scale += (target - scale) * 0.2;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
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
