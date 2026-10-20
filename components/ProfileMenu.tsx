'use client';

// The account area of the top bar.
//
// "Signing in" means picking one of the profiles already stored in this browser.
// Signing out only clears this tab's active profile; the profile and its books stay
// on the device, ready for the next sign-in. Deleting a profile is deliberately not
// offered here, because it would hide that profile's library for good.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const { ready, profile, profiles, choose, clear } = useProfile();
  const router = useRouter();
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
    return <span aria-hidden className="h-10 w-10 rounded-full border border-line bg-card sm:h-11 sm:w-11" />;
  }

  if (!profile) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/signin" className="btn-ghost h-10 px-3 text-[13px] sm:h-11 sm:px-4 sm:text-sm">
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
        aria-label={`Signed in as ${profile.name}. Open profile menu.`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-1 transition-colors duration-250 ease-soft hover:border-violet/40 sm:h-11 sm:gap-2.5 sm:pr-3.5"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet to-magenta text-[11px] font-semibold text-white sm:h-9 sm:w-9 sm:text-xs">
          {initials(profile.name)}
        </span>
        <span className="hidden max-w-[7rem] truncate text-sm font-medium text-fg sm:inline">
          {profile.name.split(' ')[0]}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="glass animate-toast absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(18rem,calc(100vw-1.5rem))] rounded-card p-4 text-left"
        >
          <p className="text-sm font-medium text-fg">{profile.name}</p>
          {profile.email && <p className="mt-0.5 truncate text-xs text-fg-3">{profile.email}</p>}
          <p className="mt-3 text-xs leading-5 text-fg-3">
            Signed in on this tab. Your books and notes stay in this browser, under this profile.
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
                      setOpen(false);
                      await choose(p.id);
                      router.push('/');
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

          <div className="mt-4 space-y-2">
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-line px-3 py-2.5 text-sm font-medium text-fg-2 transition-colors duration-250 hover:border-violet/40 hover:text-fg"
            >
              <UserPlus className="h-4 w-4" strokeWidth={1.75} />
              Add profile
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                clear();
                router.replace('/signin');
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-line px-3 py-2.5 text-sm font-medium text-fg-2 transition-colors duration-250 hover:border-rose/40 hover:text-rose"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              Sign out
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] leading-4 text-fg-3">
            Signing out hides your books on this tab. Nothing is deleted.
          </p>
        </div>
      )}
    </div>
  );
}
