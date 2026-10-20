# Echo Shelf (Echo-Reader)

A web-based ebook reader. Upload your own books and read them in a layout you control.
This repo implements **MVP steps 1 and 2**, plus the sampling part of step 4 and the summary part of step 5, from the PRD: a profile-gated library, shelf with real covers, a custom reader with tap-to-read narration, notes, highlights, bookmarks, Voice Studio sampling, and Smart Summary.

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Visual system: [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md)

## Features in this build

- **Profiles and a mandatory sign-in gate**: create a profile at `/signup`, and sign in at `/signin` (`/login` is an alias that redirects there, keeping `?next=`). There is no authentication: no password is asked for, hashed or stored, and nothing is sent anywhere. A profile is a name (and an optional email as a label) kept in this browser. **Every library surface is behind the gate**: `/`, `/notes`, `/voice` and `/read/[id]` render inside `components/RequireProfile.tsx`, which redirects to `/signin?next=…` when no profile is active for this tab, so a direct link cannot open a shelf. The active profile lives in `sessionStorage`, so each tab signs in on its own; signing out clears only that pointer, never a book. Anyone using the browser can switch profiles, and clearing site data removes them. If accounts that work on more than one device are wanted later, `lib/profile/useProfile.tsx` is the one module that would grow a real backend.
- **A shelf per profile**: every book records the profile that imported it (`BookMeta.profileId`), and every shelf read goes through the `profileId` index in IndexedDB, so profile A and profile B sharing a browser see separate libraries. Switching profiles remounts the UI (the gate keys its children by profile id), which empties the old shelf and loads the new one. Books imported before profiles existed are adopted by the profile that signs in next, once, and are never moved again. Reading positions are stored per profile (`echo-shelf:progress:v2:<profileId>`), and the old unscoped map is migrated to the first profile that signs in.
- **Covers, three tiers**: the first page of a PDF is rendered and used as the cover when it has something on it; a blank, near-white or failed render is rejected by measuring its pixels; otherwise a solid-colour title cover is drawn (one of eight dark palette colours, chosen to balance the shelf, with the title and author in white). Covers are saved with the book as small JPEG data URLs, so the shelf never renders a gradient placeholder, and books from older builds get a cover the first time their shelf is opened.
- **Dark and light themes**: the sun and moon button in the top bar switches the whole app. The choice is saved to localStorage and IndexedDB, and an inline script in `app/layout.tsx` applies it before the first paint so there is no flash. Until you choose, the system preference decides, and the app keeps following it if you change it at the OS level. Only the semantic colour tokens change, so every surface follows, including the wireframe book field, which darkens its violet to stay visible on a pale ground.
- **Library upload**: PDF, EPUB, DOCX, TXT and MD. Chapters are detected from PDF outlines, EPUB spine, or heading patterns such as "Chapter 1". Long texts without headings are split into parts. Imports show what they are doing, page by page, and can be cancelled.
- **Scanned PDFs (OCR)**: a page whose extracted text is too short is treated as a scan. It is rendered at about 1,700px and read with a bundled Tesseract engine (worker, WebAssembly core and English model in `public/ocr`, copied from `node_modules` at install time), so scanned books become reflowable text that can be highlighted, tapped and spoken. Nothing leaves the device. The first scanned page loads the engine; the shelf shows "Preparing the scanned-text reader" while it does.
- **Shelf**: cover tiles with format tags, progress bars and a "Continue reading" row.
- **Custom reader**: Literata, Inter, Georgia or OpenDyslexic; text size; line spacing; margins; Midnight, Paper, Sepia, Violet Dusk or custom colours; single or double page view; chapter navigator; keyboard arrows for previous and next chapter. Every word is its own element, so it can be tapped, and PDF pages are separated by a hairline with a small "Page 3" label.
- **Navigation from anywhere**: circular previous/next chapter arrows sit fixed at mid-height on both sides of the reader, subtle until hovered, and larger on a phone, so a chapter can be changed without scrolling to the end.
- **Progress**: saved per book and per profile as you scroll and restored on return (this device only).
- **Highlights**: select text within one paragraph and pick amber, magenta or cyan. Click a highlight to change its colour, add a note, or delete it.
- **Notes**: a side panel with Notes, Highlights and Bookmarks tabs, search, quick notes, and notes pinned to the quote they came from.
- **Bookmarks**: the bookmark button saves the current spot. It toggles off when pressed again.
- **Notes page**: the top-bar Notes tab lists every note, highlight and bookmark across the signed-in profile's library, grouped by book, with search. Open jumps back to the spot in the book. Delete works here too.
- **Built-in voices**: a masculine and a feminine narration voice, chosen in Voice Studio with a preview for each. They use the speech voices already installed on your device, so nothing is downloaded or sent to a server, and no key is needed. To hear a deeper voice, install one at the OS level (for example Daniel on macOS, or David or Mark on Windows) and restart the browser. The browser does not report gender, so each option matches a known voice name. When the device has no matching voice, that option uses the default voice with a higher or lower pitch.
- **Read aloud, fully controlled**: the speaker button opens a real player at the bottom of the reader. It has back-10-seconds, play/pause from the exact word, forward-10-seconds, a draggable position bar, four speeds (1×, 1.25×, 1.5×, 2×), a follow-the-voice toggle, and a close button. Pausing cancels the utterance and remembers the word, so resuming re-speaks from that word instead of restarting the chapter. It needs a browser with speech synthesis, such as Chrome, Edge and Safari.
- **Tap any word to read from it**: tapping or clicking a word starts narration at that exact word (or jumps there while playing). Highlight editing moves to a long-press on a phone or a double-click on a desktop, so the two gestures do not fight. The hint under the chapter title explains it the first time.
- **Word-by-word tracking and follow-along scroll**: the spoken word is highlighted in soft amber (rounded, with a short colour transition), moved by the browser's `word` boundary events and, where those are missing, by a length-weighted timed estimate. The page scrolls smoothly only when the word approaches an edge, so it does not jitter on every word; scrolling by hand pauses the follow for a few seconds, and the toggle turns it off entirely.
- **Background narration and the lock screen**: while reading aloud, the Media Session API publishes the book, chapter and cover, with play/pause and seek handlers, so the lock screen and headphone controls work. A generated near-silent WAV loops underneath the speech to keep the tab marked as playing media, the screen wake lock is held while it speaks, and returning to the tab re-syncs the highlight and restarts the voice if the browser suspended it. The app is also a PWA (`app/manifest.ts`, `public/sw.js`, icons), so it can be installed to a home screen and treated as a media app.
- **Smart Summary**: open the Summary panel from the reader's header, or the sparkle button on a book card. It has a "Whole book" tab and one tab per chapter. Long chapters are sampled evenly from start to end. Whole-book summaries are built from the chapter summaries. Results are cached per book in IndexedDB, and you can copy, download as Markdown, or regenerate them. With `ANTHROPIC_API_KEY` set the summary is written by Claude and labelled **AI Summary**. Without a key it uses an offline extractive summary labelled **Offline summary**.
- **Background and cursor**: a 3D field of wireframe books flies behind the pages. Seven shapes (hardcover, paperback, tome, square format, open book, scroll, and a stack of three) travel on their own headings, wrap from one edge of the frame to the other, tumble as they go, and fade back with distance. The cursor shoves nearby books aside on a spring and makes them tumble faster; a click sends a shockwave that throws them outwards and flashes them magenta. A violet ring follows the cursor, stretches along the direction of travel, grows over links and buttons, and a click drops a ripple with a slower echo behind it. Both are off under `prefers-reduced-motion` (the scene keeps one still frame), on touch screens, and on the reader page, which stays still. The scene also pauses when its tab is hidden. The shapes live in `lib/scene/books.ts` and the motion in `lib/scene/field.ts`, both free of the DOM so they can be tested without a browser.
- **Voice Studio**: consent, a six-passage guided script (at least 1 minute, up to 3 minutes), a live level meter while recording, playback before you keep a take, and a read-aloud check. The check uses the browser's speech recognition, so it works in Chrome and Edge. Where recognition is unavailable the profile stays unverified. Samples and the voice profile are stored in IndexedDB under the signed-in profile, so one person's recordings are invisible to another profile on the same browser; "Delete my voice data" removes only that profile's.

