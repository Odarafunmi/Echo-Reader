// Copies the OCR engine into /public so scanned PDFs can be read without any
// network access at runtime. Tesseract loads a worker script, a WebAssembly core
// and an English language model; all three are served from /ocr.
//
//   node scripts/copy-ocr-assets.mjs
//
// The files are large, so they are generated from node_modules and gitignored,
// exactly like the PDF.js worker.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const dest = join(root, 'public', 'ocr');
const tessdata = join(dest, 'tessdata');

const files = [
  // The browser bundle and the worker. `tesseract.min.js` is loaded with a script
  // tag by lib/ocr.ts, which keeps the engine out of the app's own bundle.
  [join(modules, 'tesseract.js', 'dist', 'tesseract.min.js'), join(dest, 'tesseract.min.js')],
  [join(modules, 'tesseract.js', 'dist', 'worker.min.js'), join(dest, 'worker.min.js')],
  // LSTM-only cores in three flavours: relaxed SIMD (newest), SIMD, and plain.
  // The worker picks whichever this browser supports, all from the same folder.
  [join(modules, 'tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), join(dest, 'tesseract-core-relaxedsimd-lstm.wasm.js')],
  [join(modules, 'tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm'), join(dest, 'tesseract-core-relaxedsimd-lstm.wasm')],
  [join(modules, 'tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), join(dest, 'tesseract-core-simd-lstm.wasm.js')],
  [join(modules, 'tesseract.js-core', 'tesseract-core-simd-lstm.wasm'), join(dest, 'tesseract-core-simd-lstm.wasm')],
  [join(modules, 'tesseract.js-core', 'tesseract-core-lstm.wasm.js'), join(dest, 'tesseract-core-lstm.wasm.js')],
  [join(modules, 'tesseract.js-core', 'tesseract-core-lstm.wasm'), join(dest, 'tesseract-core-lstm.wasm')],
  // The English language model, gzipped as tesseract expects.
  [
    join(modules, '@tesseract.js-data', 'eng', '4.0.0', 'eng.traineddata.gz'),
    join(tessdata, 'eng.traineddata.gz'),
  ],
];

const missing = files.filter(([src]) => !existsSync(src));
if (missing.length > 0) {
  console.warn(
    `[copy-ocr-assets] ${missing.length} source file(s) missing (tesseract.js or @tesseract.js-data/eng not installed), skipping.`,
  );
  process.exit(0);
}

mkdirSync(tessdata, { recursive: true });
let bytes = 0;
for (const [src, to] of files) {
  copyFileSync(src, to);
  bytes += statSync(to).size;
}
console.log(`[copy-ocr-assets] copied OCR engine to public/ocr (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
