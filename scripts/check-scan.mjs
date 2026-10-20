// A scanned PDF, from bytes to readable text.
//
//   node scripts/check-scan.mjs
//
// ImageMagick cannot write PDFs in this sandbox, so the fixture is a JPEG page
// (scripts/fixtures/scan-page.jpg) wrapped in a PDF here: one page that is only an
// image, and one ordinary text page. The checks are the questions the importer
// asks in this order:
//   - does the image-only page really have no text to extract? (it must, or OCR
//     would never run)
//   - can the OCR engine read that image back?
//   - does the result turn into paragraphs a reader can set, highlight and speak?
//   - does a blank page stay blank instead of becoming noise?
//   - is a page that already has text left alone?

import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

const scanJpeg = readFileSync(join(HERE, 'fixtures', 'scan-page.jpg'));
const blankJpeg = readFileSync(join(HERE, 'fixtures', 'blank-page.jpg'));

/* ---------- a PDF whose first page is only a JPEG ---------- */

function buildScannedPdf() {
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = (value) => {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
    chunks.push(buf);
    length += buf.length;
  };
  const object = (num, body) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
    push(body);
    push('\nendobj\n');
  };

  // 1 catalog, 2 pages, 3 font, 4 image page, 5 its content, 6 the image,
  // 7 text page, 8 its content.
  push('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [4 0 R 7 0 R] /Count 2 >>');
  object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  object(
    4,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1240 1754] ' +
      '/Resources << /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>',
  );
  const imageContent = 'q 1240 0 0 1754 0 0 cm /Im1 Do Q';
  object(5, `<< /Length ${imageContent.length} >>\nstream\n${imageContent}\nendstream`);
  push('6 0 obj\n');
  push(
    `<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${scanJpeg.length} >>\nstream\n`,
  );
  push(scanJpeg);
  push('\nendstream\nendobj\n');
  object(
    7,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 3 0 R >> >> /Contents 8 0 R >>',
  );
  const text = ['It was a printed page, not a scan.', 'Its text can be lifted directly.']
    .map((line, i) => `BT /F1 12 Tf 72 ${700 - i * 20} Td (${line}) Tj ET`)
    .join('\n');
  object(8, `<< /Length ${text.length} >>\nstream\n${text}\nendstream`);

  const xref = length;
  push(`xref\n0 9\n0000000000 65535 f \n`);
  for (let i = 1; i <= 8; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return { buffer: Buffer.concat(chunks), scans: [scanJpeg] };
}

/* ---------- the parser's own helpers, bundled for Node ---------- */

const outDir = join(ROOT, 'node_modules', '.cache');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'scan-harness.mjs');
await build({
  entryPoints: [join(HERE, 'pdf-parse-harness.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { 'pdfjs-dist': join(ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs') },
  external: ['pdfjs-dist'],
  outfile,
  logLevel: 'silent',
});
const { OCR_MIN_WORDS, paragraphsFromLines } = await import(pathToFileURL(outfile).href);
const pdfjs = await import(pathToFileURL(join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);

const countWords = (text) => (text.match(/\S+/g) ?? []).length;

/* ---------- read the text a PDF actually carries ---------- */

const { buffer } = buildScannedPdf();
const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
const doc = await task.promise;
const wordsOn = async (pageNumber) => {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items.filter((item) => 'str' in item).map((item) => item.str).join(' ');
  page.cleanup();
  return text;
};
const scannedText = await wordsOn(1);
const printedText = await wordsOn(2);
await task.destroy();

/* ---------- the OCR engine, exactly as the importer starts it ---------- */

const { createWorker } = await import('tesseract.js');
const worker = await createWorker('eng', 1, {
  langPath: join(ROOT, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0'),
  gzip: true,
  cachePath: join(outDir, 'tesseract'),
  logger: () => {},
});
const recognise = async (jpeg) => {
  const started = Date.now();
  const { data } = await worker.recognize(jpeg);
  return { text: data.text ?? '', confidence: data.confidence ?? 0, ms: Date.now() - started };
};
const scanned = await recognise(scanJpeg);
const blank = await recognise(blankJpeg);
await worker.terminate();

const paragraphs = paragraphsFromLines(scanned.text.split(/\r?\n/));

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message.split('\n')[0]]);
  }
}

check('the image-only page has no text to extract, so it will be sent to OCR', () => {
  assert.ok(
    countWords(scannedText) < OCR_MIN_WORDS,
    `found ${countWords(scannedText)} words in a scan: ${JSON.stringify(scannedText.slice(0, 80))}`,
  );
});

check('the engine reads the scanned page back', () => {
  assert.ok(scanned.confidence >= 80, `confidence was ${scanned.confidence}`);
  const text = scanned.text.toLowerCase();
  for (const word of ['lighthouse', 'keeper', 'mara', 'harbour', 'strangers']) {
    assert.ok(text.includes(word), `OCR missed “${word}”: ${JSON.stringify(scanned.text.slice(0, 120))}`);
  }
});

check('the recognised text keeps reading order', () => {
  const text = scanned.text.toLowerCase();
  assert.ok(text.indexOf('lighthouse') < text.indexOf('strangers'), 'paragraphs came back out of order');
});

check('the recognised text becomes paragraphs worth reading', () => {
  assert.ok(paragraphs.length >= 2, `got ${paragraphs.length} paragraph(s)`);
  const words = paragraphs.reduce((n, p) => n + countWords(p), 0);
  assert.ok(words >= OCR_MIN_WORDS, `only ${words} words came through, under the ${OCR_MIN_WORDS} needed`);
  assert.ok(paragraphs.join(' ').includes('replaced by strangers'), 'the last line was lost');
});

check('a blank page stays blank instead of becoming noise', () => {
  assert.ok(countWords(blank.text) < 3, `a blank page produced “${blank.text.trim().slice(0, 60)}”`);
});

check('a page that already has text is never sent to OCR', () => {
  assert.ok(countWords(printedText) >= OCR_MIN_WORDS, `only ${countWords(printedText)} words on a printed page`);
  assert.ok(printedText.includes('printed page'), 'the digital text was not read as it is');
});

let failed = 0;
for (const [status, name, message] of results) {
  console.log(`${status === 'PASS' ? '✓' : '✗'} ${name}${message ? `\n    ${message}` : ''}`);
  if (status !== 'PASS') failed++;
}
console.log(`${results.length - failed} checks passed`);
console.log(`scanned page: ${scanned.ms} ms, confidence ${scanned.confidence}; blank page: ${blank.ms} ms`);
process.exit(failed ? 1 : 0);
