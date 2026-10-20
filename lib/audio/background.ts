'use client';

// What keeps narration alive when the screen goes off.
//
// Three layers, all optional and all guarded, because every browser differs:
//   1. Media Session: the lock screen and headphones get the book, the chapter
//      and working play/pause and 10-second buttons.
//   2. A near-silent looping WAV, so the tab is still "playing media" while the
//      speech synthesiser talks. Mobile browsers throttle or suspend a tab that
//      is otherwise silent.
//   3. The Screen Wake Lock, where it exists, so the lock screen does not appear
//      in the middle of a page.
//
// Nothing here is required for reading aloud to work; if a browser refuses all of
// it, the narration simply keeps running in the foreground.

export interface NarrationPosition {
  /** Word being spoken, from 0. */
  word: number;
  total: number;
  speed: number;
}

export interface MediaInfo {
  title: string;
  chapter: string;
  artwork?: string;
  playing: boolean;
  /** Where the chapter is, so the lock-screen scrubber starts in the right place. */
  position?: NarrationPosition;
  onPlay: () => void;
  onPause: () => void;
  onStop?: () => void;
  /** Lock-screen and headphone buttons: ±10 seconds. */
  onBackward?: () => void;
  onForward?: () => void;
  /** A lock-screen scrub, in seconds. */
  onSeekSeconds?: (seconds: number) => void;
}

/** Words per second at 1×, matching lib/audio/text.ts. */
const WORDS_PER_SECOND = 2.8;

/** A one-second 8-bit mono WAV of digital silence. */
function silentWavDataUrl(): string {
  const sampleRate = 8000;
  const samples = sampleRate;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  // 128 is silence in unsigned 8-bit. Nothing is added on top: iOS ignores the
  // element's volume, so any dither would be an audible tone in a quiet room, and
  // a playing element is what keeps the tab alive, not the samples in it.
  for (let i = 0; i < samples; i++) bytes[44 + i] = 128;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

let keeper: HTMLAudioElement | null = null;
let keeperUrl: string | null = null;

/** Starts, or restarts, the silent track under the voice. */
export function startSilentKeeper(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  try {
    if (!keeper) {
      keeperUrl = keeperUrl ?? silentWavDataUrl();
      keeper = new Audio(keeperUrl);
      keeper.loop = true;
      keeper.preload = 'auto';
      keeper.setAttribute('playsinline', '');
      keeper.setAttribute('aria-hidden', 'true');
      // A real, non-muted element that is inaudible: muted tracks do not count as
      // playing media on some platforms.
      keeper.volume = 0.02;
    }
    void keeper.play().catch(() => {
      // Autoplay refused until the next tap; the next play() will retry.
    });
  } catch {
    // No audio element: narration still works, it just may not survive the lock screen.
  }
}

export function stopSilentKeeper(): void {
  try {
    keeper?.pause();
  } catch {
    // Already stopped.
  }
}

function mediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession ?? null;
}

function seconds(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Publishes the player on the lock screen. Every part is guarded separately: an
 * unsupported artwork URL must not cost us the play/pause buttons, and an
 * unsupported action must not cost us the metadata.
 */
export function setMediaSession(info: MediaInfo): void {
  const ms = mediaSession();
  if (!ms) return;

  // Chrome rejects the whole metadata object if one artwork entry is unusable, and
  // covers are data: URLs. So the rich version is tried first and the plain one
  // second, rather than losing the title and the controls with the artwork.
  const metadata = (artwork: boolean) =>
    new MediaMetadata({
      title: info.title,
      artist: info.chapter,
      album: 'Echo Shelf',
      artwork:
        artwork && info.artwork
          ? [
              { src: info.artwork, sizes: '512x512', type: 'image/jpeg' },
              { src: info.artwork, sizes: '192x192', type: 'image/jpeg' },
            ]
          : [],
    });
  try {
    ms.metadata = metadata(true);
  } catch {
    try {
      ms.metadata = metadata(false);
    } catch {
      // No MediaMetadata at all: the action handlers below still work.
    }
  }

  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => info.onPlay()],
    ['pause', () => info.onPause()],
    ['stop', () => info.onStop?.()],
    ['seekbackward', () => info.onBackward?.()],
    ['seekforward', () => info.onForward?.()],
    [
      'seekto',
      (details) => {
        if (typeof info.onSeekSeconds === 'function' && typeof details.seekTime === 'number') {
          info.onSeekSeconds(details.seekTime);
        }
      },
    ],
  ];
  for (const [action, handler] of handlers) {
    try {
      ms.setActionHandler(action, handler);
    } catch {
      // This browser does not offer that action.
    }
  }

  try {
    ms.playbackState = info.playing ? 'playing' : 'paused';
  } catch {
    // Older Safari: playbackState is not writable.
  }

  if (info.position) updatePositionState(info.position);
}

/**
 * Keeps the lock-screen scrubber honest. Called at the start, on every seek, and
 * every few words while speaking; safe to call with nothing playing yet.
 */
export function updatePositionState(position?: NarrationPosition): void {
  const ms = mediaSession();
  if (!ms || typeof ms.setPositionState !== 'function' || !position) return;
  const rate = seconds(position.speed) || 1;
  const perWord = 1 / (WORDS_PER_SECOND * rate);
  const duration = Math.max(1, position.total * perWord);
  try {
    ms.setPositionState({
      duration,
      playbackRate: rate,
      position: Math.min(duration, Math.max(0, position.word * perWord)),
    });
  } catch {
    // A browser that rejects position state still gets play/pause and metadata.
  }
}

export function clearMediaSession(): void {
  const ms = mediaSession();
  if (!ms) return;
  for (const action of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto'] as MediaSessionAction[]) {
    try {
      ms.setActionHandler(action, null);
    } catch {
      // Not supported here.
    }
  }
  try {
    ms.metadata = null;
    ms.playbackState = 'none';
  } catch {
    // Nothing to clear.
  }
}

interface Sentinel {
  release: () => Promise<void>;
  released: boolean;
  addEventListener?: (type: 'release', listener: () => void) => void;
}

let sentinel: Sentinel | null = null;

/** Holds the screen on while the chapter is read. */
export async function keepScreenAwake(): Promise<void> {
  if (typeof navigator === 'undefined' || sentinel) return;
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };
  try {
    const lock = await nav.wakeLock?.request('screen');
    if (!lock) return;
    sentinel = lock;
    lock.addEventListener?.('release', () => {
      sentinel = null;
    });
  } catch {
    // Not supported, or the tab is not visible: reading aloud carries on.
  }
}

export function releaseWakeLock(): void {
  const lock = sentinel;
  sentinel = null;
  void lock?.release().catch(() => undefined);
}

/**
 * Called when a backgrounded tab comes back. Browsers drop the lock when the page
 * is hidden, so it has to be asked for again on every return.
 */
export function reacquireWakeLock(): Promise<void> {
  sentinel = null;
  return keepScreenAwake();
}

/** True when this browser can put real controls on the lock screen. */
export function mediaSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}
