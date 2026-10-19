'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const LEVEL_BARS = 28;

export interface Take {
  blob: Blob;
  seconds: number;
  mimeType: string;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

/** Records one take from the microphone and exposes a live level meter for the waveform. */
export function useRecorder(maxSeconds: number) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_BARS).fill(0));
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const tickRef = useRef<number>(0);
  const startedAt = useRef(0);
  const stopResolve = useRef<((t: Take | null) => void) | null>(null);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    setLevels(Array(LEVEL_BARS).fill(0));
  }, []);

  useEffect(() => teardown, [teardown]);

  const finish = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    rec.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Try a recent version of Chrome, Edge, Firefox or Safari.');
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      setError(
        denied
          ? 'Microphone access was blocked. Allow it in your browser settings and try again.'
          : 'No microphone was found. Connect one and try again.',
      );
      return false;
    }

    streamRef.current = stream;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;

    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const seconds = (performance.now() - startedAt.current) / 1000;
      const type = rec.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      teardown();
      setRecording(false);
      setElapsed(0);
      stopResolve.current?.(blob.size > 0 ? { blob, seconds, mimeType: type } : null);
      stopResolve.current = null;
    };

    // Level meter: sample the frequency data into a fixed number of bars.
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(data);
      const step = Math.floor(data.length / LEVEL_BARS);
      const next = Array.from({ length: LEVEL_BARS }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
        return Math.min(1, sum / step / 180);
      });
      setLevels(next);
      rafRef.current = requestAnimationFrame(draw);
    };

    startedAt.current = performance.now();
    rec.start(250);
    setRecording(true);
    draw();
    tickRef.current = window.setInterval(() => {
      const s = (performance.now() - startedAt.current) / 1000;
      setElapsed(s);
      if (s >= maxSeconds) finish();
    }, 200);
    return true;
  }, [finish, maxSeconds, teardown]);

  /** Stops the take and resolves with the audio, or null if nothing was captured. */
  const stop = useCallback(
    () =>
      new Promise<Take | null>((resolve) => {
        if (!recorderRef.current || recorderRef.current.state === 'inactive') {
          resolve(null);
          return;
        }
        stopResolve.current = resolve;
        finish();
      }),
    [finish],
  );

  return { recording, elapsed, levels, error, start, stop };
}
