// IndexedDB storage for the user's books and annotations. Everything stays in the browser for now;
// the PRD's Supabase backend will replace this layer later.
import type {
  Annotation,
  AppSettings,
  BookContent,
  BookMeta,
  StoredProfile,
  Summary,
  VoiceProfile,
  VoiceSample,
} from './types';

const DB_NAME = 'echo-shelf';
/**
 * Bump whenever a store or index is added. The upgrade handler is idempotent, but a
 * browser that already opened a given version will not re-run it, so a new store or
 * index needs a new number or returning users would find it missing.
 *
 * 7 added the `profileId` index on `meta`, so shelves are read per profile.
 */
const DB_VERSION = 7;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) {
          const meta = db.createObjectStore('meta', { keyPath: 'id' });
          meta.createIndex('profileId', 'profileId', { unique: false });
        } else {
          // Version 6 shelves predate profiles: add the index they are missing.
          const meta = req.transaction!.objectStore('meta');
          if (!meta.indexNames.contains('profileId')) {
            meta.createIndex('profileId', 'profileId', { unique: false });
          }
        }
        if (!db.objectStoreNames.contains('content')) db.createObjectStore('content', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('annotations')) {
          const store = db.createObjectStore('annotations', { keyPath: 'id' });
          store.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!db.objectStoreNames.contains('voices')) db.createObjectStore('voices', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('summaries')) {
          const summaries = db.createObjectStore('summaries', { keyPath: 'id' });
          summaries.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!db.objectStoreNames.contains('voice_samples')) {
          const samples = db.createObjectStore('voice_samples', { keyPath: 'id' });
          samples.createIndex('profileId', 'profileId', { unique: false });
        }
        // Local profiles and app settings. No credentials: nothing here is secret.
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function run<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        const req = work(tx);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
      }),
  );
}

export async function saveBook(meta: BookMeta, content: BookContent): Promise<void> {
  await run(['meta', 'content'], 'readwrite', (tx) => {
    tx.objectStore('meta').put(meta);
    tx.objectStore('content').put(content);
  });
}

/**
 * The books owned by one profile, newest first. Every shelf read goes through
 * here: there is deliberately no \"all books\" listing for the UI to accidentally
 * use, so one profile can never see another's library.
 */
