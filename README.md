# Echo Shelf (Echo-Reader)

A web-based ebook reader. Upload your own books and read them in a layout you control.
This repo currently implements **MVP steps 1 and 2**, plus the sampling part of step 4, from the PRD: library upload, shelf, custom reader, notes, highlights, bookmarks, and Voice Studio sampling.

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Visual system: [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md)

## Features in this build

- **Library upload**: PDF, EPUB, DOCX, TXT and MD. Chapters are detected from PDF outlines, EPUB spine, or heading patterns such as "Chapter 1". Long texts without headings are split into parts.
- **Shelf**: cover tiles with format tags, progress bars and a "Continue reading" row.
- **Custom reader**: Literata, Inter, Georgia or OpenDyslexic; text size; line spacing; margins; Midnight, Paper, Sepia, Violet Dusk or custom colours; single or double page view; chapter navigator; keyboard arrows for previous and next chapter.
- **Progress**: saved per book as you scroll and restored on return (this device only).
- **Highlights**: select text within one paragraph and pick amber, magenta or cyan. Click a highlight to change its colour, add a note, or delete it.
- **Notes**: a side panel with Notes, Highlights and Bookmarks tabs, search, quick notes, and notes pinned to the quote they came from.
- **Bookmarks**: the bookmark button saves the current spot. It toggles off when pressed again.
- **Voice Studio**: consent, a six-passage guided script (at least 1 minute, up to 3 minutes), a live level meter while recording, playback before you keep a take, and a read-aloud check. The check uses the browser's speech recognition, so it works in Chrome and Edge. Where recognition is unavailable the profile stays unverified. Samples and the profile are stored in IndexedDB, and "Delete my voice data" removes them.

Everything runs in the browser for now. Books, highlights, notes and bookmarks are stored in IndexedDB, and preferences and progress in localStorage. Cross-device progress sync needs the PRD's Supabase backend, which is not wired in yet. Creating the cloned voice and narrating with it need a voice provider (for example ElevenLabs) and a server route that keeps its API key private. The provider is an interface in `lib/voice/provider.ts` and is not connected yet. Smart Summary and export come in later milestones.

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
- Voice verification uses speech recognition, which sends audio to the browser vendor's speech service. Check that this is acceptable before launch.
- The consent wording in `lib/voice/script.ts` is a draft and should be reviewed before real users record their voice.
- Highlights are limited to one paragraph. Overlapping highlights are shown with the earlier one winning.
