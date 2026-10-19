'use client';

// The sign-up and sign-in pages, which are really "make a profile" and "pick a
// profile". No password is asked for, checked or stored, and nothing is sent
// anywhere: a profile is a name kept in this browser.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, Check, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import Toast, { type ToastState } from '@/components/Toast';
import { useProfile } from '@/lib/profile/useProfile';

export type ProfileMode = 'create' | 'choose';

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  optional?: boolean;
}

function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  autoComplete,
  placeholder,
  optional,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-baseline justify-between text-sm font-medium text-fg-2">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-fg-3">optional</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={
          'h-12 w-full rounded-input border bg-ink/40 px-4 text-fg placeholder:text-fg-3 ' +
          'transition-colors duration-250 ease-soft focus:border-violet focus:outline-none ' +
          (error ? 'border-rose/70' : 'border-line')
        }
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}

/** Shared by both modes: the fields that make a new profile. */
function NewProfileFields({
  name,
  setName,
  email,
  setEmail,
  nameError,
  touchName,
}: {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  nameError?: string;
  touchName: () => void;
}) {
  return (
    <>
      <Field
        id="name"
        label="Name"
        value={name}
        onChange={setName}
        onBlur={touchName}
        error={nameError}
        autoComplete="name"
        placeholder="Ada Lovelace"
      />
      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
        optional
      />
    </>
  );
}

export default function ProfileForm({ mode }: { mode: ProfileMode }) {
  const creating = mode === 'create';
  const router = useRouter();
  const { profiles, create, choose } = useProfile();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [next, setNext] = useState('/');
  // On the sign-in page, adding a profile happens inline once you ask for it.
  const [adding, setAdding] = useState(false);

  // Read the return target from the address bar rather than useSearchParams, so the
  // page stays statically prerenderable without a Suspense boundary.
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get('next');
    // Only same-site paths, so a ?next= link cannot leave with anything in tow.
    if (target && target.startsWith('/') && !target.startsWith('//')) setNext(target);
  }, []);

  const nameError = useMemo(() => {
    if (!touched) return undefined;
    return name.trim().length < 2 ? 'Enter the name to show on your shelf.' : undefined;
  }, [touched, name]);

  const go = (message: string) => {
    setToast({ id: Date.now(), text: message, tone: 'ok' });
    // Let the toast be seen before moving on.
    window.setTimeout(() => router.push(next), 700);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      const made = await create({ name, email });
      go(`Welcome${creating ? ' to Echo Shelf' : ' back'}, ${made.name.split(' ')[0]}.`);
    } catch {
      setError('This browser blocked the storage profiles need. Try a different browser.');
      setBusy(false);
    }
  };

  const onChoose = async (id: string, who: string) => {
    setBusy(true);
    try {
      await choose(id);
      go(`Welcome back, ${who.split(' ')[0]}.`);
    } catch {
      setError('That profile could not be opened.');
      setBusy(false);
    }
  };

  const showFields = creating || adding || profiles.length === 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-10 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet to-magenta shadow-glow">
          <BookOpen className="h-4 w-4 text-white" strokeWidth={1.75} />
        </span>
        Echo Shelf
      </Link>

      <section className="card-sheen animate-fade-up p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {creating ? 'Create your profile' : 'Who is reading?'}
        </h1>
        <p className="mt-2 text-sm text-fg-2">
          {creating
            ? 'Your shelf, notes and voice stay in this browser, under your name.'
            : profiles.length > 0
              ? 'Pick a profile stored in this browser, or add a new one.'
              : 'No profiles in this browser yet. Add one to get started.'}
        </p>

        {!creating && profiles.length > 0 && (
          <div className="mt-6 space-y-2">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => void onChoose(p.id, p.name)}
                className="flex w-full items-center gap-3 rounded-input border border-line bg-ink/40 px-4 py-3 text-left transition-colors duration-250 ease-soft hover:border-violet/50 disabled:opacity-50"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet to-magenta text-xs font-semibold text-white">
                  {p.name.trim().slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
                  {p.email && <span className="block truncate text-xs text-fg-3">{p.email}</span>}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-fg-3" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        )}

        {showFields && (
          <form className={(!creating && profiles.length > 0 ? 'mt-6 border-t border-line pt-6 ' : 'mt-8 ') + 'space-y-5'} onSubmit={onSubmit} noValidate>
            {!creating && profiles.length > 0 && (
              <p className="flex items-center gap-2 text-sm font-medium text-fg-2">
                <UserPlus className="h-4 w-4" strokeWidth={1.75} />
                Add a new profile
              </p>
            )}
            <NewProfileFields
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              nameError={nameError}
              touchName={() => setTouched(true)}
            />
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Check className="h-4 w-4" strokeWidth={1.75} />
              )}
              {creating ? 'Create profile' : profiles.length > 0 ? 'Add and use this profile' : 'Create profile'}
            </button>
          </form>
        )}

        {!creating && profiles.length > 0 && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-ghost mt-5 w-full"
          >
            <UserPlus className="h-4 w-4" strokeWidth={1.75} />
            Add a new profile
          </button>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-input border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <p className="mt-6 text-sm text-fg-2">
          {creating ? 'Already have a profile here?' : 'First time on this device?'}{' '}
          <Link
            href={creating ? '/signin' : '/signup'}
            className="font-medium text-violet-mist underline-offset-4 hover:underline"
          >
            {creating ? 'Sign in' : 'Create one'}
          </Link>
        </p>
      </section>

      <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-fg-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span>
          No password and no account server. Profiles are stored in this browser on this device, so
          anyone using it can switch between them, and clearing site data removes them.
        </span>
      </p>

      <Toast toast={toast} onDone={() => setToast(null)} />
    </main>
  );
}
