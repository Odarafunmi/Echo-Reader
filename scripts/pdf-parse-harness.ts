// Bundled by check-pdf-parse.mjs. Node cannot resolve the extensionless imports
// inside lib/parse, so esbuild does that step; this file only re-exports the
// parser under test and the pdf.js options object it needs.
export { parsePdf } from '../lib/parse/pdf';
export { GlobalWorkerOptions } from 'pdfjs-dist';
