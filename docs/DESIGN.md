# Munder Difflin — Landing Site Design System

> Source of truth for `docs/index.html` (the marketing site at **munderdiffl.in**).
> This is **not** the app design system — see the root `DESIGN.md` for the Electron app.
>
> **Direction:** light, warm-paper, monospace, lightly **neo-brutalist** — in the lineage of
> [cubicle.run](https://cubicle.run): a cream/white canvas, near-black ink, square corners,
> thick black borders, and hard offset shadows. JetBrains Mono carries the type. Playful
> pastel color-blocks accent the feature cards; one warm **yellow** drives every CTA.
>
> We keep Munder Difflin's own identity inside this system: the **maroon brand mark**, the
> name, the *Office* parody, the **GOD / hive / MemPalace** story, and the real captured
> product footage. "Munder Difflin is a paper company," so the cream-paper canvas is on-theme.
>
> **History:** this replaces the previous *dark, flat, rounded* system. That direction
> ("no offset shadows, no square corners, dark canvas") is fully retired.

---

## 1. Design principles

1. **Paper, not panels.** A warm light canvas (cream + white). Depth comes from **hard offset
   shadows** (`6–10px 0`, no blur) and **thick ink borders** — not from soft elevation.
2. **Square, not rounded.** `border-radius: 0` everywhere. Crisp corners are the look.
3. **Mono-forward.** JetBrains Mono for headings, labels, UI, metrics, and most chrome; Geist
   (sans) for paragraph body. Big headings run tight (`-0.03em`).
4. **One accent, plus play.** Warm **yellow** is the single CTA color; **sky-blue** highlights
   one phrase per headline; **maroon** is the brand/identity tone. Feature cards each get a
   soft **pastel** block (lilac / peach / mint / tan / rose / sky-soft).
5. **Product-led.** The hero *shows the product* through real captured footage, seated inside a
   flat, hairline-bordered window. The "How" section uses hand-built static HTML/CSS/SVG
   illustrations (the floor graph, MemPalace radial recall, GOD + hive graph) drawn in the
   warm-paper / neo-brutalist theme — ink-bordered node chips, pastel blocks, mono labels — not video.
6. **Restraint in motion.** Reveal-on-scroll + a neo-brutalist press on hover (translate +
   shadow grow). On-screen-only video playback. All disabled under `prefers-reduced-motion`.

---

## 2. Color

Warm paper canvas, near-black ink (text **and** borders share it), one warm accent, and a
small playful pastel set for feature blocks.

```css
:root {
  /* canvas & surfaces — warm paper */
  --paper:    #FFFDF7;   /* body */
  --cream:    #F5F2E8;   /* primary section band */
  --cream-2:  #F5ECD7;   /* alt band */
  --white:    #FFFFFF;   /* card / window bodies */
  --ink-band: #1B1B1B;   /* dark final-CTA band + window title bars */

  /* ink (text + borders) */
  --ink:       #1B1B1B;
  --ink-dim:   #57544C;  /* body / secondary */
  --ink-faint: #8A867A;  /* eyebrows, meta, captions */

  /* accents */
  --yellow: #FFCA54;     /* the only CTA fill (≈ MD's old gold) */
  --sky:    #72C2DF;     /* one highlighted phrase per headline; alt CTA */
  --maroon: #B23A4E;     /* MD identity — brand mark, link hover, rare emphasis */
  --maroon-deep: #6E1423;

  /* pastel feature tints (one per card) */
  --lilac: #E4DEFB;  --peach: #FBDDBE;  --mint: #D6F3E1;
  --tan:   #F1E6CC;  --rose:  #FBE0DF;  --sky-soft: #DCEFF7;
}
```

### Usage rules

| Token | Use for |
|---|---|
| `--paper` | Body + hero background. |
| `--cream` / `--cream-2` | Alternating section bands (`.band` / `.band-2`). |
| `--white` | Card and window bodies. |
| `--ink` | All text on light, **and all borders**, and dark-band/title-bar fills. |
| `--yellow` | Primary CTA fill only. Never a large flat background. |
| `--sky` | Exactly one highlighted phrase per headline; alt CTA on the dark band. **Large text only** (low contrast at body size). |
| `--maroon` | Brand mark, link hover, one emphasized noun (e.g. "GOD orchestrator"). |
| pastels | Feature-card / problem-card / how-panel blocks — one tint each, rotated. |

### Ambient texture

- **Dotted paper grid:** `radial-gradient(--ink-faint 1px, transparent 1px)` at ~22px, ~10%
  opacity, radially masked — behind the hero. The dark final-CTA band uses the same dots in
  white at ~12%.

---

## 3. Typography

Monospace for everything structural; a clean sans only for running body copy.

```css
--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
--font-sans: "Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Loaded from Google Fonts: **Geist** (400/500/600) and **JetBrains Mono** (400/500/600/700).
Inter is fallback only.

| Role | Family | Size (clamp) | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Hero H1 | mono | `clamp(38px, 6.2vw, 68px)` | 600 | −0.04em | line-height 1.02 |
| Section H2 | mono | `clamp(28px, 4vw, 46px)` | 600 | −0.03em | line-height 1.08 |
| Final-CTA H2 | mono | `clamp(30px, 5vw, 56px)` | 600 | −0.03em | on dark band |
| Card / feature H3 | mono | 17–24px | 600 | −0.01em | |
| Eyebrow | mono | 11px | 500 | **0.28em**, UPPERCASE | `--ink-faint`, leading `—` |
| Numbered label | mono | 12px | 500 | 0.12em | `01 / THE SIMULATION` |
| Lead / intro | sans | `clamp(16px, 2vw, 19px)` | 400 | normal | `--ink-dim`, ~64ch |
| Body | sans | 14.5–15px | 400 | normal | `--ink-dim` |
| Button | mono | 13–14px | 700 | normal | |
| Terminal / code | mono | 13–14px | 400 | normal | on `--ink-band` |
| Wordmark | mono | 13px | 700 | 0.02em | "MUNDER DIFFLIN" |

**Emphasis:** in the big "What" statement, key nouns use `--ink` (bold), `--sky` (hive mind,
long-term memory) and `--maroon` (GOD orchestrator).

---

## 4. Spacing, radius, depth

- **Section padding:** `84px` block desktop, `60px` ≤480px.
- **Card padding:** `26–32px`.
- **Radius:** `0` everywhere. No exceptions (this is the look).
- **Borders:** `--border: 2px solid --ink`; `--border-bold: 3px solid --ink` (cards, windows).

### Depth — hard offset shadows (no blur)

```css
--shadow-card:    10px 10px 0 var(--ink);   /* feature cards, windows */
--shadow-card-sm:  6px 6px 0 var(--ink);    /* problem cards, integrations grid */
--shadow-btn:      4px 4px 0 var(--ink);    /* buttons */
--shadow-chip:     3px 3px 0 var(--ink);    /* chips, patrons, sm buttons */
```

**Hover (press):** `transform: translate(-2px,-2px)` (or −3px for cards) and the shadow grows
one step. `:active` collapses it (`2px`). Gives a tactile "physical button" press.

---

## 5. Components

### Buttons
- **Primary:** `--yellow` fill, `2px solid --ink`, `--ink` text, mono 700, `--shadow-btn`, press-on-hover. Square.
- **Ghost:** `--white` fill, same border/shadow.
- **Sky:** `--sky` fill — used on the dark final-CTA band as the secondary action.
- **`.sm`** for nav (smaller padding, `--shadow-chip`).

### Cards
- `--white` (or a pastel tint), `--border-bold`, square, `--shadow-card-sm`, press-on-hover.
- **Problem cards (Why):** pastel block + square icon tile + mono H3 + body.

### Feature card (How)
- One flat, hairline-bordered (`1px rgba(27,27,27,.16)`), rounded (`16px`) card split 2-up: a
  **pastel media panel** (`.feat-media`, tints `sky-soft / lilac / peach`) holding a hand-built
  `.ill` illustration inside a flat `.win`, and a white `.feat-text` panel with a **numbered
  label**, mono H3, body, and dark tag chips. Alternates side (`.flip`). Stacks to 1 column < 900px.

### Window / media frame (`.win`)
- `--white` body, **flat**: `1px solid rgba(27,27,27,.16)`, `border-radius: 12px`, no offset
  shadow. Title bar is **dark** (`--ink-band`) with white mono title, three square dots, optional
  `● live` / metric status.
- The hero uses a `.media-frame` aspect-ratio box (`1600/966`) with captured footage
  (`object-fit: cover`). The "How" windows hold `.ill` illustrations (`16/11`) instead — see §6.

### Chips / tags / badges
- **Hero chip:** white, `--border`, mono uppercase, `--shadow-chip`.
- **Tags (How):** **dark** `--ink` fill, white mono UPPERCASE — the metadata style.
- **Integrations grid:** 5-up tiles separated by 2px ink gaps (grid lines), white cells.

### Terminal block (`.term`)
- `--ink-band` bg, `--border`, mono. Tokens: prompt/path → `--sky`, command → `--yellow`,
  comment → muted, success → green.

---

## 6. "How it works" — hand-built illustrations

The **hero** uses captured `webm`/`mp4` footage (`muted loop playsinline`, poster SVG, plays
only while on screen via `IntersectionObserver`; nothing autoplays under
`prefers-reduced-motion`). The **three "How" feature cards no longer use video** — each holds a
hand-built static HTML/CSS/SVG illustration (`.ill`, `16/11`) inside a flat `.win`, drawn in the
warm-paper / neo-brutalist theme so it reads as finished product art.

| Slot | Illustration | Panel tint | Accent |
|---|---|---|---|
| Hero — the floor | captured footage `media/hero.webm` (1600×966) | — (live badge) | — |
| 01 The Simulation | desk-grid floor: ink-bordered agent node chips (`.nodet`), SVG `.edge` links, an animated `✉️` traveling desk→desk | `--sky-soft` | `--sky` status dots |
| 02 The Memory — MemPalace | radial recall: central maroon `.mem-core`, six `.mem-chip` memories on SVG `.mem-edge` spokes, matched ones highlighted (`.hit`, `--lilac` + maroon edge) | `--lilac` | `--maroon` |
| 03 The Orchestration — GOD + hive | node graph: a `GOD · you` node routing to research/build/review along edges with flowing maroon `.flow-dot`s, plus an `.ap` approvals card (`approve`/`hold`) | `--peach` | `--yellow` GOD, `--mint` approve |

**Illustration primitives:** `.nodet` (ink-bordered mono node chip + colored `.av` swatch +
status dot), `.mem-core` / `.mem-chip` (palace + memory tiles), `.ap` (approvals card), `.lbl`
(mono caption), and SVG `.edge` / `.mem-edge` connectors. Motion is one or two looping CSS
`offset-path` flows (the envelope, the GOD flow dots), all disabled under
`prefers-reduced-motion`. No external images, no video weight — the whole section is pure markup.

The retired `media/how-*.{webm,mp4}` footage stays on disk but is no longer referenced.

---

## 7. Layout & sections (order)

`nav → hero → why → what → how → claude → open source → install → support → final CTA → footer`

- **Nav:** sticky, `--paper`, transparent → 2px ink bottom-border on scroll. Maroon square `MD`
  mark + mono wordmark left; mono links center (hidden < 880px); ghost `★ Star` + yellow
  `⤓ Download` right.
- **Hero:** centered chip + mono H1 (**"Local Multi-Agent Harness"**, one word in sky) + lead +
  CTA row + trust line, then the `hero.webm` window directly below the CTA, over a dotted paper grid.
- **Bands:** alternate `--paper` / `--cream` / `--cream-2`, each separated by 2px ink borders.
- **Claude:** an **integrations grid** (Claude Code · MCP · Skills · Hooks · Your plan) + two eco cards (one with the remote-control terminal).
- **Final CTA (dark):** full-width `--ink-band` band with white dotted texture, big mono headline
  (sky highlight), yellow + sky CTAs.
- **Grids:** 3-up (why), 2-up (claude, support), 5-up (integrations); collapse < 820/720px.

---

## 8. Responsive

- Container `--maxw` 1200px, `--pad-x` 24px (16px < 480px).
- Breakpoints: `900px` (feature cards → 1 col, media on top), `880px` (nav links + ghost hide),
  `820px` (3-/2-up → 1 col), `720px` (integrations → 2 col), `480px` (type steps down via clamp).
- All media/windows `max-width: 100%`; grid/flex children `min-width: 0` to prevent overflow.

---

## 9. Accessibility & quality bar

- `--ink` on `--paper`/`--cream` is near-maximal contrast. `--ink-dim` body passes ≥ 4.5:1.
- Yellow CTA uses `--ink` text → AAA on yellow.
- **Sky-blue only on large display text** (headline words), never body — it's low-contrast at small sizes.
- `:focus-visible`: 2px `--ink` square outline, 2px offset, on all interactive elements.
- `prefers-reduced-motion`: disables reveals, hover-press transforms, video autoplay, live-dot pulse.
- Single `<h1>`; logical heading order; decorative SVG/textures are non-semantic.

---

## 10. SEO / meta

Title, description, canonical (`https://munderdiffl.in/`), favicon (`./logo.png`),
Open Graph + Twitter card (`og:image` → `./media/og.png`), `theme-color` `#F5F2E8`.
CNAME → `munderdiffl.in`.

---

## 11. Asset inventory

| Asset | Path | Status |
|---|---|---|
| Logo | `./logo.png` | Favicon, nav, footer, README, app chrome. |
| Social banner | `./banner.png` | Wide maroon lockup + tagline (GitHub/social headers). |
| Open Graph / previews | `./media/og.png` | `og:image`, Twitter card, hero `<video poster>`, README demo poster. |
| Hero footage | `./media/hero.{webm,mp4}` | **Used** — hero only. `webm` first, `mp4` fallback; on-screen-only. |
| "How" footage | `./media/how-*.{webm,mp4}` | **Retired** — replaced by hand-built `.ill` illustrations; kept on disk, unreferenced. |
| Footage posters | `./media/*-poster.svg` | Legacy placeholders; hero/README use `og.png` instead. |

---

## 12. Lineage note

The visual language is intentionally close to **cubicle.run** (a product in the same space).
Differentiation is carried by: the **maroon** brand tone + `MD` mark, the **GOD / hive /
MemPalace** narrative, MD's own copy, the real pixel-office hero footage, and the hand-built
"How" illustrations. Do not copy cubicle's section wording or exact palette values verbatim.

---

*Last updated: 2026-06-01. Owner: Munder Difflin / Chaitanya Giri.*
