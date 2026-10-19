'use client';

// Who is using Echo Shelf on this device, and nothing more.
//
// There is deliberately no authentication here. A profile is a name stored in this
// browser; picking one does not prove anything, and no password is asked for or
// kept. That is the product decision: the shelf, notes and voice already live in
// this browser alone, so a login that only this device can see would be theatre.
// If accounts on more than one device are wanted later, this is the module that
// would grow a real backend behind it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { StoredProfile } from '@/lib/types';
import { deleteProfile, getProfile, listProfiles, putProfile, touchProfile } from '@/lib/db';

/** Which profile is in use, remembered between visits. */
const CURRENT_KEY = 'echo-shelf.profile';

function readCurrentId(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

function writeCurrentId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(CURRENT_KEY, id);
    else window.localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* storage blocked: the choice simply will not persist */
  }
}

export interface ProfileApi {
  /** False until the stored profiles have been read, so the nav does not flash. */
  ready: boolean;
  /** The profile in use, or null when nobody has been picked. */
  profile: StoredProfile | null;
  /** Every profile in this browser, most recently used first. */
  profiles: StoredProfile[];
  /** Adds a profile and switches to it. */
  create(input: { name: string; email: string }): Promise<StoredProfile>;
  /** Switches to a profile that is already in this browser. */
  choose(id: string): Promise<void>;
  /** Deletes a profile. Deleting the one in use leaves nobody signed in. */
  remove(id: string): Promise<void>;
  /** Stops using any profile, but keeps them all. */
  clear(): void;
}

const ProfileContext = createContext<ProfileApi | null>(null);

export function ProfileGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [profile, setProfile] = useState<StoredProfile | null>(null);

  const refresh = useCallback(async () => {
    const all = await listProfiles();
    setProfiles(all);
    return all;
  }, []);

  // Load the profiles and reopen the one that was in use last time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listProfiles();
        if (cancelled) return;
        setProfiles(all);
        const id = readCurrentId();
        const found = id ? all.find((p) => p.id === id) : undefined;
        if (id && !found) writeCurrentId(null);
        setProfile(found ?? null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })().catch(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(
    async ({ name, email }: { name: string; email: string }) => {
      const now = Date.now();
      const next: StoredProfile = {
        id: crypto.randomUUID(),
        name: name.trim().replace(/\s+/g, ' '),
        email: email.trim(),
        createdAt: now,
        lastUsedAt: now,
      };
      await putProfile(next);
      await refresh();
      writeCurrentId(next.id);
      setProfile(next);
      return next;
    },
    [refresh],
  );

  const choose = useCallback(
    async (id: string) => {
      const found = (await getProfile(id)) ?? null;
      if (!found) {
        // The profile went missing, so drop the stale pointer rather than loop.
        writeCurrentId(null);
        setProfile(null);
        await refresh();
        return;
      }
      await touchProfile(id, Date.now());
      const all = await refresh();
      writeCurrentId(id);
      setProfile(all.find((p) => p.id === id) ?? found);
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteProfile(id);
      const all = await refresh();
      setProfile((current) => {
        if (current?.id !== id) return current;
        writeCurrentId(null);
        return null;
      });
      if (readCurrentId() === id) writeCurrentId(null);
      void all;
    },
    [refresh],
  );

  const clear = useCallback(() => {
    writeCurrentId(null);
    setProfile(null);
  }, []);

  const value = useMemo<ProfileApi>(
    () => ({ ready, profile, profiles, create, choose, remove, clear }),
    [ready, profile, profiles, create, choose, remove, clear],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileGate>');
  return ctx;
}
