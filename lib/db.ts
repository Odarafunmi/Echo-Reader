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
 * Bump whenever a store is added. The upgrade handler is idempotent, but a browser
 * that already opened a given version will not re-run it, so a new store needs a new
 * number or returning users would find it missing.
 */
const DB_VERSION = 6;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
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

export async function listBooks(): Promise<BookMeta[]> {
  const rows = (await run<BookMeta[]>(['meta'], 'readonly', (tx) =>
    tx.objectStore('meta').getAll(),
  )) as BookMeta[] | undefined;
  return (rows ?? []).sort((a, b) => b.addedAt - a.addedAt);
}

export async function getBookMeta(id: string): Promise<BookMeta | undefined> {
  return (await run<BookMeta>(['meta'], 'readonly', (tx) =>
    tx.objectStore('meta').get(id),
  )) as BookMeta | undefined;
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

/** Every annotation in the library, used by the Notes page. */
export async function listAllAnnotations(): Promise<Annotation[]> {
  const db = await openDb();
  const rows = await new Promise<Annotation[]>((resolve, reject) => {
    const tx = db.transaction('annotations', 'readonly');
    const req = tx.objectStore('annotations').getAll();
    req.onsuccess = () => resolve(req.result as Annotation[]);
    req.onerror = () => reject(req.error);
  });
  return rows.sort((a, b) => b.createdAt - a.createdAt);
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

export async function getVoiceProfile(): Promise<VoiceProfile | undefined> {
  return (await run<VoiceProfile>(['voices'], 'readonly', (tx) => tx.objectStore('voices').get('me'))) as
    | VoiceProfile
    | undefined;
}

export async function saveVoiceProfile(p: VoiceProfile): Promise<void> {
  await run(['voices'], 'readwrite', (tx) => {
    tx.objectStore('voices').put(p);
  });
}

export async function listVoiceSamples(): Promise<VoiceSample[]> {
  const db = await openDb();
  const rows = await new Promise<VoiceSample[]>((resolve, reject) => {
    const tx = db.transaction('voice_samples', 'readonly');
    const req = tx.objectStore('voice_samples').index('profileId').getAll('me');
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

/** Removes the profile and every recording. Used for "delete my voice data". */
export async function deleteAllVoiceData(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['voices', 'voice_samples'], 'readwrite');
    tx.objectStore('voices').delete('me');
    const store = tx.objectStore('voice_samples');
    const req = store.index('profileId').getAllKeys('me');
    req.onsuccess = () => {
      for (const key of req.result) store.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
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
