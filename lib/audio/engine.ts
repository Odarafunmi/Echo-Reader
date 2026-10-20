'use client';

// The narration engine: one controller over the browser's speech synthesiser that
// gives the reader an exact word, every time.
//
// Why it is built this way
//  - Speech is handed over in sentence-grouped chunks, not the whole chapter, so a
//    pause, a seek or a speed change can restart from the precise word.
//  - `onboundary` reports the word being spoken. Where a browser does not fire it
//    (older iOS), a timed estimate advances the highlight at the voice's pace; the
//    two are reconciled in `commit()` so the highlight only ever moves forward.
//  - Pause is a cancel plus a remembered word rather than `speechSynthesis.pause()`,
//    which iOS Safari does not honour. Resume re-speaks from that exact word.
//  - A silent audio element and the Media Session API keep the tab alive in the
//    background and put a real media notification on the lock screen.

import type { AudioChunk, ChapterAudio } from './text';
import { wordsForSeconds } from './text';
import { startSilentKeeper, stopSilentKeeper, setMediaSession, updatePositionState, keepScreenAwake, releaseWakeLock } from './background';
import type { ResolvedVoice } from '../voice/generic';

export type Speed = 1 | 1.25 | 1.5 | 2;
export const SPEEDS: Speed[] = [1, 1.25, 1.5, 2];

export interface NarrationState {
  playing: boolean;
  wordIndex: number;
  totalWords: number;
  speed: Speed;
}

export interface NarrationOptions {
  audio: ChapterAudio;
  voice: ResolvedVoice;
  speed?: Speed;
  startWord?: number;
  bookTitle: string;
  chapterTitle: string;
  artwork?: string;
  onWord?: (wordIndex: number) => void;
  onState?: (state: NarrationState) => void;
  onFinish?: () => void;
  onError?: (message: string) => void;
}

export class NarrationEngine {
  private readonly audio: ChapterAudio;
  private readonly voice: ResolvedVoice;
  private readonly callbacks: NarrationOptions;
  private speed: Speed;
  private wordIndex: number;
  private playing = false;
  /** Bumped on every cancel, so late events from an old utterance are ignored. */
  private generation = 0;
  private utterance: SpeechSynthesisUtterance | null = null;
  private timer: number | null = null;
  private synth: SpeechSynthesis | null = null;
  private restartTimer: number | null = null;
  private disposed = false;

