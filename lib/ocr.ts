'use client';

// OCR for scanned PDF pages.
//
// The engine (Tesseract.js) is loaded from /public/ocr rather than bundled: it is
// a worker plus a WebAssembly core plus an English model, about 30 MB, and none of
// that belongs in the app's JavaScript. Everything is served from this site, so OCR
// works offline and no page image ever leaves the device.
//
// The worker is created once and reused for every page of an import, then released.

export interface OcrProgress {
  status: string;
  progress: number;
}

interface OcrWorker {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string; confidence?: number } }>;
  terminate(): Promise<unknown>;
}

interface TesseractGlobal {
  createWorker(
    langs: string,
    oem: number,
    options: Record<string, unknown>,
  ): Promise<OcrWorker>;
}

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

/** OEM.LSTM_ONLY: the only model shipped in public/ocr, and the most accurate. */
const LSTM_ONLY = 1;

let scriptPromise: Promise<TesseractGlobal> | null = null;
let workerPromise: Promise<OcrWorker> | null = null;
/** The status listener for the import that is running now. */
let reporter: ((progress: OcrProgress) => void) | null = null;

export function ocrSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof WebAssembly !== 'undefined'
  );
}

function loadEngine(): Promise<TesseractGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('OCR needs a browser'));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TesseractGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/ocr/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error('The OCR engine loaded but did not start.'));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('The OCR engine could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function getWorker(): Promise<OcrWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const engine = await loadEngine();
    return engine.createWorker('eng', LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr',
      langPath: '/ocr/tessdata',
      workerBlobURL: false,
      gzip: true,
      logger: (m: { status?: string; progress?: number }) => {
        if (m?.status) reporter?.({ status: m.status, progress: m.progress ?? 0 });
      },
    });
  })();
  // A failed start must not be remembered, so a retry can try again.
  workerPromise.catch(() => {
    workerPromise = null;
  });
  return workerPromise;
}

/**
 * Recognises the text in one rendered page. Returns the plain text, with line
 * breaks preserved so the caller can rebuild paragraphs.
 */
export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  // The logger is attached when the worker is created, so the listener lives in a
  // module variable: the first import pays for loading the engine, and its progress
  // must reach that import's shelf even before `recognize` is called.
  reporter = onProgress ?? null;
  const worker = await getWorker();
  const result = await worker.recognize(canvas);
  reporter = null;
  return result.data.text ?? '';
}

/** Frees the worker and its language model. Safe to call when none was started. */
export async function disposeOcr(): Promise<void> {
  const worker = workerPromise;
  workerPromise = null;
  if (!worker) return;
  try {
    const w = await worker;
    await w.terminate();
  } catch {
    // Already gone.
  }
}
