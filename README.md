# Echo Shelf (Echo-Reader)

A web-based ebook reader. Upload your own books and read them in a layout you control.
This repo currently implements **MVP steps 1 and 2**, plus the sampling part of step 4 and the summary part of step 5, from the PRD: library upload, shelf, custom reader, notes, highlights, bookmarks, Voice Studio sampling, and Smart Summary.

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Visual system: [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md)

## Features in this build

- **Profiles**: create a profile at `/signup`, and sign in at `/signin` (`/login` is an alias that redirects there, keeping `?next=`). There is no authentication: no password is asked for, hashed or stored, and nothing is sent anywhere. A profile is a name (and an optional email as a label) kept in this browser, so signing in means picking one of the profiles already on this device, and you can switch between them from the top bar without leaving the page. Anyone using the browser can switch profiles, and clearing site data removes them. If accounts that work on more than one device are wanted later, `lib/profile/useProfile.tsx` is the one module that would grow a real backend.
- **Dark and light themes**: the sun and moon button in the top bar switches the whole app. The choice is saved to localStorage and IndexedDB, and an inline script in `app/layout.tsx` applies it before the first paint so there is no flash. Until you choose, the system preference decides, and the app keeps following it if you change it at the OS level. Only the semantic colour tokens change, so every surface follows, including the wireframe book field, which darkens its violet to stay visible on a pale ground.
- **Library upload**: PDF, EPUB, DOCX, TXT and MD. Chapters are detected from PDF outlines, EPUB spine, or heading patterns such as "Chapter 1". Long texts without headings are split into parts.
- **Shelf**: cover tiles with format tags, progress bars and a "Continue reading" row.
- **Custom reader**: Literata, Inter, Georgia or OpenDyslexic; text size; line spacing; margins; Midnight, Paper, Sepia, Violet Dusk or custom colours; single or double page view; chapter navigator; keyboard arrows for previous and next chapter.
- **Progress**: saved per book as you scroll and restored on return (this device only).
- **Highlights**: select text within one paragraph and pick amber, magenta or cyan. Click a highlight to change its colour, add a note, or delete it.
- **Notes**: a side panel with Notes, Highlights and Bookmarks tabs, search, quick notes, and notes pinned to the quote they came from.
- **Bookmarks**: the bookmark button saves the current spot. It toggles off when pressed again.
- **Notes page**: the top-bar Notes tab lists every note, highlight and bookmark across the library, grouped by book, with search. Open jumps back to the spot in the book. Delete works here too.
- **Built-in voices**: a masculine and a feminine narration voice, chosen in Voice Studio with a preview for each. They use the speech voices already installed on your device, so nothing is downloaded or sent to a server, and no key is needed. To hear a deeper voice, install one at the OS level (for example Daniel on macOS, or David or Mark on Windows) and restart the browser. The browser does not report gender, so each option matches a known voice name. When the device has no matching voice, that option uses the default voice with a higher or lower pitch.
- **Read aloud**: the reader's speaker button reads the current chapter with the voice you chose, one paragraph at a time, and follows along. It stops when you change chapter or press it again. It needs a browser with speech synthesis, such as Chrome, Edge and Safari.
- **Smart Summary**: open the Summary panel from the reader's header, or the sparkle button on a book card. It has a "Whole book" tab and one tab per chapter. Long chapters are sampled evenly from start to end. Whole-book summaries are built from the chapter summaries. Results are cached per book in IndexedDB, and you can copy, download as Markdown, or regenerate them. With `ANTHROPIC_API_KEY` set the summary is written by Claude and labelled **AI Summary**. Without a key it uses an offline extractive summary labelled **Offline summary**.
- **Background and cursor**: a 3D field of wireframe books flies behind the pages. Seven shapes (hardcover, paperback, tome, square format, open book, scroll, and a stack of three) travel on their own headings, wrap from one edge of the frame to the other, tumble as they go, and fade back with distance. The cursor shoves nearby books aside on a spring and makes them tumble faster; a click sends a shockwave that throws them outwards and flashes them magenta. A violet ring follows the cursor, stretches along the direction of travel, grows over links and buttons, and a click drops a ripple with a slower echo behind it. Both are off under `prefers-reduced-motion` (the scene keeps one still frame), on touch screens, and on the reader page, which stays still. The scene also pauses when its tab is hidden. The shapes live in `lib/scene/books.ts` and the motion in `lib/scene/field.ts`, both free of the DOM so they can be tested without a browser.
- **Voice Studio**: consent, a six-passage guided script (at least 1 minute, up to 3 minutes), a live level meter while recording, playback before you keep a take, and a read-aloud check. The check uses the browser's speech recognition, so it works in Chrome and Edge. Where recognition is unavailable the profile stays unverified. Samples and the profile are stored in IndexedDB, and "Delete my voice data" removes them.

Everything runs in the browser for now. Profiles, books, highlights, notes and bookmarks are stored in IndexedDB, and the chosen profile, theme, preferences and progress in localStorage. There is no server and no authentication: nothing leaves the device, and nothing is shared between devices. Cross-device progress sync would need the PRD's Supabase backend, which is not wired in yet. Built-in voices need no profile. Narrating in a cloned voice of your own still needs a voice provider (for example ElevenLabs) and a server route that keeps its API key private. The provider is an interface in `lib/voice/provider.ts` and is not connected yet. Export comes in a later milestone.

## Getting started

```bash
npm install        # also copies the PDF.js worker into public/
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run check      # background scene, profile storage, and theme wiring
```

`npm run check` runs the parts of the app that do not need a browser: the book field's motion and shapes, the profile and settings storage against a fake IndexedDB (`fake-indexeddb`), and the theme wiring in a real DOM (`jsdom`). Run them one at a time with `check:scene`, `check:profiles` and `check:theme`.

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
- Scanned PDFs (images only) are not supported yet. OCR is a later milestone.
- Voice verification uses speech recognition, which sends audio to the browser vendor's speech service. Check that this is acceptable before launch.
- The consent wording in `lib/voice/script.ts` is a draft and should be reviewed before real users record their voice.
- Highlights are limited to one paragraph. Overlapping highlights are shown with the earlier one winning.
