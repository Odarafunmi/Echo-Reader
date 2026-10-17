// IndexedDB storage for the user's books and annotations. Everything stays in the browser for now;
// the PRD's Supabase backend will replace this layer later.
import type { Annotation, BookContent, BookMeta } from './types';

const DB_NAME = 'echo-shelf';
const DB_VERSION = 2;

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
    const tx = db.transaction(['meta', 'content', 'annotations'], 'readwrite');
    tx.objectStore('meta').delete(id);
    tx.objectStore('content').delete(id);
    const store = tx.objectStore('annotations');
    const req = store.index('bookId').getAllKeys(id);
    req.onsuccess = () => {
      for (const key of req.result) store.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}