  constructor(options: NarrationOptions) {
    this.audio = options.audio;
    this.voice = options.voice;
    this.callbacks = options;
    this.speed = options.speed ?? 1;
    this.wordIndex = clampWord(options.startWord ?? 0, options.audio.words.length);
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.publish();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentWord(): number {
    return this.wordIndex;
  }

  get totalWords(): number {
    return this.audio.words.length;
  }

  /** Starts, or resumes, at `from` (defaults to the remembered word). */
  play(from?: number): void {
    if (this.disposed || this.audio.words.length === 0) return;
    const start = from === undefined ? this.wordIndex : clampWord(from, this.audio.words.length);
    this.wordIndex = start;
    this.playing = true;
    this.callbacks.onWord?.(start);
    this.publish();
    startSilentKeeper();
    void keepScreenAwake();
    this.updateMediaSession();
    // Chrome needs a beat between cancelling one utterance and speaking the next.
    this.cancelUtterance();
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      if (!this.disposed && this.playing) this.speakFrom(this.wordIndex);
    }, 60);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.cancelUtterance();
    stopSilentKeeper();
    releaseWakeLock();
    this.publish();
    this.updateMediaSession();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Jumps to a word, and keeps speaking from it when already playing. */
  seekToWord(index: number): void {
    if (this.disposed || this.audio.words.length === 0) return;
    const target = clampWord(index, this.audio.words.length);
    this.wordIndex = target;
    this.callbacks.onWord?.(target);
    if (this.playing) {
      this.cancelUtterance();
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        if (!this.disposed && this.playing) this.speakFrom(this.wordIndex);
      }, 60);
    }
    this.publish();
    this.syncPosition();
  }

  /** The skip buttons: +10s or -10s worth of words. */
  skip(seconds: number): void {
    const delta = Math.sign(seconds) * wordsForSeconds(Math.abs(seconds), this.speed);
    this.seekToWord(this.wordIndex + delta);
  }

  setSpeed(speed: Speed): void {
    if (this.speed === speed) return;
    this.speed = speed;
    this.publish();
    if (this.playing) {
      // Re-speak the current word at the new pace; the highlight does not move.
      this.cancelUtterance();
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        if (!this.disposed && this.playing) this.speakFrom(this.wordIndex);
      }, 60);
    }
  }

  stop(): void {
    this.playing = false;
    this.cancelUtterance();
    stopSilentKeeper();
    releaseWakeLock();
    this.publish();
  }

  /**
   * Picks narration back up if the browser quietly suspended the voice while the
   * screen was locked or the tab was in the background. The engine still believes it
   * is playing; if nothing is speaking and nothing is queued, it re-speaks the
   * current word rather than leaving the reader silent.
   */
  resync(): void {
    if (!this.playing || !this.synth) return;
    if (this.synth.speaking || this.synth.pending) return;
    this.cancelUtterance();
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      if (!this.disposed && this.playing) this.speakFrom(this.wordIndex);
    }, 60);
  }

  dispose(): void {
    this.disposed = true;
    this.playing = false;
    this.cancelUtterance();
    stopSilentKeeper();
    releaseWakeLock();
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch {
        // Older implementations.
      }
    }
  }

  /* ---------- Internals ---------- */

  private publish(): void {
    this.callbacks.onState?.({
      playing: this.playing,
      wordIndex: this.wordIndex,
      totalWords: this.audio.words.length,
      speed: this.speed,
    });
    this.syncPosition();
  }

  private updateMediaSession(): void {
    setMediaSession({
      title: this.callbacks.bookTitle,
      chapter: this.callbacks.chapterTitle,
      artwork: this.callbacks.artwork,
      playing: this.playing,
      onPlay: () => this.play(),
      onPause: () => this.pause(),
      onBackward: () => this.skip(-10),
      onForward: () => this.skip(10),
      onStop: () => this.stop(),
      onSeekSeconds: (seconds) => this.seekToWord(Math.round(seconds * 2.8 * this.speed)),
      position: { word: this.wordIndex, total: this.audio.words.length, speed: this.speed },
    });
    this.syncPosition();
  }

  private syncPosition(): void {
    updatePositionState({
      word: this.wordIndex,
      total: this.audio.words.length,
      speed: this.speed,
    });
  }

  private commit(index: number): void {
    if (!this.playing || index <= this.wordIndex) return;
    this.wordIndex = index;
    this.callbacks.onWord?.(index);
    this.callbacks.onState?.({
      playing: this.playing,
      wordIndex: this.wordIndex,
      totalWords: this.audio.words.length,
      speed: this.speed,
    });
    // Position state does not need every word; a second of words is plenty.
    if (index % 8 === 0) this.syncPosition();
  }

  private cancelUtterance(): void {
    this.generation += 1;
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.clearTimer();
    this.utterance = null;
    try {
      this.synth?.cancel();
    } catch {
      // Nothing was speaking.
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Finds the chunk that holds `index`; every word belongs to exactly one. */
  private chunkFor(index: number): AudioChunk {
    const chunks = this.audio.chunks;
    // Chunks are ordered, so a short walk from the hint is cheap even in a big chapter.
    let lo = 0;
    let hi = chunks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (chunks[mid].firstWord <= index) lo = mid;
      else hi = mid - 1;
    }
    return chunks[lo];
  }

  private speakFrom(index: number): void {
    const synth = this.synth;
    if (!synth || this.audio.chunks.length === 0) return;
    const chunk = this.chunkFor(index);
    const position = Math.max(0, index - chunk.firstWord);
    const startWord = chunk.words[position] ?? chunk.words[0];
    const text = chunk.text.slice(startWord.start).trimStart();
    if (!text) {
      this.advanceChunk(chunk);
      return;
    }

    const generation = this.generation + 1;
    this.generation = generation;

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice.voice) {
      utterance.voice = this.voice.voice;
      utterance.lang = this.voice.voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.pitch = this.voice.pitch;
    const rate = clampRate(this.voice.rate * this.speed);
    utterance.rate = rate;

    // Words of the spoken slice, with offsets relative to the sliced text.
    const sliceWords = chunk.words
      .slice(position)
      .map((w) => ({ index: w.index, start: Math.max(0, w.start - startWord.start), length: w.length }));

    let reached = sliceWords[0]?.index ?? chunk.firstWord;
    let boundarySeen = false;
    let startedAt = 0;

    utterance.onstart = () => {
      if (generation !== this.generation) return;
      startedAt = performance.now();
      this.startEstimate(generation, sliceWords, rate, () => startedAt, () => boundarySeen);
    };

    utterance.onboundary = (event) => {
      if (generation !== this.generation || !this.playing) return;
      if (event.name && event.name !== 'word' && event.name !== 'sentence') return;
      boundarySeen = true;
      const candidate = wordAtOffset(sliceWords, event.charIndex ?? 0);
      if (candidate > reached) {
        reached = candidate;
        this.commit(candidate);
      }
    };

    utterance.onend = () => {
      if (generation !== this.generation) return;
      this.clearTimer();
      if (!this.playing) return;
      this.advanceChunk(chunk);
    };

    utterance.onerror = (event) => {
      if (generation !== this.generation) return;
      this.clearTimer();
      // `interrupted` and `canceled` are what a deliberate cancel looks like.
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      this.playing = false;
      this.publish();
      stopSilentKeeper();
      releaseWakeLock();
      this.callbacks.onError?.('The voice stopped unexpectedly. Press play to continue.');
    };

    this.utterance = utterance;
    try {
      synth.speak(utterance);
    } catch {
      this.callbacks.onError?.('This browser could not start the voice.');
      this.playing = false;
      this.publish();
    }
  }

  /**
   * Timed fallback for browsers that do not report word boundaries (notably older
   * iOS Safari). Words are weighted by length so long words hold the highlight a
   * little longer. Once a real boundary has been seen, the estimate stops moving
   * the highlight on its own.
   */
  private startEstimate(
    generation: number,
    sliceWords: { index: number; start: number; length: number }[],
    rate: number,
    startedAt: () => number,
    boundarySeen: () => boolean,
  ): void {
    this.clearTimer();
    if (sliceWords.length === 0) return;
    const weights = sliceWords.map((w) => Math.min(2.4, Math.max(0.5, w.length / 4.6)));
    let cursor = 0;
    this.timer = window.setInterval(() => {
      if (generation !== this.generation || !this.playing) {
        this.clearTimer();
        return;
      }
      if (boundarySeen()) {
        // Real events are arriving; the estimate retires quietly.
        this.clearTimer();
        return;
      }
      const elapsed = (performance.now() - startedAt()) / 1000;
      const target = elapsed * 2.8 * rate;
      let total = 0;
      while (cursor + 1 < weights.length && total + weights[cursor] <= target) {
        total += weights[cursor];
        cursor += 1;
      }
      this.commit(sliceWords[cursor].index);
    }, 140);
  }

  private advanceChunk(chunk: AudioChunk): void {
    const nextWord = chunk.lastWord + 1;
    if (nextWord >= this.audio.words.length) {
      this.playing = false;
      this.publish();
      stopSilentKeeper();
      releaseWakeLock();
      this.callbacks.onFinish?.();
      return;
    }
    this.wordIndex = nextWord;
    this.callbacks.onWord?.(nextWord);
    this.speakFrom(nextWord);
  }
}

function clampWord(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, Math.round(index)), total - 1);
}

function clampRate(rate: number): number {
  return Math.min(2.6, Math.max(0.4, Number.isFinite(rate) ? rate : 1));
}

function wordAtOffset(
  words: { index: number; start: number; length: number }[],
  charIndex: number,
): number {
  if (words.length === 0) return 0;
  let found = words[0].index;
  for (const word of words) {
    if (word.start > charIndex) break;
    found = word.index;
  }
  return found;
}
