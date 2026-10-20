'use client';

// The mandatory sign-in gate.
//
// Every library surface (shelf, reader, notes, Voice Studio) renders inside this
// component. Until a profile is active it shows a quiet holding screen and sends
// the visitor to /signin with the page they asked for, so a direct link cannot
// open someone's library without a profile being chosen first.
//
// The children are keyed by profile id: switching profiles remounts them, which
// clears the old shelf, notes and reader state in one step and loads the new
// profile's data from storage.

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { BookOpen } from 'lucide-react';
import { useProfile } from '@/lib/profile/useProfile';

function Hold({ label }: { label: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid h-12 w-12 animate-breathe place-items-center rounded-full bg-gradient-to-br from-violet to-magenta shadow-glow">
          <BookOpen className="h-5 w-5 text-white" strokeWidth={1.75} />
        </span>
        <p className="text-sm text-fg-3" role="status" aria-live="polite">
          {label}
        </p>
      </div>
    </div>
  );
}

export default function RequireProfile({ children }: { children: ReactNode }) {
  const { ready, storageReady, profile } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || profile) return;
    const next = `${pathname ?? '/'}${typeof window === 'undefined' ? '' : window.location.search}`;
    const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    router.replace(`/signin?next=${encodeURIComponent(safe)}`);
  }, [ready, profile, pathname, router]);

  if (!ready) return <Hold label="Opening your shelf…" />;
  if (!profile) return <Hold label="Taking you to sign in…" />;
  if (!storageReady) return <Hold label="Preparing your library…" />;

  // Keyed so a profile switch throws away every component's in-memory data.
  return <div key={profile.id}>{children}</div>;
}
