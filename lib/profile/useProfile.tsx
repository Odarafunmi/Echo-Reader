'use client';

// Who is using Echo Shelf on this device, and nothing more.
//
// There is deliberately no authentication here. A profile is a name stored in this
// browser; picking one does not prove anything, and no password is asked for or
// kept. What it does do is partition the library: every book carries the id of the
// profile that imported it, and every shelf read is filtered by that id. Switching
// profiles therefore swaps shelves, and signing out hides the books rather than
// deleting them.
//
// The active profile lives in sessionStorage, so each tab is signed in on its own
// and a link opened in a new tab starts at the sign-in screen. Signing out clears
// only that pointer; the profiles and their books stay where they are.

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
import {
  claimLegacyVoiceData,
  claimUnownedBooks,
  deleteProfile,
  getProfile,
  listProfiles,
  putProfile,
  touchProfile,
} from '@/lib/db';
import { migrateLegacyProgress } from '@/lib/library';

/** Which profile is in use, for this browser tab. */
const CURRENT_KEY = 'echo-shelf.profile';
/** Before session storage was authoritative the id was kept here; cleaned up on load. */
const LEGACY_KEY = 'echo-shelf.profile:remembered';

function readCurrentId(): string | null {
  try {
    return window.sessionStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

function writeCurrentId(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(CURRENT_KEY, id);
    else window.sessionStorage.removeItem(CURRENT_KEY);
  } catch {
    /* storage blocked: the choice simply will not survive a reload */
  }
  try {
    // An older build kept a remembered profile here. It must never sign anyone in.
    window.localStorage.removeItem(LEGACY_KEY);
    window.localStorage.removeItem('echo-shelf.profile');
  } catch {
    /* storage blocked */
  }
}

export interface ProfileApi {
  /** False until the stored profiles have been read, so the nav does not flash. */
  ready: boolean;
  /**
   * False while a freshly chosen profile's older books are being tagged with it.
   * The gate waits for this before any shelf is shown, so nothing can be read
   * before ownership has been settled.
   */
  storageReady: boolean;
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
  /** Signs out of this tab. The profile and its books are kept. */
  clear(): void;
}

const ProfileContext = createContext<ProfileApi | null>(null);

export function ProfileGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [profile, setProfile] = useState<StoredProfile | null>(null);

  const refresh = useCallback(async () => {
    const all = await listProfiles();
    setProfiles(all);
    return all;
  }, []);

  /**
   * Tags this browser's pre-profile books and voice recordings with the profile
   * that is signing in, and moves the old unscoped reading positions over too. Runs for every
   * activation, because a different device may still hold older rows. It only ever
   * touches books that have no owner.
   */
  const settleStorage = useCallback(async (id: string) => {
    setStorageReady(false);
    try {
      await claimUnownedBooks(id);
      await claimLegacyVoiceData(id);
      migrateLegacyProgress(id);
    } catch {
      // A blocked database must not lock the user out of the app. The shelf will
      // show its own storage message if reading it fails too.
    } finally {
      setStorageReady(true);
    }
  }, []);

  // Load the profiles and reopen the one this tab was using.
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
        if (found) {
          setProfile(found);
          await settleStorage(found.id);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })().catch(() => {
      if (!cancelled) {
        setReady(true);
        setStorageReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settleStorage]);

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
      await settleStorage(next.id);
      return next;
    },
    [refresh, settleStorage],
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
      await settleStorage(id);
    },
    [refresh, settleStorage],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteProfile(id);
      await refresh();
      setProfile((current) => {
        if (current?.id !== id) return current;
        writeCurrentId(null);
        return null;
      });
      if (readCurrentId() === id) writeCurrentId(null);
    },
    [refresh],
  );

  const clear = useCallback(() => {
    // Signs this tab out. Books, notes and the profile itself are untouched.
    writeCurrentId(null);
    setProfile(null);
    setStorageReady(false);
    setProfiles((p) => p);
  }, []);

  const value = useMemo<ProfileApi>(
    () => ({ ready, storageReady, profile, profiles, create, choose, remove, clear }),
    [ready, storageReady, profile, profiles, create, choose, remove, clear],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileGate>');
  return ctx;
}
