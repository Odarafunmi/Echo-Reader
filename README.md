# Echo Shelf (Echo-Reader)

A web-based ebook reader. Upload your own books and read them in a layout you control.
This repo currently implements **MVP step 1** from the PRD: library upload, shelf and custom reader.

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Visual system: [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md)

## Features in this build

- **Library upload**: PDF, EPUB, DOCX, TXT and MD. Chapters are detected from PDF outlines, EPUB spine, or heading patterns such as "Chapter 1". Long texts without headings are split into parts.
- **Shelf**: cover tiles with format tags, progress bars and a "Continue reading" row.
- **Custom reader**: Literata, Inter, Georgia or OpenDyslexic; text size; line spacing; margins; Midnight, Paper, Sepia, Violet Dusk or custom colours; single or double page view; chapter navigator; keyboard arrows for previous and next chapter.
- **Progress**: saved per book as you scroll and restored on return.

Everything runs in the browser for now. Books are stored in IndexedDB and preferences in localStorage. The PRD's Supabase backend, voice features, Smart Summary, notes and export come in later milestones.

## Getting started

```bash
npm install        # also copies the PDF.js worker into public/
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
```

## Notes

- Fonts load from Google Fonts in the browser. Without network access the UI falls back to system serif and sans fonts.
- Scanned PDFs (images only) are not supported yet. OCR is a later milestone.
