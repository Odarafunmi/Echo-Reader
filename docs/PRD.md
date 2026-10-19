# Echo Shelf: Product Requirements Document

> *Your books. Your way. Read in your own voice.*

---

## 1. Overview

**Echo Shelf** is a web-based ebook reader where you upload your own books and documents, read them in a layout you control, and listen to them narrated in **your own cloned voice**. It also summarises chapters on demand and keeps your notes beside the text.

**Platform:** Website only (responsive, no native app), light backend.

## 2. The Problem

- Reading apps are rigid: you get one look, one robotic voice, and no real help digesting long material.
- Text-to-speech voices are impersonal and tiring to listen to.
- Students and busy professionals skim books they should study, and their notes end up scattered across apps.

## 3. Target Users

| User | What they need |
|---|---|
| Students and researchers | Fast summaries, chapter notes, listening while commuting |
| Busy professionals | Absorb books in less time, by ear or by summary |
| Personal-voice lovers | Hear books in their own voice (or a loved one's, with consent) |

## 4. Core Features (10)

| # | Feature | What it does |
|---|---|---|
| 1 | **Library Upload** | Upload PDF, EPUB, DOCX or TXT. Books sit on a personal shelf with cover, title and progress bar. |
| 2 | **Custom Reader** | Adjust font, size, spacing, margins, themes (light, dark, sepia, custom) and single or double page view. |
| 3 | **Voice Studio** | Record or upload a short voice sample (about 1 to 3 minutes, guided by a script) to create your voice profile. |
| 4 | **Voice Narration** | Press play and the book is read aloud in your cloned voice. Includes speed control, skip back/forward 15s, and sentence-by-sentence text highlighting. |
| 5 | **Smart Summary** | Tick the Summary option. Long books get chapter-by-chapter summaries; short documents get one overall summary. |
| 6 | **Notes Panel** | A side panel for notes tied to a page or chapter. Search, edit and export them. |
| 7 | **Highlights and Bookmarks** | Highlight text in colours and bookmark pages. Highlights can be sent straight to Notes. |
| 8 | **Reading Progress Sync** | Resume exactly where you stopped, in text or audio, on any device. |
| 9 | **Chapter Navigator** | Auto-detected chapter list for jumping around, with summary and audio buttons per chapter. |
| 10 | **Export Hub** | Download summaries and notes as PDF, DOCX or Markdown. |

## 5. Key User Flow

1. Sign up and open the shelf.
2. Upload a book. The app detects chapters.
3. Open it in the reader and style it your way.
4. Record a voice sample once in Voice Studio.
5. Press play to listen, tick Summary for the gist, and jot notes along the way.

## 6. Recommended Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js, Tailwind CSS |
| Backend, auth, database, file storage | Supabase |
| Document parsing | PDF.js, EPUB.js, Mammoth (DOCX) |
| Voice cloning and narration | A voice-cloning TTS API (e.g. ElevenLabs or similar) |
| Summaries | Claude API |
| Hosting | Vercel |

## 7. Risks and Guardrails

- **Voice consent:** Users may only clone their own voice or one they have permission to use. Add a consent checkbox and a verification read-aloud step.
- **Audio cost:** Voice generation is the most expensive part. Generate per chapter, cache the audio, and set free-tier limits.
- **PDF quality:** Scanned PDFs need OCR and messy layouts may break chapter detection. Offer manual chapter marking as a fallback.
- **Copyright:** Uploads are private to the user. Nothing is shared or public.

## 8. Success Metrics

- Voice profiles created per signup
- Books uploaded per user
- Share of readers who use audio or summaries at least once a week
- Notes created per book

## 9. Out of Scope (v1)

Native mobile apps, a public book store, social sharing, and multi-voice character narration.

## 10. MVP Build Order

1. Upload, shelf and custom reader
2. Notes, highlights and progress sync
3. Smart Summary
4. Voice Studio and narration (the heaviest lift, so build it once the reader is stable)
5. Export Hub and polish
