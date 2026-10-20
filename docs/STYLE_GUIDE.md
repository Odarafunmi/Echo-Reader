# Echo Shelf: Style Guide

> Dark, cinematic, calm. A reading room at night with a violet glow.

Reference: a dark book-reading app UI with glowing accents, soft cards, pill navigation and a bold editorial serif. The orange is replaced here with **black and purple**.

---

## 1. Design Principles

1. **Dark first.** Black surfaces keep the focus on the book and make the purple glow.
2. **One glow, used sparingly.** Purple marks the one thing that matters on screen (Play, active tab, progress).
3. **Soft and layered.** Rounded cards, gentle borders, depth through subtle gradients rather than heavy shadows.
4. **Editorial warmth.** An elegant serif for headlines against a clean sans for the interface.
5. **Motion with purpose.** Every animation confirms an action or guides the eye. Nothing moves just to move.

---

## 2. Colour Palette

### Core

| Role | Name | Hex |
|---|---|---|
| Background | Ink Black | `#0A0A0F` |
| Surface (cards) | Night Card | `#14141C` |
| Surface raised (modals, player) | Deep Slate | `#1C1C28` |
| Border / divider | Faint Line | `#2A2A3A` |
| **Primary accent** | **Electric Violet** | `#8B5CF6` |
| Primary hover / pressed | Royal Purple | `#7C3AED` |
| Soft accent (tags, tints) | Lavender Mist | `#C4B5FD` |
| Glow | Violet Glow | `rgba(139, 92, 246, 0.35)` |

### Supporting accents

| Role | Name | Hex | Use |
|---|---|---|---|
| Highlight A | Magenta Pink | `#E879F9` | Gradient partner, notes |
| Highlight B | Cyan Mist | `#22D3EE` | Summary badges, info |
| Highlight C | Warm Amber | `#FBBF24` | Ratings, bookmarks, text highlights |
| Success | Mint | `#34D399` | Completed chapters |
| Error | Rose | `#FB7185` | Errors, delete |

### Text

| Role | Hex |
|---|---|
| Primary text | `#F5F5FA` |
| Secondary text | `#A1A1B5` |
| Muted / disabled | `#6B6B80` |

### Signature gradients

- **Hero glow:** `linear-gradient(135deg, #8B5CF6 0%, #E879F9 100%)`
- **Card sheen:** `linear-gradient(160deg, #1C1C28 0%, #14141C 100%)`
- **Page ambience:** a large blurred radial of `#8B5CF6` at 12% opacity behind hero areas, fading into Ink Black.

### Reader themes (inside the reading view)

| Theme | Background | Text |
|---|---|---|
| Midnight (default) | `#0A0A0F` | `#E4E4EE` |
| Paper | `#F6F1E7` | `#2B2B33` |
| Sepia | `#EADFC8` | `#3B2F20` |
| Violet Dusk | `#17112B` | `#DDD6FE` |

---

## 3. Typography

| Use | Font | Weight | Notes |
|---|---|---|---|
| Display / headlines | **Fraunces** (or Playfair Display) | 600 to 700 | Elegant italic accents for hero words |
| Interface and body | **Inter** (or Plus Jakarta Sans) | 400 / 500 / 600 | Clean, highly legible |
| Reader text | User-selectable | 400 | Defaults: Literata, Inter, Georgia, OpenDyslexic |

### Scale

| Token | Size / line height |
|---|---|
| Display | 48 / 56 |
| H1 | 32 / 40 |
| H2 | 24 / 32 |
| H3 | 18 / 26 |
| Body | 16 / 26 |
| Caption | 13 / 18 |

---

## 4. Shape, Spacing and Depth

- **Spacing grid:** 4px base (4, 8, 12, 16, 24, 32, 48).
- **Radius:** cards 20px, buttons and pills fully rounded (999px), inputs 14px, book covers 12px.
- **Borders:** 1px `#2A2A3A`. On hover, the border shifts to a 40% violet.
- **Shadows:** keep them soft and dark, plus a violet glow only on primary elements (`0 8px 30px rgba(139,92,246,0.35)`).
- **Glass panels:** for the audio player and modals, use `rgba(20,20,28,0.7)` with `backdrop-filter: blur(20px)`.

---

## 5. Components

**Navigation**
- Top pill tabs (For You, Browse, My Library). Active tab is solid Electric Violet with white text. Inactive tabs are ghost pills.
- On mobile, a floating bottom bar with Home, Search, Library, Notes and Profile. The active icon glows violet.

**Book card (Continue Reading)**
- Cover, title and a thin violet progress bar with a percentage.
- A cover is always a real image, never a gradient placeholder. It is the PDF's first page when that page has content; otherwise a solid title cover (below).