Everything runs in the browser for now. Profiles, books, covers, highlights, notes and bookmarks are stored in IndexedDB (database version 7, with a `profileId` index on `meta`), the active profile in `sessionStorage`, and the theme, reader preferences, narration speed and per-profile progress in localStorage. There is no server and no authentication: nothing leaves the device, nothing is shared between devices, and OCR runs locally. Cross-device progress sync would need the PRD's Supabase backend, which is not wired in yet. Built-in voices need no profile. Narrating in a cloned voice of your own still needs a voice provider (for example ElevenLabs) and a server route that keeps its API key private. The provider is an interface in `lib/voice/provider.ts` and is not connected yet. Export comes in a later milestone.

## Getting started

```bash
npm install        # also copies the PDF.js worker and the OCR engine into public/
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run check      # scene, storage, theme, voices, PDF and scan parsing, covers, narration and reader markup
```

`npm run check` runs the parts of the app that do not need a browser: the book field's motion and shapes, profile and per-profile library storage against a fake IndexedDB (`fake-indexeddb`), the theme wiring in a real DOM (`jsdom`), the device voices, the real PDF parser, a real scanned PDF read back with Tesseract, cover validation and palette choice, the narration text model and engine (against a fake speech synthesiser), and the reader's word and page markup (rendered with React's server renderer and parsed with `jsdom`). Run them one at a time with `check:scene`, `check:profiles`, `check:theme`, `check:voices`, `check:pdf`, `check:scan`, `check:covers`, `check:audio`, `check:engine` and `check:reader`.

`check:scan` runs a JPEG page wrapped into a real image-only PDF through PDF.js and then through the same Tesseract model the app ships, so the scanned-book path is exercised with no browser in the loop.

The OCR engine is about 30 MB and is not committed: `scripts/copy-ocr-assets.mjs` copies the worker, the WebAssembly cores and the English model from `node_modules` into `public/ocr`, and that folder is gitignored, exactly like the PDF.js worker.

## Smart Summary configuration

Set these in the server environment (for example `.env.local`). The key is only read on the server, in `app/api/summarize/route.ts`, and is never sent to the browser.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Turns on AI summaries. Without it, `/api/summarize` returns 503 and the app uses the offline summary. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Model used for summaries. Any Messages API model ID works. |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | API base URL. Used for testing against a mock server. |

Text sent to Claude is capped at 60,000 characters per request. Chapters are sampled to 12,000 characters and the whole-book input to 40,000. Books with more than 40 chapters are summarised from 40 evenly spaced chapters.

## Notes

- Fonts load from Google Fonts in the browser. Without network access the UI falls back to system serif and sans fonts.
- Scanned PDFs are read with OCR in English only. Other languages need another traineddata file in `public/ocr/tessdata` and a matching `langs` argument in `lib/ocr.ts`.
- OCR is slow on long scans (roughly a second per page on a desktop, more on a phone). The import shows the page it is on and can be cancelled; pages that already have text are never sent to OCR.
- Background narration is a best effort: browsers tie speech synthesis to the page, and iOS is stricter than Android. The silent-audio keeper, Media Session metadata and returning-tab resync are what keep it alive; a real MP3 voice (a server-side TTS provider) is the long-term fix.
- Voice verification uses speech recognition, which sends audio to the browser vendor's speech service. Check that this is acceptable before launch.
- The consent wording in `lib/voice/script.ts` is a draft and should be reviewed before real users record their voice.
- Highlights are limited to one paragraph. Overlapping highlights are shown with the earlier one winning.
