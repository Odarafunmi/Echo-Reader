// Runs the real PDF parser against real PDF bytes, built here so the fixture is
// exact and nothing has to be committed.
//
//   node scripts/check-pdf-parse.mjs
//
// esbuild bundles lib/parse (its imports have no file extensions, which Node's
// ESM loader will not resolve) and inlines pdf.js's legacy build, because the
// browser build needs Promise.try and Node 22 does not have it.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

/** Builds a valid PDF: one content stream per page, base-14 Helvetica, real xref. */
function buildPdf(pages, { title = '' } = {}) {
  const numPages = pages.length;
  const firstPageObj = title ? 4 : 3;
  const fontObjNum = firstPageObj + numPages * 2;
  const infoObjNum = fontObjNum + 1;
  const kids = pages.map((_, i) => `${firstPageObj + i * 2} 0 R`);

  let out = '%PDF-1.4\n';
  const offsets = [];
  const add = (num, body) => {
    offsets[num] = out.length;
    out += `${num} 0 obj\n${body}\nendobj\n`;
  };

  add(1, '<< /Type /Catalog /Pages 2 0 R >>');
  add(2, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${numPages} >>`);
  if (title) add(3, `<< /Title (${title}) >>`);

  pages.forEach((lines, i) => {
    const pageNum = firstPageObj + i * 2;
    const contentNum = pageNum + 1;
    add(
      pageNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
    // 20pt leading: a bigger gap than the parser's paragraph threshold, so each
    // Tj lands on its own line.
    const stream = lines
      .map((t, k) => `BT /F1 12 Tf 72 ${700 - k * 20} Td (${t}) Tj ET`)
      .join('\n');
    add(contentNum, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  add(fontObjNum, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  if (title) add(infoObjNum, `<< /Title (${title}) >>`);

  const xrefOffset = out.length;
  const size = infoObjNum + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  const info = title ? ` /Info ${infoObjNum} 0 R` : '';
  out += `trailer\n<< /Size ${size} /Root 1 0 R${info} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const outDir = join(ROOT, 'node_modules', '.cache');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'pdf-parse-harness.mjs');

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

const { parsePdf, GlobalWorkerOptions } = await import(pathToFileURL(outfile).href);

// The parser points the worker at the site-absolute browser path. Redirect only
// that exact value so the parser itself runs unmodified.
const realWorker = pathToFileURL(
  join(ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
).href;
let stored = GlobalWorkerOptions.workerSrc;
Object.defineProperty(GlobalWorkerOptions, 'workerSrc', {
  configurable: true,
  get: () => stored,
  set: (v) => {
    stored = v === '/pdf.worker.min.mjs' ? realWorker : v;
  },
});

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message.split('\n')[0]]);
  }
}

await check('parses a real multi-page PDF into chapters', async () => {
  const pdf = buildPdf([
    ['Chapter One opening sentence.', 'It continues here.'],
    ['Chapter Two opening sentence.', 'Also continues.'],
  ]);
  const { chapters } = await parsePdf(toArrayBuffer(pdf), 'Fallback Title');
  assert.equal(chapters.length, 2, 'expected one chapter per page');
  assert.equal(chapters[0].title, 'Chapter One opening sentence.');
  assert.deepEqual(chapters[0].paragraphs, ['It continues here.']);
  assert.equal(chapters[1].title, 'Chapter Two opening sentence.');
});

await check('keeps every line of a page, in order', async () => {
  const lines = Array.from({ length: 12 }, (_, i) => `Line number ${i + 1} of the chapter.`);
  const pdf = buildPdf([['Heading for the chapter.', ...lines]]);
  const { chapters } = await parsePdf(toArrayBuffer(pdf), 'Fallback');
  const text = chapters.flatMap((c) => [c.title, ...c.paragraphs]).join('\n');
  for (const line of lines) {
    assert.ok(text.includes(line), `missing ${line}`);
  }
  assert.ok(text.indexOf('Line number 1 ') < text.indexOf('Line number 12 '), 'order must be kept');
});

await check('reads the document title from PDF metadata', async () => {
  const pdf = buildPdf([['Only paragraph here.']], { title: 'The Real Title' });
  const { title } = await parsePdf(toArrayBuffer(pdf), 'Ignored Fallback');
  assert.equal(title, 'The Real Title');
});

await check('survives many pages, which is what exercises the cleanup path', async () => {
  const pages = Array.from({ length: 60 }, (_, i) => [
    `Chapter ${i + 1} begins.`,
    `Body text for chapter ${i + 1}.`,
  ]);
  const { chapters } = await parsePdf(toArrayBuffer(buildPdf(pages)), 'Fallback');
  assert.equal(chapters.length, 60, 'every page should still produce a chapter');
  assert.equal(chapters[59].title, 'Chapter 60 begins.');
});

let failed = 0;
for (const [status, name, message] of results) {
  console.log(`${status === 'PASS' ? '✓' : '✗'} ${name}${message ? `\n    ${message}` : ''}`);
  if (status !== 'PASS') failed++;
}
console.log(`${results.length - failed} checks passed`);
process.exit(failed ? 1 : 0);
