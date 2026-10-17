'use client';

import { Check, Circle, Loader2, Mic, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addVoiceSample,
  deleteAllVoiceData,
  deleteVoiceSample,
  getVoiceProfile,
  listVoiceSamples,
  saveVoiceProfile,
} from '@/lib/db';
import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  MAX_CLIP_SECONDS,
  MAX_TOTAL_SECONDS,
  MIN_TOTAL_SECONDS,
  SCRIPT,
  VERIFY_THRESHOLD,
  formatSeconds,
  pickVerifyPhrase,
  wordMatchRatio,
  type ScriptPassage,
} from '@/lib/voice/script';
import { ProviderNotConfiguredError, unconfiguredProvider } from '@/lib/voice/provider';
import { LEVEL_BARS, useRecorder, type Take } from '@/lib/voice/useRecorder';
import { listen, speechRecognitionSupported } from '@/lib/voice/speech';
import type { VoiceProfile, VoiceSample } from '@/lib/types';
import Toast, { type ToastState } from './Toast';

type Step = 'consent' | 'record' | 'verify' | 'ready';

const STEPS: { id: Step; label: string }[] = [
  { id: 'consent', label: 'Consent' },
  { id: 'record', label: 'Record' },
  { id: 'verify', label: 'Verify' },
  { id: 'ready', label: 'Ready' },
];

const newId = () => crypto.randomUUID();
const scriptTotal = (samples: VoiceSample[]) =>
  samples.filter((s) => s.kind === 'script').reduce((n, s) => n + s.seconds, 0);

