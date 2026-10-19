'use client';

// The profile area of the top bar.
//
// There is no password anywhere in here. "Signing in" means picking one of the
// profiles already stored in this browser, and the list can be switched from the
// menu without leaving the page.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LogOut, UserPlus } from 'lucide-react';
import { useProfile } from '@/lib/profile/useProfile';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileMenu() {
  const { ready, profile, profiles, choose, remove, clear } = useProfile();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the panel on Escape or a click anywhere outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (!ready) {
    // Same footprint as the chip, so the bar does not jump once the profiles load.
    return <span aria-hidden className="h-11 w-11 rounded-full border border-line bg-card" />;
  }

  if (!profile) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/signin" className="btn-ghost px-4">
          Sign in
        </Link>
        <Link href="/signup" className="btn-primary hidden px-4 sm:inline-flex">
          Sign up
        </Link>
      </div>
    );
  }

  const others = profiles.filter((p) => p.id !== profile.id);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Profile: ${profile.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-2.5 rounded-full border border-line bg-card py-1 pl-1 pr-3.5 transition-colors duration-250 ease-soft hover:border-violet/40"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet to-magenta text-xs font-semibold text-white">
          {initials(profile.name)}
        </span>
        <span className="max-w-[7rem] truncate text-sm font-medium text-fg">{profile.name.split(' ')[0]}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="glass animate-toast absolute right-0 top-[calc(100%+0.5rem)] z-40 w-72 rounded-card p-4 text-left"
        >
          <p className="text-sm font-medium text-fg">{profile.name}</p>
          {profile.email && <p className="mt-0.5 truncate text-xs text-fg-3">{profile.email}</p>}
          <p className="mt-3 text-xs leading-5 text-fg-3">
            Stored in this browser only. No password, and nothing leaves this device.
          </p>

          {others.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-3">Switch to</p>
              <div className="space-y-1">
                {others.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      await choose(p.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-input px-2 py-2 text-sm text-fg-2 transition-colors duration-250 hover:bg-raised hover:text-fg"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-[10px] font-semibold">
                      {initials(p.name)}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line px-3 py-2.5 text-sm font-medium text-fg-2 transition-colors duration-250 hover:border-violet/40 hover:text-fg"
            >
              <UserPlus className="h-4 w-4" strokeWidth={1.75} />
              Add profile
            </Link>
            <button
              type="button"
              role="menuitem"
              aria-label={`Remove ${profile.name}`}
              title={`Remove ${profile.name}`}
              onClick={async () => {
                await remove(profile.id);
                setOpen(false);
              }}
              className="icon-btn"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          {profile && others.length === 0 && (
            <button
              type="button"
              onClick={() => {
                clear();
                setOpen(false);
              }}
              className="mt-3 w-full text-center text-xs text-fg-3 underline-offset-4 hover:text-fg-2 hover:underline"
            >
              Stop using this profile
            </button>
          )}

        </div>
      )}
    </div>
  );
}
