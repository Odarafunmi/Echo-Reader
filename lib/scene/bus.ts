// A one-flag signal between the shelf and the 3D background, kept free of JSX so
// Node can import and test it directly.
//
// The shelf keeps a WebGL scene animating every frame. While a file is being
// parsed that loop competes with pdf.js for the same tab's memory and CPU, which
// matters most on a phone. Pausing the loop — not tearing the scene down — costs
// nothing visually: the last frame stays on screen.

type Listener = (paused: boolean) => void;

let paused = false;
const listeners = new Set<Listener>();

export function isScenePaused(): boolean {
  return paused;
}

function set(value: boolean) {
  if (paused === value) return;
  paused = value;
  for (const listener of listeners) listener(value);
}

/** Stop the render loop. Safe to call repeatedly. */
export function pauseScene(): void {
  set(true);
}

/** Let the render loop resume. */
export function resumeScene(): void {
  set(false);
}

/** Returns an unsubscribe function. */
export function subscribeScenePause(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