export async function listBooks(profileId: string): Promise<BookMeta[]> {
  const db = await openDb();
  const rows = await new Promise<BookMeta[]>((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').index('profileId').getAll(profileId);
    req.onsuccess = () => resolve(req.result as BookMeta[]);
    req.onerror = () => reject(req.error);
  });
  return rows.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getBookMeta(id: string): Promise<BookMeta | undefined> {
  return (await run<BookMeta>(['meta'], 'readonly', (tx) =>
    tx.objectStore('meta').get(id),
  )) as BookMeta | undefined;
}

/** The book's metadata, but only when `profileId` owns it. */
export async function getOwnedBookMeta(id: string, profileId: string): Promise<BookMeta | undefined> {
  const meta = await getBookMeta(id);
  return meta && meta.profileId === profileId ? meta : undefined;
}

export async function putBookMeta(meta: BookMeta): Promise<void> {
  await run(['meta'], 'readwrite', (tx) => {
    tx.objectStore('meta').put(meta);
  });
}

/**
 * Adopts books saved before profiles existed. A book with no owner is given to
 * the profile that is signing in now; a book that already has one is left alone,
 * so this can never move a library between profiles.
 */
export async function claimUnownedBooks(profileId: string): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const req = store.getAll();
    let claimed = 0;
    req.onsuccess = () => {
      for (const row of req.result as BookMeta[]) {
        if (!row.profileId) {
          store.put({ ...row, profileId });
          claimed++;
        }
      }
    };
    tx.oncomplete = () => resolve(claimed);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export async function getBookContent(id: string): Promise<BookContent | undefined> {
  return (await run<BookContent>(['content'], 'readonly', (tx) =>
    tx.objectStore('content').get(id),
  )) as BookContent | undefined;
}

/** Highlights, notes and bookmarks for one book, oldest first. */
export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  const db = await openDb();
  const rows = await new Promise<Annotation[]>((resolve, reject) => {
    const tx = db.transaction('annotations', 'readonly');
    const req = tx.objectStore('annotations').index('bookId').getAll(bookId);
    req.onsuccess = () => resolve(req.result as Annotation[]);
    req.onerror = () => reject(req.error);
  });
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Annotations across a set of books, used by the Notes page. The caller passes the
 * ids of the books the signed-in profile owns, so notes stay with their library.
 */
export async function listAnnotationsForBooks(bookIds: string[]): Promise<Annotation[]> {
  if (bookIds.length === 0) return [];
  const wanted = new Set(bookIds);
  const db = await openDb();
  const rows = await new Promise<Annotation[]>((resolve, reject) => {
    const tx = db.transaction('annotations', 'readonly');
    const req = tx.objectStore('annotations').getAll();
    req.onsuccess = () => resolve(req.result as Annotation[]);
    req.onerror = () => reject(req.error);
  });
  return rows.filter((a) => wanted.has(a.bookId)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function putAnnotation(a: Annotation): Promise<void> {
  await run(['annotations'], 'readwrite', (tx) => {
    tx.objectStore('annotations').put(a);
  });
}

export async function deleteAnnotation(id: string): Promise<void> {
  await run(['annotations'], 'readwrite', (tx) => {
    tx.objectStore('annotations').delete(id);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['meta', 'content', 'annotations', 'summaries'], 'readwrite');
    tx.objectStore('meta').delete(id);
    tx.objectStore('content').delete(id);
    const store = tx.objectStore('annotations');
    const req = store.index('bookId').getAllKeys(id);
    req.onsuccess = () => {
      for (const key of req.result) store.delete(key);
    };
    const summaries = tx.objectStore('summaries');
    const sreq = summaries.index('bookId').getAllKeys(id);
    sreq.onsuccess = () => {
      for (const key of sreq.result) summaries.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/* ---------- Voice Studio ---------- */

export async function getVoiceProfile(profileId: string): Promise<VoiceProfile | undefined> {
  return (await run<VoiceProfile>(['voices'], 'readonly', (tx) =>
    tx.objectStore('voices').get(profileId),
  )) as VoiceProfile | undefined;
}

export async function saveVoiceProfile(p: VoiceProfile): Promise<void> {
  await run(['voices'], 'readwrite', (tx) => {
    tx.objectStore('voices').put(p);
  });
}

export async function listVoiceSamples(profileId: string): Promise<VoiceSample[]> {
  const db = await openDb();
  const rows = await new Promise<VoiceSample[]>((resolve, reject) => {
    const tx = db.transaction('voice_samples', 'readonly');
    const req = tx.objectStore('voice_samples').index('profileId').getAll(profileId);
    req.onsuccess = () => resolve(req.result as VoiceSample[]);
    req.onerror = () => reject(req.error);
  });
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addVoiceSample(sample: VoiceSample): Promise<void> {
  await run(['voice_samples'], 'readwrite', (tx) => {
    tx.objectStore('voice_samples').put(sample);
  });
}

export async function deleteVoiceSample(id: string): Promise<void> {
  await run(['voice_samples'], 'readwrite', (tx) => {
    tx.objectStore('voice_samples').delete(id);
  });
}

/** Removes this profile's voice and every recording. "Delete my voice data". */
export async function deleteAllVoiceData(profileId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['voices', 'voice_samples'], 'readwrite');
    tx.objectStore('voices').delete(profileId);
    const store = tx.objectStore('voice_samples');
    const req = store.index('profileId').getAllKeys(profileId);
    req.onsuccess = () => {
      for (const key of req.result) store.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/**
 * Voice data saved before voices were per-profile was stored under the fixed id
 * 'me'. The first profile to sign in adopts it, exactly as it adopts unowned
 * books, so an upgrade does not lose a recording and a later profile does not
 * inherit one. If this profile already has voice data of its own, the legacy rows
 * are left where they are: hidden, never mixed in and never deleted.
 */
export async function claimLegacyVoiceData(profileId: string): Promise<void> {
  if (profileId === 'me') return;
  const db = await openDb();
  const one = <T>(req: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  // All four reads go out together: a transaction commits when its last request
  // finishes, so awaiting one at a time could leave the next request outside it.
  const read = db.transaction(['voices', 'voice_samples'], 'readonly');
  const [ownVoice, ownSamples, legacyVoice, legacySamples] = await Promise.all([
    one(read.objectStore('voices').get(profileId)),
    one(read.objectStore('voice_samples').index('profileId').count(profileId)),
    one(read.objectStore('voices').get('me')),
    one<VoiceSample[]>(read.objectStore('voice_samples').index('profileId').getAll('me')),
  ]);
  if (ownVoice || ownSamples > 0) return;
  if (!legacyVoice && legacySamples.length === 0) return;

  const write = db.transaction(['voices', 'voice_samples'], 'readwrite');
  const voices = write.objectStore('voices');
  if (legacyVoice) {
    voices.put({ ...(legacyVoice as VoiceProfile), id: profileId });
    voices.delete('me');
  }
  for (const sample of legacySamples) write.objectStore('voice_samples').put({ ...sample, profileId });
  await new Promise<void>((resolve, reject) => {
    write.oncomplete = () => resolve();
    write.onerror = () => reject(write.error);
    write.onabort = () => reject(write.error ?? new Error('Transaction aborted'));
  });
}

/* ---------- Summaries ---------- */

export async function listSummaries(bookId: string): Promise<Summary[]> {
  const db = await openDb();
  return new Promise<Summary[]>((resolve, reject) => {
    const tx = db.transaction('summaries', 'readonly');
    const req = tx.objectStore('summaries').index('bookId').getAll(bookId);
    req.onsuccess = () => resolve(req.result as Summary[]);
    req.onerror = () => reject(req.error);
  });
}

export async function putSummary(s: Summary): Promise<void> {
  await run(['summaries'], 'readwrite', (tx) => {
    tx.objectStore('summaries').put(s);
  });
}

export async function deleteSummary(id: string): Promise<void> {
  await run(['summaries'], 'readwrite', (tx) => {
    tx.objectStore('summaries').delete(id);
  });
}

/* ---------- Local profiles ---------- */

/** Every profile in this browser, most recently used first. */
export async function listProfiles(): Promise<StoredProfile[]> {
  const rows = (await run<StoredProfile[]>(['profiles'], 'readonly', (tx) =>
    tx.objectStore('profiles').getAll(),
  )) as StoredProfile[] | undefined;
  return (rows ?? []).sort((a, b) => b.lastUsedAt - a.lastUsedAt || b.createdAt - a.createdAt);
}

export async function getProfile(id: string): Promise<StoredProfile | undefined> {
  return (await run<StoredProfile>(['profiles'], 'readonly', (tx) =>
    tx.objectStore('profiles').get(id),
  )) as StoredProfile | undefined;
}

/** Adds a profile, or updates an existing one. Nothing is checked, because nothing is a secret. */
export async function putProfile(profile: StoredProfile): Promise<void> {
  await run(['profiles'], 'readwrite', (tx) => {
    tx.objectStore('profiles').put(profile);
  });
}

/** Records that a profile was just picked, so the list orders itself by recency. */
export async function touchProfile(id: string, lastUsedAt: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('profiles', 'readwrite');
    const store = tx.objectStore('profiles');
    const req = store.get(id);
    req.onsuccess = () => {
      const profile = req.result as StoredProfile | undefined;
      if (profile) store.put({ ...profile, lastUsedAt });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export async function deleteProfile(id: string): Promise<void> {
  await run(['profiles'], 'readwrite', (tx) => {
    tx.objectStore('profiles').delete(id);
  });
}

/* ---------- App settings ---------- */

export async function getSettings(): Promise<AppSettings | undefined> {
  return (await run<AppSettings>(['settings'], 'readonly', (tx) =>
    tx.objectStore('settings').get('app'),
  )) as AppSettings | undefined;
}

export async function putSettings(settings: AppSettings): Promise<void> {
  await run(['settings'], 'readwrite', (tx) => {
    tx.objectStore('settings').put(settings);
  });
}