export default function VoiceStudio() {
  const [profile, setProfile] = useState<VoiceProfile | null | undefined>(undefined);
  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  const notify = useCallback((text: string, tone: ToastState['tone'] = 'ok') => setToast({ id: Date.now(), text, tone }), []);
  const dismiss = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([getVoiceProfile(), listVoiceSamples()]);
    setProfile(p ?? null);
    setSamples(s);
  }, []);

  useEffect(() => {
    load().catch(() => {
      setProfile(null);
      notify('Could not open voice storage in this browser.', 'error');
    });
  }, [load, notify]);

  const seconds = scriptTotal(samples);
  const verified = !!profile?.verifiedAt;
  const step: Step = !profile ? 'consent' : seconds < MIN_TOTAL_SECONDS ? 'record' : !verified ? 'verify' : 'ready';
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  async function acceptConsent() {
    setSaving(true);
    try {
      const now = Date.now();
      await saveVoiceProfile({
        id: 'me',
        name: 'My Voice',
        consentAt: now,
        consentVersion: CONSENT_VERSION,
        createdAt: now,
        updatedAt: now,
      });
      await load();
    } catch {
      notify('Could not save your consent. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function markVerified() {
    if (!profile) return;
    await saveVoiceProfile({ ...profile, verifiedAt: Date.now(), updatedAt: Date.now() });
    await load();
    notify('Your voice is verified');
  }

  async function removeSample(s: VoiceSample) {
    try {
      await deleteVoiceSample(s.id);
      await load();
    } catch {
      notify('Could not delete that recording.', 'error');
    }
  }

  async function deleteEverything() {
    if (!window.confirm('Delete your voice profile and every recording? This cannot be undone.')) return;
    try {
      await deleteAllVoiceData();
      setConsent(false);
      await load();
      notify('Your voice data was deleted');
    } catch {
      notify('Could not delete your voice data. Please try again.', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pb-24 pt-10">
      <section className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-mist">Voice Studio</p>
        <h1 className="mt-3 font-display text-[40px] font-semibold leading-tight tracking-tight sm:text-[48px] sm:leading-[56px]">
          Record your voice, <em className="font-semibold italic text-violet-mist">once.</em>
        </h1>
        <p className="mt-3 max-w-xl text-base leading-[26px] text-fg-2">
          A short, guided recording gives Echo Shelf a sample of your voice. You verify it with one read-aloud, and it stays on this device until a voice provider is connected.
        </p>
      </section>

      <ol className="mt-8 flex flex-wrap gap-2" aria-label="Voice setup progress">
        {STEPS.map((s, i) => {
          const done = profile !== undefined && i < stepIndex;
          const current = i === stepIndex;
          return (
            <li
              key={s.id}
              aria-current={current ? 'step' : undefined}
              className={
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors duration-250 ease-soft ' +
                (current ? 'border-violet bg-violet/15 text-fg' : done ? 'border-line text-fg-2' : 'border-line text-fg-3')
              }
            >
              {done ? (
                <Check className="h-3.5 w-3.5 text-mint" strokeWidth={2} />
              ) : (
                <Circle className={'h-3 w-3 ' + (current ? 'fill-violet text-violet' : '')} strokeWidth={1.75} />
              )}
              {i + 1}. {s.label}
            </li>
          );
        })}
      </ol>

      <div className="mt-8">
        {profile === undefined && <p className="text-sm text-fg-3">Loading Voice Studio…</p>}

        {profile !== undefined && step === 'consent' && (
          <ConsentStep checked={consent} onChecked={setConsent} onAccept={acceptConsent} saving={saving} />
        )}

        {profile && step === 'record' && (
          <RecordStep samples={samples} seconds={seconds} onChanged={load} notify={notify} />
        )}

        {profile && step === 'verify' && (
          <VerifyStep onVerified={markVerified} notify={notify} seconds={seconds} />
        )}

        {profile && step === 'ready' && (
          <ReadyStep samples={samples} seconds={seconds} onRemove={removeSample} onDeleteAll={deleteEverything} notify={notify} />
        )}
      </div>

      <Toast toast={toast} onDone={dismiss} />
    </div>
  );
}

/* ---------- Step 1: consent ---------- */

function ConsentStep({
  checked,
  onChecked,
  onAccept,
  saving,
}: {
  checked: boolean;
  onChecked: (v: boolean) => void;
  onAccept: () => void;
  saving: boolean;
}) {
  return (
    <section className="card-sheen animate-fade-up p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold">Before you record</h2>
      <p className="mt-2 text-sm text-fg-2">Only clone a voice you own, or one you have permission to use.</p>
      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-input border border-line bg-ink/40 p-4 transition-colors duration-250 hover:border-violet/40">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChecked(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[#8b5cf6]"
        />
        <span className="text-sm leading-6 text-fg">{CONSENT_TEXT}</span>
      </label>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-xs text-fg-3">Consent version {CONSENT_VERSION}. Recordings stay in this browser.</p>
        <button type="button" className="btn-primary" disabled={!checked || saving} onClick={onAccept}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />}
          Continue to recording
        </button>
      </div>
    </section>
  );
}

/* ---------- Step 2: guided recording ---------- */

function RecordStep({
  samples,
  seconds,
  onChanged,
  notify,
}: {
  samples: VoiceSample[];
  seconds: number;
  onChanged: () => Promise<void>;
  notify: (text: string, tone?: ToastState['tone']) => void;
}) {
  const recordedIds = useMemo(() => new Set(samples.filter((s) => s.kind === 'script').map((s) => s.label)), [samples]);
  const firstOpen = Math.max(0, SCRIPT.findIndex((p) => !recordedIds.has(p.id)));
  const [index, setIndex] = useState(firstOpen);
  const [take, setTake] = useState<Take | null>(null);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const rec = useRecorder(MAX_CLIP_SECONDS);

  const passage: ScriptPassage = SCRIPT[index];
  const remaining = Math.max(0, MAX_TOTAL_SECONDS - seconds);
  const atCap = remaining < 3;
  const pct = Math.min(100, (seconds / MAX_TOTAL_SECONDS) * 100);
  const minPct = (MIN_TOTAL_SECONDS / MAX_TOTAL_SECONDS) * 100;

  useEffect(() => {
    if (!take) return;
    const url = URL.createObjectURL(take.blob);
    setTakeUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [take]);

  function goToPassage(i: number) {
    setIndex(i);
    setTake(null);
    setWarning(null);
  }

  async function toggle() {
    setWarning(null);
    if (rec.recording) {
      const t = await rec.stop();
      if (!t) return;
      if (t.seconds < 3) {
        setWarning('That was too short. Read the whole passage at a steady pace.');
        return;
      }
      setTake(t);
      return;
    }
    if (atCap) return;
    setTake(null);
    await rec.start();
  }

  async function keep() {
    if (!take) return;
    setSaving(true);
    try {
      // Replace any earlier take for this passage.
      for (const old of samples.filter((s) => s.kind === 'script' && s.label === passage.id)) {
        await deleteVoiceSample(old.id);
      }
      await addVoiceSample({
        id: newId(),
        profileId: 'me',
        kind: 'script',
        label: passage.id,
        seconds: Math.round(take.seconds * 10) / 10,
        mimeType: take.mimeType,
        blob: take.blob,
        createdAt: Date.now(),
      });
      await onChanged();
      setTake(null);
      const next = SCRIPT.findIndex((p, i) => i > index && !recordedIds.has(p.id) && p.id !== passage.id);
      if (next !== -1) setIndex(next);
      notify(`Saved “${passage.title}”`);
    } catch {
      notify('Could not save that recording.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const reachedMin = seconds >= MIN_TOTAL_SECONDS;

  return (
    <section className="grid gap-6 md:grid-cols-[1fr_260px]">
      <div className="card-sheen animate-fade-up p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">
              Passage {index + 1} of {SCRIPT.length}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{passage.title}</h2>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-xs tabular-nums text-fg-2">
            {formatSeconds(seconds)} recorded
          </span>
        </div>
        <p className="mt-1 text-sm text-violet-mist">{passage.hint}</p>

        <blockquote className="mt-6 min-h-[150px] rounded-input border border-line bg-ink/50 p-6 text-xl leading-9 text-fg" style={{ fontFamily: 'var(--font-reader-literata)' }}>
          {passage.text}
        </blockquote>

        <div className="mt-8 flex flex-col items-center gap-5">
          {!take && (
            <Recorder recording={rec.recording} levels={rec.levels} elapsed={rec.elapsed} onToggle={toggle} disabled={atCap && !rec.recording} />
          )}

          {take && takeUrl && (
            <div className="w-full space-y-4">
              <p className="text-center text-sm text-fg-2">
                Take length {formatSeconds(take.seconds)}. Listen back, then keep it or try again.
              </p>
              <audio controls src={takeUrl} className="w-full" />
              <div className="flex justify-center gap-3">
                <button type="button" className="btn-ghost" onClick={() => setTake(null)} disabled={saving}>
                  <RotateCcw className="h-4 w-4" strokeWidth={1.75} /> Redo
                </button>
                <button type="button" className="btn-primary" onClick={keep} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : <Check className="h-4 w-4" strokeWidth={2} />}
                  Keep this take
                </button>
              </div>
            </div>
          )}

          {rec.error && <p role="alert" className="text-center text-sm text-rose">{rec.error}</p>}
          {warning && <p role="alert" className="text-center text-sm text-amber">{warning}</p>}
          {atCap && !take && (
            <p className="text-center text-sm text-fg-2">You have reached the recording limit. Continue to verification when you are ready.</p>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-6">
          <button type="button" className="btn-ghost" onClick={() => goToPassage(Math.max(0, index - 1))} disabled={index === 0 || rec.recording}>
            Previous passage
          </button>
          <p className="text-sm text-fg-2">
            {reachedMin ? 'Verification starts automatically.' : `Record ${formatSeconds(MIN_TOTAL_SECONDS - seconds)} more to continue.`}
          </p>
        </div>
      </div>

      <aside className="card-sheen animate-fade-up h-fit p-5" style={{ animationDelay: '80ms' }}>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">Your progress</p>
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={MAX_TOTAL_SECONDS} aria-valuenow={Math.round(seconds)}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet to-magenta transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
          <div className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${minPct}%` }} aria-hidden />
        </div>
        <p className="mt-2 text-xs text-fg-3">
          Goal: {formatSeconds(MIN_TOTAL_SECONDS)} minimum, up to {formatSeconds(MAX_TOTAL_SECONDS)}. The marker shows the minimum.
        </p>

        <ul className="mt-5 space-y-1">
          {SCRIPT.map((p, i) => {
            const done = recordedIds.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => goToPassage(i)}
                  disabled={rec.recording}
                  aria-current={i === index ? 'true' : undefined}
                  className={
                    'flex w-full items-center gap-3 rounded-input px-3 py-2 text-left text-sm transition-colors duration-150 disabled:opacity-50 ' +
                    (i === index ? 'bg-violet/15 text-fg' : 'text-fg-2 hover:bg-raised hover:text-fg')
                  }
                >
                  {done ? <Check className="h-4 w-4 shrink-0 text-mint" strokeWidth={2} /> : <Circle className="h-3.5 w-3.5 shrink-0 text-fg-3" strokeWidth={1.75} />}
                  <span className="truncate">{p.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </section>
  );
}

function Recorder({
  recording,
  levels,
  elapsed,
  onToggle,
  disabled,
}: {
  recording: boolean;
  levels: number[];
  elapsed: number;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative grid h-28 w-28 place-items-center">
        {recording && (
          <>
            <span className="absolute inset-0 rounded-full bg-violet/30 animate-ring" aria-hidden />
            <span className="absolute inset-0 rounded-full bg-violet/20 animate-ring" style={{ animationDelay: '1.2s' }} aria-hidden />
          </>
        )}
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
          className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-violet to-violet-deep text-white shadow-glow transition-transform duration-150 ease-soft active:scale-[0.96] disabled:opacity-40"
        >
          {recording ? <Square className="h-7 w-7 fill-white" strokeWidth={1.75} /> : <Mic className="h-8 w-8" strokeWidth={1.75} />}
        </button>
      </div>

      <div className="flex h-14 items-end gap-[3px]" aria-hidden>
        {Array.from({ length: LEVEL_BARS }, (_, i) => {
          const v = recording ? levels[i] ?? 0 : 0;
          return (
            <span
              key={i}
              className="w-[3px] rounded-full bg-violet transition-[height] duration-100 ease-out"
              style={{ height: `${Math.max(4, v * 56)}px`, opacity: recording ? 0.5 + v * 0.5 : 0.25 }}
            />
          );
        })}
      </div>

      <p className="tabular-nums text-sm text-fg-2">
        {recording ? (
          <>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-rose align-middle" /> {formatSeconds(elapsed)}
            <span className="text-fg-3"> · max {MAX_CLIP_SECONDS}s</span>
          </>
        ) : (
          <span className="text-fg-3">Press to record this passage</span>
        )}
      </p>
    </div>
  );
}

/* ---------- Step 3: verification ---------- */

function VerifyStep({
  onVerified,
  notify,
  seconds,
}: {
  onVerified: () => Promise<void>;
  notify: (text: string, tone?: ToastState['tone']) => void;
  seconds: number;
}) {
  const [phrase, setPhrase] = useState(() => pickVerifyPhrase());
  const [supported, setSupported] = useState<boolean | null>(null);
  const [result, setResult] = useState<{ ratio: number; heard: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRecorder(20);
  const listener = useRef<{ finish: () => Promise<string> } | null>(null);

  useEffect(() => setSupported(speechRecognitionSupported()), []);

  async function toggle() {
    setError(null);
    setResult(null);
    if (!rec.recording) {
      const ok = await rec.start();
      if (!ok) return;
      listener.current = listen('en-US');
      if (!listener.current) {
        setError('Speech recognition could not start in this browser, so the read-aloud check cannot run.');
        await rec.stop();
      }
      return;
    }

    setChecking(true);
    try {
      const [take, heard] = await Promise.all([rec.stop(), listener.current ? listener.current.finish() : Promise.resolve('')]);
      listener.current = null;
      if (!take || take.seconds < 2) {
        setError('That was too short. Read the full phrase at a steady pace.');
        return;
      }
      const ratio = wordMatchRatio(phrase, heard);
      setResult({ ratio, heard });
      if (ratio >= VERIFY_THRESHOLD) {
        await addVoiceSample({
          id: newId(),
          profileId: 'me',
          kind: 'verify',
          label: phrase,
          seconds: Math.round(take.seconds * 10) / 10,
          mimeType: take.mimeType,
          blob: take.blob,
          createdAt: Date.now(),
        });
        await onVerified();
      } else {
        setPhrase(pickVerifyPhrase(phrase));
      }
    } catch {
      notify('Verification failed. Please try again.', 'error');
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="card-sheen animate-fade-up p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">Read-aloud check</p>
      <h2 className="mt-1 font-display text-2xl font-semibold">Read this phrase out loud</h2>
      <p className="mt-2 text-sm text-fg-2">
        This confirms the voice on the recordings is yours. You have {formatSeconds(seconds)} of script recorded.
      </p>

      <blockquote className="mt-6 rounded-input border border-violet/30 bg-violet/5 p-6 text-xl leading-9 text-fg" style={{ fontFamily: 'var(--font-reader-literata)' }}>
        “{phrase}”
      </blockquote>

      {supported === false && (
        <div role="alert" className="mt-6 rounded-input border border-amber/40 bg-amber/10 p-4 text-sm text-fg">
          This browser does not support speech recognition, so verification is not available here. Open Echo Shelf in Chrome or Edge to finish setup. Your recordings are saved.
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-5">
        {checking ? (
          <p className="flex items-center gap-2 text-sm text-fg-2">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> Checking your read-aloud…
          </p>
        ) : (
          <Recorder recording={rec.recording} levels={rec.levels} elapsed={rec.elapsed} onToggle={toggle} disabled={supported === false} />
        )}
        {rec.error && <p role="alert" className="text-center text-sm text-rose">{rec.error}</p>}
        {error && <p role="alert" className="text-center text-sm text-rose">{error}</p>}
        {result && result.ratio < VERIFY_THRESHOLD && (
          <p role="alert" className="max-w-md text-center text-sm text-amber">
            We heard “{result.heard || '…nothing'}”. Read the new phrase above as written and try again.
          </p>
        )}
      </div>
    </section>
  );
}

/* ---------- Step 4: ready ---------- */

function ReadyStep({
  samples,
  seconds,
  onRemove,
  onDeleteAll,
  notify,
}: {
  samples: VoiceSample[];
  seconds: number;
  onRemove: (s: VoiceSample) => Promise<void>;
  onDeleteAll: () => Promise<void>;
  notify: (text: string, tone?: ToastState['tone']) => void;
}) {
  const urls = useObjectUrls(samples);
  const [creating, setCreating] = useState(false);

  async function createVoice() {
    setCreating(true);
    try {
      await unconfiguredProvider.createVoice(
        samples.map((s) => s.blob),
        'My Voice',
      );
    } catch (e) {
      notify(e instanceof ProviderNotConfiguredError ? e.message : 'Could not create your voice.', 'error');
    } finally {
      setCreating(false);
    }
  }

  const scripts = samples.filter((s) => s.kind === 'script');
  return (
    <section className="space-y-6">
      <div className="card-sheen animate-fade-up flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Check className="h-5 w-5 text-mint" strokeWidth={2} /> Your voice is verified
          </h2>
          <p className="mt-1 text-sm text-fg-2">
            {scripts.length} passages, {formatSeconds(seconds)} of your voice, stored on this device.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={createVoice} disabled={creating}>
          {creating && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />}
          Create my narration voice
        </button>
      </div>

      <div className="rounded-card border border-dashed border-line px-5 py-4 text-sm text-fg-2">
        Creating the narration voice needs a voice-cloning provider, which is not connected yet. Until it is, your samples are kept safe and nothing is sent anywhere.
      </div>

      <div className="card-sheen animate-fade-up p-6" style={{ animationDelay: '80ms' }}>
        <h3 className="font-display text-xl font-semibold">Your recordings</h3>
        <ul className="mt-4 divide-y divide-line">
          {samples.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet/15 text-violet-mist">
                  <Play className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {s.kind === 'verify' ? 'Verification read-aloud' : SCRIPT.find((p) => p.id === s.label)?.title ?? 'Passage'}
                  </p>
                  <p className="text-xs tabular-nums text-fg-3">{formatSeconds(s.seconds)}</p>
                </div>
              </div>
              {urls.get(s.id) && <audio controls preload="none" src={urls.get(s.id)} className="h-9 w-full sm:w-64" />}
              <button
                type="button"
                className="icon-btn h-9 w-9 self-end hover:text-rose sm:self-auto"
                aria-label="Delete this recording"
                onClick={() => onRemove(s)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn-ghost hover:text-rose" onClick={onDeleteAll}>
          <Trash2 className="h-4 w-4" strokeWidth={1.75} /> Delete my voice data
        </button>
      </div>
    </section>
  );
}

function useObjectUrls(samples: VoiceSample[]) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const next = new Map<string, string>();
    for (const s of samples) next.set(s.id, URL.createObjectURL(s.blob));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [samples]);
  return urls;
}