**Covers (solid colour palette)**
- Eight deep colours, all dark enough for white text at 7:1 or better: Midnight Navy `#1E3A5F`, Wine `#5B2333`, Forest `#21503F`, Indigo `#3A2A66`, Chestnut `#6B3F1F`, Deep Teal `#0F5257`, Plum `#4B2142`, Slate `#2F3E4E`.
- A custom cover is flat colour, a hairline inset frame, the title in bold Fraunces (white, centred, up to six lines), the author beneath in italic Georgia, and a small letterspaced "ECHO SHELF" at the foot. No gradients.
- Colour choice balances the shelf: a new book takes the palette colour used least often, so five uploads look like five different books.

**Buttons**
- Primary: violet gradient, white text, pill shape, violet glow.
- Secondary: ghost pill with a faint border.
- Icon buttons: 44px circles on Night Card.

**Audio player (the signature component)**
- Floating glass bar, pinned above the bottom safe area. Large violet Play/Pause with a true play and pause icon, back 10s and forward 10s, a draggable position line with a glowing knob, elapsed and total time, a 1×/1.25×/1.5×/2× speed menu, a follow-the-voice toggle, and a close button.
- On a phone it stays one compact row above the text and never wider than the screen.

**Chapter list**
- Rows with a status icon (mint check for done, lock or dot for upcoming), chapter title and duration. Each row has two small buttons: Summary (cyan) and Listen (violet).

**Summary panel**
- Slides in from the right. Chapter tabs on top, summary text with a cyan "AI Summary" badge, and a copy and export action.

**Notes panel**
- Side drawer with note cards tagged by page. Magenta accent for notes, amber for highlights.

**Reader page breaks**
- Inside a PDF chapter, each change of source page gets a quiet divider: a 1px hairline at 14% of the text colour either side of a small uppercase "Page 3" label at 42%. Nothing heavier; the text stays the loudest thing on the screen.

**Floating chapter arrows**
- 46px circles (40px on desktop) fixed at mid-height, 1px border, glass fill, 55% opacity that goes to 100% on hover or focus. Hidden entirely at the first and last chapter.

**Voice Studio**
- A centred record button with a pulsing violet ring, a live waveform while recording, and a guided script to read aloud.

---

## 6. Animations

Principle: **subtle, smooth, professional.** Fast enough to feel responsive, slow enough to feel polished.

### Timing tokens

| Token | Value |
|---|---|
| Fast | 150ms |
| Base | 250 to 300ms |
| Slow | 500 to 600ms |
| Easing (default) | `cubic-bezier(0.22, 1, 0.36, 1)` (soft ease-out) |
| Easing (springy) | `cubic-bezier(0.34, 1.56, 0.64, 1)` (use sparingly) |

### Animation list

| Where | Effect |
|---|---|
| **Page load** | Cards fade up 16px with a 60ms stagger. Hero glow fades in over 600ms. |
| **Ambient background** | Two blurred violet blobs drift slowly (20s loop, very low opacity). |
| **Book cards** | On hover, lift 6px, scale 1.02, border turns violet and a soft glow appears. |
| **Play button** | Gentle breathing glow (3s loop) while idle. On press, scales to 0.94. |
| **Audio playing** | A waveform of thin violet bars moves in time with the audio. |
| **Text sync (narration)** | The exact word being spoken gets a soft amber background at 30% (`rgb(251 191 36 / .3)`) with a 1px amber halo and 3px rounding; it moves word by word and only one word carries it. |
| **Tabs and pills** | The active pill background slides between tabs instead of jumping. |
| **Progress bars and rings** | Animate from 0 to value on first view (700ms ease-out). |
| **Panels (Summary, Notes)** | Slide in from the right with a fade and a blurred backdrop. |
| **Page turn (reader)** | A soft horizontal slide with a slight fade (no skeuomorphic curl). |
| **Buttons** | Press scales down to 0.97, release returns smoothly. |
| **Toasts** | Slide up from the bottom with a gentle spring and auto-dismiss. |

### Rules

- Respect `prefers-reduced-motion`: turn off parallax, drifting blobs and tilt, and keep only simple fades.
- Animate `transform` and `opacity` only, for 60fps performance.
- Never animate while the user is actively reading body text, other than the narration highlight.
- One attention-grabbing animation per screen at most.

---

## 7. Implementation Notes (Next.js, Tailwind)

- **Animation library:** Framer Motion for layout, stagger and shared-element transitions. CSS keyframes for the ambient glow and breathing Play button.
- **Icons:** Lucide, 1.75px stroke, rounded caps.
- **Accessibility:** keep text contrast at WCAG AA or better (Electric Violet on Ink Black passes for large text and UI elements; use Lavender Mist for small violet text).
- **Mobile:** the layout must fit a 320px screen with no horizontal scrolling. The three top tabs stay on one line (short labels below `sm`, `flex-1`, `whitespace-nowrap`), the sign-in card is a 400px maximum fluid column, and fixed-width panels use `min(…, 100%)`.

---

## 8. Quick Do and Don't

| Do | Don't |
|---|---|
| Use violet for the single most important action | Colour everything purple |
| Keep surfaces near-black with soft borders | Use pure `#000` cards on pure `#000` background |
| Pair a serif headline with a clean sans UI | Mix more than two typefaces |
| Let motion confirm actions | Add looping animations near reading text |
