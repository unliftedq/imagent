# Imagine Studio — Design System

> **Version:** 0.2 (Quiet-Density rewrite)
> **Status:** authoritative for the desktop app under `apps/desktop`. Supersedes the prior "Clay" cream/claymation system in full.
> **Audience:** anyone implementing or reviewing UI in `packages/ui` or `apps/desktop`.

---

## 1. Design Philosophy

Imagine Studio is a **creative workstation**, not a SaaS product page. The user has already chosen to be here — there is no funnel to walk them through, no hero to convince them, no marketing voice to maintain. What they need is **a quiet surface that respects their attention and a multi-panel layout that keeps context visible while they work.**

The guiding principle is **quiet professional density**: every panel earns its pixels, hairline borders carry separation instead of shadows, color is calibrated so attention falls on the user's generated work and not the chrome around it. We borrow the visual posture of a desktop creative tool — Photoshop, Premiere, Figma — where multiple inspectors and rails share the screen without apology, and we add the typographic care of a modern editor like Linear or Cursor. The result is a surface that looks **lived-in by a power user**, not optimized for a screenshot.

We explicitly reject the "social AI" aesthetic — gradient backgrounds, oversized rounded cards, pastel hero illustrations, marketing-y motion, and the centered-hero / three-feature-columns layout. None of those serve a user who is iterating on a prompt for the fifth time today.

---

## 2. Reference apps & what each contributes

| App | What we take from it |
|---|---|
| **Photoshop / Premiere** | Multi-panel layout. Persistent inspectors and rails do not apologize for taking room. The canvas is the figure; everything else is calibrated ground. |
| **Figma** | The cool-gray surface palette and **hairline borders carrying the entire elevation story.** Buttons are shadowless. Panels are flat with 1px dividers. |
| **Linear** | Typographic rigor at small sizes. Calibrated motion (180ms is the answer to most things). Tabular figures on counters. |
| **Cursor (the editor)** | Keyboard-first density. The chrome shrinks to give the document room. Status lives in a thin bar, not a banner. |
| **Things 3** | The single deliberate **accent moment per screen** — one button is the action, the rest of the UI gets out of the way. The slight warmth in the iconography keeps the palette from feeling clinical. |
| **Vercel dashboard** | Tabular figures everywhere on numeric data. Mono-fonted IDs, seeds, hashes, durations. Tight gutters between panels. |
| **Cron** | Compact dense rows where a single primary action per row is implied by position, not by 18 hover states. |

We do **not** look to Midjourney, Discord, Notion-AI, Canva, or any "AI tool" that leans on purple gradients and large hero artwork. Those are anti-references.

---

## 3. Color system

The palette is built on **cool-tinted neutral grays** plus a single **blue-violet accent**. That is it. There are no secondary accent colors, no per-feature brand colors, no "warm" surface variants. Semantic colors (success/warning/danger) exist but are reserved for status — never for decoration.

### 3.1 Neutral surface palette — light

All neutrals carry a subtle cool tilt (~260° hue at very low chroma) so the system reads as "pro tool" rather than "warm document." Hex values in trailing comments are sRGB approximations for legacy tools.

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `--bg` | `oklch(0.985 0.002 260)` | `#f9f9fa` | Page floor (left rail, right gallery rail backgrounds) |
| `--surface` | `oklch(0.97 0.003 260)` | `#f3f3f5` | Default panel surface (params rail, history rows) |
| `--surface-raised` | `oklch(1 0 0)` | `#ffffff` | Canvas, input fields, popover/dialog body |
| `--surface-sunken` | `oklch(0.955 0.003 260)` | `#eeeef0` | Insets (textarea wells, search inputs) |
| `--border` | `oklch(0.92 0.004 260)` | `#e6e6ea` | Default 1px dividers between panels |
| `--border-strong` | `oklch(0.85 0.005 260)` | `#d3d3d8` | Selected card outline, focused input border |
| `--border-faint` | `oklch(0.95 0.003 260)` | `#ededf0` | Internal sub-dividers inside a panel |

### 3.2 Neutral surface palette — dark

Dark mode is **not** a literal inversion. Dark canvas leans cool (~260° hue, a touch above zero chroma) so it doesn't read as "warm coffee-shop dark." Surfaces step up in lightness as they approach the user, the same way light mode steps down.

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `--bg` | `oklch(0.16 0.005 260)` | `#1d1e22` | Page floor |
| `--surface` | `oklch(0.19 0.006 260)` | `#24252a` | Default panel surface |
| `--surface-raised` | `oklch(0.22 0.007 260)` | `#2b2c32` | Canvas frame, dialog body, input fields |
| `--surface-sunken` | `oklch(0.14 0.005 260)` | `#191a1e` | Insets, textarea wells |
| `--border` | `oklch(0.28 0.008 260)` | `#3a3b42` | 1px panel dividers |
| `--border-strong` | `oklch(0.38 0.009 260)` | `#52535b` | Selected outline, focused input border |
| `--border-faint` | `oklch(0.24 0.007 260)` | `#313238` | Internal sub-dividers |

### 3.3 Text scale

| Token | Light (OKLCH / hex) | Dark (OKLCH / hex) | Use |
|---|---|---|---|
| `--text` | `oklch(0.20 0.006 260)` / `#2a2b30` | `oklch(0.96 0.003 260)` / `#f3f3f5` | Default body, panel headings |
| `--text-muted` | `oklch(0.50 0.007 260)` / `#76777e` | `oklch(0.70 0.006 260)` / `#a8a9af` | Section labels, secondary metadata, default icon color |
| `--text-faint` | `oklch(0.65 0.006 260)` / `#9d9ea4` | `oklch(0.55 0.006 260)` / `#83848a` | Captions, placeholders, version label |
| `--text-on-accent` | `oklch(1 0 0)` / `#ffffff` | `oklch(0.18 0.005 260)` / `#22232a` | Label color sitting on top of `--accent` |

Body text on `--surface-raised` clears WCAG AA at 4.5:1; section labels at `--text-muted` clear AA on body-sm and larger by design.

### 3.4 Accent — the one deliberate color

The accent is a flat **blue-violet** lifted from the mockup's *Generate* button. It is the single chromatic moment per screen: primary CTA, active nav row, focused input border, in-progress determinate progress bar. Nothing else uses it.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `oklch(0.55 0.18 265)` / `#5a5cdc` | `oklch(0.65 0.20 265)` / `#7a7cff` | Primary CTA fill, active nav indicator, progress bar |
| `--accent-hover` | `oklch(0.50 0.19 265)` / `#4d4fd1` | `oklch(0.70 0.20 265)` / `#8c8eff` | Primary CTA hover |
| `--accent-active` | `oklch(0.45 0.19 265)` / `#4042c2` | `oklch(0.60 0.20 265)` / `#6e70f2` | Primary CTA pressed |
| `--accent-fg` | `oklch(1 0 0)` / `#ffffff` | `oklch(0.18 0.005 265)` / `#22232a` | Label color sitting on `--accent` |
| `--accent-soft` | `oklch(0.95 0.025 265)` / `#ebecff` | `oklch(0.28 0.05 265)` / `#3a3d6b` | Active nav row tint, accent-color chip backgrounds |
| `--focus-ring` | `oklch(0.55 0.18 265 / 0.5)` | `oklch(0.65 0.20 265 / 0.55)` | 2px outline on focus-visible |

**Why blue-violet at 265°.** It's the historical "creative tool default" hue (Photoshop, Premiere, Figma all sit in 240–270°). At chroma 0.18 it reads decisively as the action color without crossing into neon. We chose 265° rather than pure 240° blue because it preserves a fraction of warmth — the button doesn't read "system blue dialog button," it reads "this is the make-art button."

### 3.5 Semantic palette

Reserved exclusively for status. Never used as decoration, never used in icons that aren't communicating state.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--success` | `oklch(0.62 0.14 150)` / `#3aa66a` | `oklch(0.70 0.15 150)` / `#4dbf80` | Job completed indicator |
| `--warning` | `oklch(0.74 0.14 75)` / `#d9a23a` | `oklch(0.78 0.14 75)` / `#e6b04a` | Provider misconfigured warning |
| `--danger` | `oklch(0.58 0.20 25)` / `#d44a3e` | `oklch(0.66 0.21 25)` / `#e85a4d` | Validation error, destructive button |
| `--danger-soft` | `oklch(0.95 0.03 25)` / `#fbe9e6` | `oklch(0.30 0.07 25)` / `#5c2a26` | Error message background |

### 3.6 Tailwind v4 `@theme` block — paste-ready

```css
/* packages/ui/src/styles.css */
@import "tailwindcss";

@theme {
  /* radius */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* font families */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;

  /* z layers */
  --z-base: 0;
  --z-rail: 10;
  --z-popover: 50;
  --z-overlay: 80;
  --z-dialog: 100;
  --z-toast: 120;

  /* shadows — overlays only */
  --shadow-popover: 0 1px 2px oklch(0 0 0 / 0.04), 0 4px 12px oklch(0 0 0 / 0.06);
  --shadow-overlay: 0 2px 6px oklch(0 0 0 / 0.06), 0 12px 32px oklch(0 0 0 / 0.10);
}

/* light theme tokens */
[data-theme="light"] {
  --bg: oklch(0.985 0.002 260);
  --surface: oklch(0.97 0.003 260);
  --surface-raised: oklch(1 0 0);
  --surface-sunken: oklch(0.955 0.003 260);
  --border: oklch(0.92 0.004 260);
  --border-strong: oklch(0.85 0.005 260);
  --border-faint: oklch(0.95 0.003 260);

  --text: oklch(0.20 0.006 260);
  --text-muted: oklch(0.50 0.007 260);
  --text-faint: oklch(0.65 0.006 260);
  --text-on-accent: oklch(1 0 0);

  --accent: oklch(0.55 0.18 265);
  --accent-hover: oklch(0.50 0.19 265);
  --accent-active: oklch(0.45 0.19 265);
  --accent-fg: oklch(1 0 0);
  --accent-soft: oklch(0.95 0.025 265);
  --focus-ring: oklch(0.55 0.18 265 / 0.5);

  --success: oklch(0.62 0.14 150);
  --warning: oklch(0.74 0.14 75);
  --danger: oklch(0.58 0.20 25);
  --danger-soft: oklch(0.95 0.03 25);
}

/* dark theme tokens */
[data-theme="dark"] {
  --bg: oklch(0.16 0.005 260);
  --surface: oklch(0.19 0.006 260);
  --surface-raised: oklch(0.22 0.007 260);
  --surface-sunken: oklch(0.14 0.005 260);
  --border: oklch(0.28 0.008 260);
  --border-strong: oklch(0.38 0.009 260);
  --border-faint: oklch(0.24 0.007 260);

  --text: oklch(0.96 0.003 260);
  --text-muted: oklch(0.70 0.006 260);
  --text-faint: oklch(0.55 0.006 260);
  --text-on-accent: oklch(0.18 0.005 260);

  --accent: oklch(0.65 0.20 265);
  --accent-hover: oklch(0.70 0.20 265);
  --accent-active: oklch(0.60 0.20 265);
  --accent-fg: oklch(0.18 0.005 265);
  --accent-soft: oklch(0.28 0.05 265);
  --focus-ring: oklch(0.65 0.20 265 / 0.55);

  --success: oklch(0.70 0.15 150);
  --warning: oklch(0.78 0.14 75);
  --danger: oklch(0.66 0.21 25);
  --danger-soft: oklch(0.30 0.07 25);
}

/* expose tokens to Tailwind utility classes */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-surface-sunken: var(--surface-sunken);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-border-faint: var(--border-faint);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-text-faint: var(--text-faint);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-active: var(--accent-active);
  --color-accent-fg: var(--accent-fg);
  --color-accent-soft: var(--accent-soft);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
}
```

---

## 4. Typography

### 4.1 Families

| Family | Stack | Use |
|---|---|---|
| **Inter** | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | All UI: nav, panel headings, body, button labels |
| **JetBrains Mono** | `"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace` | Prompts, negative prompts, seeds, model IDs, file paths, capability tables, anywhere a hash or numeric ID appears |

Inter is loaded via the bundled `@fontsource-variable/inter` (already a dep). JetBrains Mono is loaded via `@fontsource-variable/jetbrains-mono`. Both are bundled — **no runtime CDN font fetch.**

### 4.2 Six-step scale

| Token | Size / line-height | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| `caption` | 11px / 16px | 500 | 0 | Version label, dense metadata, asset count badges |
| `body-sm` | 12px / 18px | 400 | 0 | Secondary panel text, history row meta, tooltip body |
| `body` | 13px / 20px | 400 | 0 | **Default UI text.** Param labels, nav labels, button labels |
| `body-strong` | 13px / 20px | 600 | 0 | Selected-row label, emphasized inline text |
| `title` | 15px / 22px | 600 | -0.01em | Panel headings ("Image Settings"), dialog titles |
| `display` | 20px / 26px | 600 | -0.01em | Wordmark "Imagine," empty-state headlines, page titles |

There is no display-XL. There is no 32px. If you find yourself reaching for one, you are building a marketing page by accident.

### 4.3 Numeric & code

```css
.tabular { font-variant-numeric: tabular-nums; }
.mono    { font-family: var(--font-mono); }
```

**All numeric data uses `tabular-nums`** — step counters during generation, durations, file sizes, dimensions, seeds, history timestamps. This prevents the jitter of variable-width digits in a counter that updates 30× per second.

**Mono is required** for: prompt textareas, negative prompt textareas, seed display, model IDs (e.g. `dall-e-3`, `flux-pro-1.1`), file paths, capability table rows, JSON previews. Mono is **forbidden** for: nav labels, section headings, button labels, dialog titles.

### 4.4 Principles

- Body sits at **13px**. We are intentionally smaller than typical web (which sits at 14–16px) because this is a desktop power-user tool, not a marketing site. The viewing distance and density expectation are different.
- Weight contrast is the primary hierarchy lever. **400 vs 600** is the only weight pair we use; we don't dabble in 500 or 700.
- Letter-spacing is `0` for body and `-0.01em` for titles. Negative tracking on small body text causes density problems; positive tracking on titles reads as airline-magazine.
- Never set type in all-caps in this system. (Section labels are sentence-case body-sm at `--text-muted`.)

---

## 5. Spacing & layout

### 5.1 Spacing scale — 4px base

| Token | px | Common use |
|---|---|---|
| `space-0.5` | 2 | Hairline gap inside compound components |
| `space-1` | 4 | Icon-to-label gap in dense rows |
| `space-2` | 8 | Inside-card gap, button inner padding-y |
| `space-3` | 12 | Standard panel gutter |
| `space-4` | 16 | Panel internal padding, between form rows |
| `space-5` | 20 | Section block separation |
| `space-6` | 24 | Empty-state padding |
| `space-8` | 32 | Dialog internal padding |
| `space-10` | 40 | Rare: gallery masonry gutter at large breakpoints |
| `space-16` | 64 | Empty-state total height |

We do not need 96px / 128px tokens. Those belong to marketing pages.

### 5.2 Standard panel widths

These widths are **load-bearing** — they're tuned to specific UI ergonomics and changing them ripples into the layout of every page.

| Surface | Width | Reasoning |
|---|---|---|
| **NavRail** (left, persistent) | **220px** | Holds 16px icon + 12px gap + ~20-character label at body weight, plus 16px padding each side. Tighter and the labels truncate on "Providers." |
| **Params rail** (left of canvas, Studio only) | **280px** | Holds two side-by-side selects (Aspect Ratio + Resolution) at minimum readable width plus 16px padding each side. |
| **Right gallery rail** (Studio only) | **240px** | Holds two stacked thumbnails per row at ~104px each plus 16px padding. |
| **Boards sidebar** (Gallery page) | **240px** | Same as right gallery rail, for visual symmetry across pages. |
| **Drawer** (right slide-out, Gallery & Assets detail) | **400px** | Wide enough to display prompt text without wrap-thrashing; narrow enough to leave canvas visible behind. |
| **Content gutter** | **16px** | Padding inside a panel; also the gap between sibling rows. |

### 5.3 No top app bar

There is no separate top nav bar. The wordmark **"Imagine"** lives at the top of the NavRail. This buys back ~56px of vertical real estate and avoids the L-shaped chrome that the previous design had.

### 5.4 Page-level layout shape

All Studio-family pages follow the same overall shape:

```
┌──────┬──────────────────────────────────────┬────────┐
│      │                                      │        │
│ Nav  │    Page content (varies by route)    │ Right  │
│ Rail │                                      │ rail   │
│ 220  │                                      │ 240    │
│      │                                      │        │
└──────┴──────────────────────────────────────┴────────┘
```

The right rail exists only on Studio. Gallery, Assets, Providers, and Settings give the full content area to the page. The NavRail is the only persistent structural element across all routes.

### 5.5 Studio canvas behavior

- Canvas image fills the available content area, preserving aspect ratio. There is no fixed max-width.
- Below the canvas: a 4px-tall determinate progress bar (only while a job runs), then the History list (rows of thumbnail + prompt-excerpt + relative-time).
- Above the canvas: a left-aligned `Image | Video` tab strip (40px tall, hairline-bottom border). Tab labels are `body-strong`; the inactive tab is `--text-muted`.

---

## 6. Radius, borders & elevation

### 6.1 Radius — four tokens, used deliberately

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | Inline tags, small chips, badge pills |
| `--radius-sm` | 6px | **Buttons.** Inputs. Selects. Most inline interactive elements. |
| `--radius-md` | 8px | Dialog. Sheet. Popover. Toast. Larger panel cards. |
| `--radius-lg` | 12px | Reserved for the canvas frame and gallery cards only. |

**No `lg` on inline elements.** A button at `radius-lg` reads as Web 2020 marketing button; we want desktop-tool button. **No `2xl` / `3xl`** anywhere — those tokens don't exist in this system.

### 6.2 Borders carry depth

Every panel, every row, every input has a 1px `--border` divider. The page is built on hairlines; the eye reads separation from the line, not from a shadow.

- **Default panel**: `--surface` background + `border-r 1px --border` (vertical dividers between panels).
- **Selected card** (e.g. selected gallery item): outline switches to `--border-strong`, plus a 2px `--accent` ring inset 0px (not offset) — the accent ring sits flush with the card edge.
- **Focused input**: border becomes `--accent` (full hue, not soft). Plus the global focus-ring described in §14.
- **Hover on a card**: border becomes `--border-strong`. No translation, no scale, no shadow.

### 6.3 Two shadow tokens — overlays only

Cards never carry shadow. Buttons never carry shadow. Panels never carry shadow.

| Token | Use |
|---|---|
| `--shadow-popover` | Popover, Tooltip, Toast. Subtle 1px ambient + 4–12px diffuse at low alpha. |
| `--shadow-overlay` | Dialog and full-screen Sheet. Slightly more pronounced — these need to detach from the surface beneath. |

If you find yourself adding a shadow to a card, you have the wrong abstraction — the card needs a `--border-strong` outline, not a shadow.

---

## 7. Motion

Motion is **invisible-when-correct.** A user iterating on a prompt should not notice the transitions; they should only notice when a transition is missing and the UI feels jarring.

### 7.1 Easing & duration tokens

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | State changes — hover, focus, panel open. The default. |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Sustained motion — sheet slide, dialog fade. |
| `--motion-fast` | 120ms | Hover, focus ring fade, button press feedback |
| `--motion-base` | 180ms | Tab switch, popover open, dropdown expand |
| `--motion-slow` | 240ms | Sheet/dialog open, theme switch |

### 7.2 Forbidden motion patterns

- No "mass entrance animations" on page load (staggered cards fading in, etc.).
- No spring physics on UI controls. Springs read as toy-like; we want desktop-precise.
- No motion that exceeds 240ms — anything slower feels broken in a tool that has to handle a fast iteration loop.
- Respect `prefers-reduced-motion: reduce` — collapse all motion to instant 0ms transitions when the user requests it.

### 7.3 Job-state motion

The progress bar animates left-to-right at the engine-reported rate (no synthetic easing). On completion, the bar fades out over `--motion-base`. There is no "celebration" moment. The image landing is the celebration.

---

## 8. Iconography

### 8.1 Phosphor duotone, three sizes

We use the **Phosphor** icon family at **`weight="duotone"`** — not `regular`, not `bold`, not `fill`. Duotone gives us a primary stroke and a secondary fill at lower opacity, which lets a single icon convey a small amount of hierarchy without us having to invent two icons.

Sizes: **16px, 20px, 24px**. Nothing else.

| Size | Use |
|---|---|
| 16 | Inline icons in dense rows, table cells, small chips |
| 20 | Standard icon (NavRail rows, button-with-icon, toolbar) |
| 24 | Empty-state illustrations, large status indicators |

### 8.2 Color rules

- **Default**: `--text-muted`. Icons recede until interacted with.
- **Hover**: `--text` (full ink).
- **Active nav row**: `--accent`. The icon is the second cue (the first is the `--accent-soft` row background).
- **Inside a primary button**: `--accent-fg` (white).
- **Status icons**: their semantic color (success/warning/danger).

### 8.3 No emoji as iconography

Emoji are **forbidden** in the chrome of the app. They are rendered by the OS, change appearance per platform, and signal "casual chat" — wrong register. Emoji may appear inside user-authored content (prompts, board names) — that is content, not chrome.

---

## 9. Common components

All component specs assume Tailwind v4 + Radix UI primitives. Every interactive element receives a `:focus-visible` ring per §14.

### 9.1 Button

Two sizes (`sm` 28px tall, `md` 32px tall). Four variants. **Radius `sm` always.** No shadow ever.

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| `primary` | `--accent` | `--accent-fg` | none | Generate, Save Provider Config, Add Asset |
| `secondary` | `--surface-raised` | `--text` | `1px --border` | Cancel, Edit, secondary toolbar actions |
| `ghost` | transparent | `--text-muted` (→ `--text` on hover, → `--surface-sunken` background on hover) | none | Icon-only buttons in toolbars, "View All" footer button |
| `danger` | `--danger` | `--accent-fg` | none | Delete board, Empty trash |

**`sm`**: 28px tall, padding-x 10px, body 13px. **`md`**: 32px tall, padding-x 14px, body 13px.

```tsx
// packages/ui/src/components/button.tsx
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] " +
  "font-medium leading-none transition-colors duration-[var(--motion-fast)] " +
  "ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-[var(--surface)] disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)]",
  secondary:
    "bg-[var(--surface-raised)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)]",
  ghost:
    "bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]",
  danger:
    "bg-[var(--danger)] text-[var(--accent-fg)] hover:opacity-90 active:opacity-80",
};

const sizes = {
  sm: "h-7 px-2.5 text-[13px]",
  md: "h-8 px-3.5 text-[13px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
```

### 9.2 Input & Textarea

- **Input**: 32px tall, padding-x 10px, body 13px, `--surface-raised` background, `1px --border`, radius `sm`. Focus → border becomes `--accent` and global focus-ring fires. Placeholder uses `--text-faint`.
- **Textarea (mono)**: same shape as Input but with `font-family: var(--font-mono)` and 12px body. Used for Prompt, Negative Prompt. Auto-resizes between 5 and 10 visible lines (`min-h: 90px; max-h: 180px; overflow-y: auto`).

### 9.3 Select (Radix)

Built on `@radix-ui/react-select`. Trigger is shaped like an Input. Content uses `--shadow-popover` and `radius-md`. Item rows are 28px tall, padding-x 10px, body 13px; hovered/focused items get `--surface-sunken` background.

### 9.4 Checkbox / Toggle (Radix Switch)

- **Checkbox**: 14px square, radius `xs`, `1px --border`, checkmark icon at 10px in `--accent-fg` on `--accent` fill when checked.
- **Switch**: 28×16px track, 12px circular thumb, 2px inset. Off → `--border-strong` track. On → `--accent` track. Animated via `--motion-fast`.

### 9.5 Slider (Radix)

Track 4px tall `--border`, range `--accent`, thumb 14px circle `--surface-raised` with `1px --border-strong`. Used in Image Settings ("Quality") and Advanced Settings.

### 9.6 Tabs (Radix)

Two flavors:

- **Underline tabs** — used at the top of the canvas (`Image | Video`). Inactive tab is `--text-muted` body-strong; active tab is `--text` body-strong with a 2px `--accent` underline drawn 0px from the bottom of the tab. 40px tall row.
- **Pill tabs** — used inside the right gallery rail and elsewhere for filter chips. Inactive: transparent + `--text-muted` body-sm. Active: `--accent-soft` background + `--accent` text + radius `xs`. 24px tall.

### 9.7 Toolbar

Horizontal row of ghost buttons + dividers. Sits at the top of a panel. 40px tall, hairline-bottom border, padding-x 12px. Dividers are 1px wide, 16px tall `--border`.

### 9.8 Card / Panel

The fundamental container. Properties:

- Background: `--surface` (or `--surface-raised` for the canvas frame and the gallery item).
- Border: `1px --border` (if it sits adjacent to a sibling panel, prefer a single shared divider rather than two).
- Radius: `md` if free-floating; **0** if it's a structural rail spanning edge-to-edge of the window.
- Padding: 16px standard, 12px in dense rails.

### 9.9 Dialog (Radix)

`--surface-raised` background, `radius-md`, `--shadow-overlay`, max-width 480px (compact) or 640px (forms). Title in `title`, body in `body`. Footer buttons right-aligned, 8px gap. Backdrop is `oklch(0 0 0 / 0.4)` light, `oklch(0 0 0 / 0.6)` dark.

### 9.10 Sheet — right-slide drawer

Used for the Gallery item detail and the Asset detail. Slides in from right, 400px wide, full height, `--surface-raised` background, `1px --border` left edge. Open animation: `transform: translateX(100%) → 0` over `--motion-slow` with `--ease-in-out`. Includes a close button (`X` at 16px) in the top-right corner. The sheet does **not** dim the page behind it — context stays visible.

### 9.11 Popover (Radix)

`--surface-raised` background, `radius-md`, `--shadow-popover`, `1px --border`. Content padding 12px. Used for kebab menus, the Account / version popover from the NavRail footer, the asset-chip selector menu.

### 9.12 Toast

Anchored bottom-right. 320px wide, `--surface-raised` background, `radius-md`, `--shadow-popover`, `1px --border` (or `--success`/`--danger` left border accent for status toasts). Auto-dismiss at 4s; persistent for errors.

### 9.13 Tooltip (Radix)

Tiny dark capsule. `oklch(0.20 0.006 260)` background (light theme), `oklch(0.96 0.003 260)` text, `radius-xs`, padding 4px 8px, `body-sm`. Open delay 400ms.

### 9.14 EmptyState

Centered content block: 48px `text-faint` Phosphor icon at duotone, `title` headline, `body` description in `--text-muted`, optional primary button below. Used on Gallery before any generations, on Boards when no boards exist, on Assets per-tab when empty, on Providers when none configured.

### 9.15 Skeleton

Placeholder for loading content. `--surface-sunken` background, optional 1.4s shimmer (a pale `--surface` gradient swept across via `linear-gradient` + `animation: skeleton-shimmer`). Used for: the canvas while a job's first frame is pending, gallery rail thumbnails during initial load. **Skeletons replace spinners.** A bare spinner with no shape context is forbidden — see §15.

---

## 10. App-specific composites

These are the named higher-order components specific to Imagine Studio. Each maps to an actual file or a tightly-scoped component family in `packages/ui` or `apps/desktop`.

### 10.1 NavRail (new)

The persistent left rail. **220px wide**, full height, `--bg` background, `1px --border` right edge, no shadow.

```
┌────────────────────┐
│  ┌─┐               │  16px top padding
│  │I│  Imagine      │  wordmark — Inter 20/26 600
│  └─┘  v0.0.1       │  caption — text-faint
│                    │
│  ─────────────     │  hairline divider
│                    │
│  [icon]  Studio    │  active row → bg accent-soft, text accent
│  [icon]  Gallery   │  body 13px, 36px row height
│  [icon]  Assets    │
│  [icon]  Providers │
│  [icon]  Settings  │
│                    │
│       …            │  flex-grow spacer
│                    │
│  ─────────────     │  hairline divider
│  ● Online          │  status indicator — body-sm muted
└────────────────────┘  16px bottom padding
```

**Wordmark**: "Imagine" in `display` weight, paired with a 20px square brand glyph (placeholder `Image` icon) at left. Below it sits `v0.0.1` in `caption` at `--text-faint`. Pulled from `package.json` version at build time.

**Nav row**: 36px tall, padding-x 12px, gap 12px between icon and label, radius `sm`, body weight. Active state: `--accent-soft` background, `--accent` text and icon. Hover (when not active): `--surface-sunken` background.

**Five rows in this exact order**: `Studio` (Phosphor `Image`), `Gallery` (`SquaresFour`), `Assets` (`Cube`), `Providers` (`Plug`), `Settings` (`Gear`).

**Footer**: a single status dot + label. Dot is 6px circle in `--success` when all configured providers are reachable; `--warning` if at least one is misconfigured; `--text-faint` if none configured. Label says "Online" / "Provider issue" / "No providers" respectively. Clicking the footer opens a Popover with provider status detail.

### 10.2 PromptComposer (rail-fitted)

Lives **inside the params rail** (Studio, left column). It is a vertically stacked form, not a full-width hero composer. The rail carries these section blocks in this order, separated by 1px `--border-faint` dividers:

1. **Model Provider** — segmented control (Radix ToggleGroup). Three options visible at once (`OpenAI`, `Azure`, `Google`); a kebab opens the rest. Active segment: `--surface-raised` + `1px --border-strong`.
2. **Model** — Select trigger styled as Input. The selected model's capability table (see §10.6 ModelSelect) renders below the trigger when expanded.
3. **Prompt** — textarea, 5 visible lines default, autosizes to 10. Mono. Placeholder: "Describe what you want to see…"
4. **Asset chips** — see §10.3 AssetPicker. Sits between Prompt and Negative Prompt.
5. **Negative Prompt** — textarea, 2 visible lines default, autosizes to 4. Mono. Placeholder: "What to avoid…"
6. **Image Settings** (or **Video Settings** when on Video tab) — section heading + grid of 2-up selects (Aspect Ratio + Resolution) and a slider (Quality, or Duration on Video tab).
7. **Advanced Settings** — Radix Collapsible. Closed by default. Contains Seed (mono input + Reroll button), Steps, CFG / Guidance, Sampler.
8. **Generate** button — full-rail-width, primary variant, 36px tall (slightly larger than `md` because it is the action of the screen). Sits at the very bottom of the rail with 16px padding above.

Section labels are `body` at `--text-muted` with 12px margin above each block.

### 10.3 AssetPicker (chip row)

A horizontal chip row sitting between Prompt and Negative Prompt. Each chip represents a *kind* of asset that can be referenced in the prompt:

- `+ Character`
- `+ Object`
- `+ Background`
- `+ Style`

Empty chip (not yet added): ghost button shape, dashed `1px --border` outline, label in `--text-muted`. Click → opens a Popover with a search field and a grid of saved assets of that kind.

Filled chip (asset selected): solid `--surface-raised` background, `1px --border`, 20px square thumbnail at left, asset name in `body-sm` to its right, kebab on the right edge for "Replace / Remove." Multiple assets of the same kind stack — the chip becomes a vertical mini-grid of two thumbnails (overlapped 4px) followed by `+N more` text.

Chips wrap to multi-row layout if the rail width is exceeded.

### 10.4 GalleryItemCard

Two presentations:

**Full Gallery page (masonry)**: image fills card, `radius-md`, no border by default, hover → `--border-strong` outline + tiny kebab in top-right. Selected (drawer-open) → `--accent` 2px ring inset, `--border-strong` outline. Aspect ratio preserved per image. Below the image inside the card, two-line metadata: prompt excerpt (`body-sm` clamp 1 line) + relative time (`caption --text-faint`). Video items get a thin play-glyph overlay in the bottom-left.

**Right gallery rail (Studio)**: smaller, 2-up grid, `radius-sm`, image only — no metadata under it; the prompt shows in a Tooltip on hover. Items are 104×104px square crops (objectFit cover). The rail shows ~12 items, with a "View All Gallery" ghost button pinned to the bottom that routes to `/gallery`.

### 10.5 BoardSidebarItem

Used in the Boards sidebar of the Gallery page. 32px tall row, 12px padding-x, gap 8px. 16px Phosphor icon (`Folder` for boards, `Trash` for trash) in `--text-muted`, board name in `body`, item count in `caption --text-faint` right-aligned. Selected: `--accent-soft` background, `--accent` icon. Drag-target state: `--accent` 1.5px dashed outline.

### 10.6 ModelSelect (capability table)

The most distinctive composite from the previous DESIGN.md and we are keeping it. When a Select item is highlighted (or the closed Select trigger is hovered), an inline 3–5 line capability table renders below the model name. Mono. Each row is a key-value pair where the value is right-aligned.

```
flux-pro-1.1                              (model name — body-strong)
  max-resolution    2048×2048             (mono — body-sm)
  aspect-ratios     1:1 4:5 16:9 9:16
  cost              $0.04 / image
  latency           ~6s
  features          inpaint · style-ref
```

The table is `--text-muted` for keys, `--text` for values. A model that doesn't support a feature shows `—` instead of leaving a row blank. The table renders in the open Select content (alongside each item) and as a static block below the closed trigger when a model is currently selected (so the user can confirm capabilities at a glance).

### 10.7 JobProgress

**Image variant**: a 4px-tall determinate bar in the canvas footer area (sitting between the canvas image and the History list). Track is `--border-faint`, fill is `--accent`. To the right of the bar: `body-sm --text-muted` showing `step 18/30 · 4.2s` (mono numerals, tabular figures). On completion, bar fades out over `--motion-base` and is removed from layout.

**Video variant**: same 4px bar, but with two timestamps on the right — elapsed (`0:42`) and ETA (`~1:10 remaining`). Mono, tabular. Updates at the engine's reported cadence — we do not synthesize ticks.

There is no spinner anywhere in this component.

### 10.8 CanvasFrame

Wraps the current generation image. `--surface-raised` background, `radius-lg`, `1px --border`. Padding 0 (the image fills the frame). Above the image: floating toolbar overlay (download, copy seed, share, kebab) that fades in on canvas hover only — not always-visible. Below the image: JobProgress (when running) or the History list (when idle).

### 10.9 HistoryList

Below the canvas. Each row: 48px thumbnail (radius `sm`) + prompt excerpt (`body` clamp 2 lines) + relative time (`caption --text-faint` right-aligned). 56px row height. Hover: `--surface-sunken` background. Click: load that generation back into the canvas (and its params back into the rail).

### 10.10 ProviderRow

Used on the Providers page. Collapsible row showing provider name, status dot, status text, and a chevron. Expanded: shows the config form (API key, base URL, default model) plus a "Test connection" button. Closed: 56px tall row with name in `body-strong`, status detail in `body-sm --text-muted`, and a status chip (`--success-soft` "Online", `--warning-soft` "Misconfigured", `--text-faint` "Not configured").

---

## 11. Page blueprints

### 11.1 Studio (unified Image + Video)

The home page of the app. Three structural panels live inside the main content area, with the persistent NavRail to their left:

```
┌──────┬──────────┬─────────────────────────────────────┬────────┐
│ Nav  │ Params   │  ┌─ Image | Video ───────────────┐  │Gallery │
│ rail │ rail     │  │                               │  │ rail   │
│      │          │  │      Canvas (current gen)     │  │        │
│ 220  │   280    │  │                               │  │  240   │
│      │          │  └───────────────────────────────┘  │        │
│      │          │  ▭▭▭ (4px progress bar)             │ ┌──┬──┐│
│      │          │                                     │ │  │  ││
│      │          │  History                            │ ├──┼──┤│
│      │          │  ┌───────────────────────────┐      │ │  │  ││
│      │          │  │ thumb · prompt    2m ago  │      │ ├──┼──┤│
│      │          │  │ thumb · prompt   13m ago  │      │ │  │  ││
│      │          │  └───────────────────────────┘      │ └──┴──┘│
│      │          │                                     │View All│
└──────┴──────────┴─────────────────────────────────────┴────────┘
```

**Tab strip behavior.** The `Image | Video` tab strip at the top of the canvas (40px tall, hairline-bottom) controls *what mode the rail is in*. When `Image` is active, the params rail's settings block is **Image Settings** (Aspect Ratio + Resolution + Quality) and the Model select shows image models. When `Video` is active, the rail switches to **Video Settings** (Duration + FPS + Resolution + a "First frame" image slot) and the Model select shows video models. The other rail blocks (Provider, Prompt, Asset chips, Negative Prompt) stay the same shape — only the Settings block and the Model list rewire.

**Variations strip.** The mockup shows a horizontal strip of variation thumbnails immediately below the canvas. **TODO M-future** — not in scope for the current implementation. When added, it sits between the canvas and the JobProgress bar, 84px tall, with a Radix horizontal scroll.

**Right gallery rail** is the §10.4 right-rail-presentation reading from `useGalleryStore` filtered to `recent` (last 30 items, all kinds). Two filter chips at the top: `All` / `Newest`.

### 11.2 Gallery

Full-page Gallery. Boards sidebar (left) + masonry (center) + drawer (right, opens when a card is selected).

```
┌──────┬─────────┬───────────────────────────────────┐
│ Nav  │ Boards  │   Filter chips · search           │
│ rail │ sidebar │ ─────────────────────────────────  │
│      │   240   │   ┌────┐ ┌────┐ ┌──┐ ┌──────┐    │
│      │ ┌─────┐ │   │    │ │    │ │  │ │      │    │
│ 220  │ │All  │ │   │    │ │    │ └──┘ │      │    │
│      │ │★Brd │ │   └────┘ │    │ ┌──┐ │      │    │
│      │ │Brd 2│ │   ┌────┐ └────┘ │  │ └──────┘    │
│      │ │Trash│ │   │    │ ┌────┐ └──┘  ┌────┐     │
│      │ └─────┘ │   └────┘ │    │       │    │     │
│      │         │           └────┘       │    │     │
└──────┴─────────┴───────────────────────────────────┘
```

Masonry uses CSS columns (`columns: 4`) at the standard window size, `columns: 3` below 1280px, `columns: 2` below 960px. Gutter is `space-3` (12px). Cards keep their natural aspect ratios.

Drawer (right slide-out, see §9.10): shows full-resolution image, full prompt + negative prompt (mono), all params, action toolbar (Download, Copy seed, Send to Studio, Add to board, Move to trash).

### 11.3 Assets

Five tabs across the top: `Characters` `Objects` `Backgrounds` `Styles` `Trash`. Below the tabs: a thumbnail grid (4-up at standard width). Drawer right-slides for asset detail (preview, name, kind, references count, source generation link, delete).

```
┌──────┬───────────────────────────────────────────────┐
│ Nav  │ Characters | Objects | Backgrounds | Styles |Trash │
│ rail │ ─────────────────────────────────────────────  │
│      │  + New asset   [search]                        │
│ 220  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐                  │
│      │  │    │ │    │ │    │ │    │                  │
│      │  └────┘ └────┘ └────┘ └────┘                  │
│      │   name   name   name   name                   │
│      │  ┌────┐ ┌────┐ ┌────┐ ┌────┐                  │
│      │  │    │ │    │ │    │ │    │                  │
│      │  └────┘ └────┘ └────┘ └────┘                  │
└──────┴───────────────────────────────────────────────┘
```

### 11.4 Providers

Six rows, each a §10.10 ProviderRow. Order: `OpenAI`, `Azure OpenAI`, `Google`, `Flux BFL`, `Volcengine`, `xAI`. Each row collapses to show its config form.

```
┌──────┬───────────────────────────────────────────────┐
│ Nav  │ Providers                                     │
│ rail │ Configure API access for image/video models.  │
│      │ ───────────────────────────────────────────── │
│ 220  │ ▸ OpenAI            ● Online    ▾             │
│      │ ▸ Azure OpenAI      ● Online    ▾             │
│      │ ▾ Google            ● Misconf.  ▴             │
│      │     API Key  [········]                       │
│      │     Base URL [https://...]                    │
│      │     [Test connection]   [Save]                │
│      │ ▸ Flux BFL          ○ Not conf. ▾             │
│      │ ▸ Volcengine        ○ Not conf. ▾             │
│      │ ▸ xAI               ● Online    ▾             │
└──────┴───────────────────────────────────────────────┘
```

### 11.5 Settings

Sectioned panels stacked vertically. Each section is a §9.8 Card. Sections in this order:

1. **Theme** — radio group: System / Light / Dark.
2. **Defaults** — default model per kind (image / video), default aspect ratio, default resolution, default count.
3. **Behavior** — toggles: "Auto-save generations to local," "Confirm before deleting," "Show capability table in Model select."
4. **Storage** — local-cache size meter, "Clear cache," "Open data folder."
5. **About** — app version, build commit (mono), license, link to `architecture.md`.

---

## 12. Light / dark theme implementation

### 12.1 Toggle mechanism

The active theme is encoded as `data-theme="light"` or `data-theme="dark"` on the `<html>` element. Token blocks under `[data-theme="light"]` and `[data-theme="dark"]` (see §3.6) re-bind the CSS custom properties; every component reads from the custom properties only, never from a hardcoded color. Changing themes is a single attribute write — no full re-render, no flash.

### 12.2 No-FOUC inline script

Already in place from M4. The inline `<script>` inside `<head>` reads the persisted preference from `localStorage["imagine.theme"]` (or `prefers-color-scheme` if unset) and writes the `data-theme` attribute *before* the React tree mounts. This eliminates the white-flash on dark-mode startup.

```html
<!-- apps/desktop/index.html, in <head> -->
<script>
  (function () {
    try {
      var pref = localStorage.getItem("imagine.theme");
      var sys = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      var theme = pref === "light" || pref === "dark" ? pref : sys;
      document.documentElement.setAttribute("data-theme", theme);
    } catch (e) {
      document.documentElement.setAttribute("data-theme", "light");
    }
  })();
</script>
```

### 12.3 Dark-mode tilt

Dark mode is **not** an inversion. Its grays are calibrated separately at ~260° hue with very low chroma (0.005–0.009) so the canvas reads as "cool dark workshop" rather than "warm office at night." The accent in dark mode is **brighter and slightly more saturated** (`oklch(0.65 0.20 265)` vs `0.55 0.18 265` in light) — it has to pop against a darker canvas to remain the action moment.

Borders in dark mode lean slightly higher contrast against their surface than in light mode (delta ~0.09 in lightness vs ~0.07 light), because hairlines on dark surfaces need more contrast to read at 1px.

---

## 13. Tailwind v4 + Radix integration

### 13.1 Token mapping

The `@theme` block in §3.6 exposes every color as `--color-<name>`. Tailwind v4 picks these up and exposes them to utility classes — `bg-surface`, `text-text-muted`, `border-border` all resolve from CSS custom properties. **Never hardcode a hex in a className.** If you find yourself writing `bg-[#5a5cdc]`, you have failed the design system.

### 13.2 Radix `data-state` selectors

Radix primitives expose state via `data-state="open|closed|on|off"` attributes. Style these with Tailwind's arbitrary variant syntax:

```tsx
<Select.Trigger
  className="
    h-8 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface-raised
    data-[state=open]:border-accent
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]
  "
>
  …
</Select.Trigger>
```

For Radix Tabs underline, use `data-[state=active]:after:bg-accent` on a ::after pseudo-element to draw the 2px accent rule.

### 13.3 Shared tokens between Radix and hand-built panels

A hand-built panel and a Radix Popover should share `--surface-raised`, `--border`, `--shadow-popover`, and `--radius-md`. There is exactly one shadow scale, one border, one surface palette. The whole point of putting tokens in `@theme` is so a Radix-rendered floating popover and a static panel feel like siblings.

### 13.4 Component file layout

```
packages/ui/
  src/
    styles.css                 ← @theme blocks + base resets
    utils/cn.ts
    components/
      button.tsx
      input.tsx
      textarea.tsx
      select.tsx
      checkbox.tsx
      switch.tsx
      slider.tsx
      tabs.tsx
      toolbar.tsx
      card.tsx
      dialog.tsx
      sheet.tsx
      popover.tsx
      toast.tsx
      tooltip.tsx
      empty-state.tsx
      skeleton.tsx
    composites/
      nav-rail.tsx
      prompt-composer.tsx
      asset-picker.tsx
      gallery-item-card.tsx
      board-sidebar-item.tsx
      model-select.tsx
      job-progress.tsx
      canvas-frame.tsx
      history-list.tsx
      provider-row.tsx
```

---

## 14. Accessibility floor

### 14.1 Focus ring (global)

Every interactive element receives a `:focus-visible` ring: 2px outline in `--focus-ring` (accent at 50–55% opacity), offset 2px from the element edge using `outline-offset` or Tailwind's `ring-offset` utilities. The ring color and offset are constant across light and dark modes. There is no browser-default focus outline anywhere — `:focus-visible` is the only mechanism.

### 14.2 Contrast minimums

- Body text on its surface: **WCAG AA (4.5:1) minimum**, AAA (7:1) where reasonable. Default text on `--surface-raised` clears AAA in both themes by design.
- Large text (18px+ or 14px+ bold): WCAG AA (3:1).
- Icon-only interactive elements: minimum 3:1 against background; **always** paired with an `aria-label`.
- Status colors: hue conveys nothing on its own — every status row pairs the color with an icon and a text label.

### 14.3 Keyboard navigation

- **Tab order** in the Studio params rail: Provider segments → Model select → Prompt textarea → Asset chips → Negative Prompt → Settings selects → Advanced collapsible toggle → Generate button. (No tabbing into "decorative" elements.)
- **Arrow keys** navigate the gallery masonry (left/right within a row, up/down across rows). Enter opens the drawer.
- **Esc** closes any open Sheet, Dialog, or Popover.
- **⌘K / Ctrl+K** opens the command palette. **TODO M-future** — note it as a planned shortcut; the listener can stub-toast "Coming soon" until the palette ships.
- **⌘Enter / Ctrl+Enter** inside the Prompt textarea triggers Generate (matches industry standard for AI-prompt fields).

### 14.4 Reduced motion

`@media (prefers-reduced-motion: reduce)` collapses every transition and animation to instant 0ms. Skeletons stop shimmering (they remain as static placeholder fills). Sheet/dialog open/close becomes instant.

### 14.5 Screen reader

- Every Phosphor icon has either an `aria-hidden="true"` (when paired with a visible text label) or an `aria-label` (when icon-only).
- Live-region announcements for job state transitions: `aria-live="polite"` on the JobProgress text. "Generation started," "step 18 of 30," "generation complete." Throttled to one announcement per 2 seconds.
- The NavRail uses `<nav aria-label="Primary">` and the active row carries `aria-current="page"`.

---

## 15. Forbidden patterns

These are **system-level violations**, carried forward from the prior DESIGN.md and clarified for the Quiet-Density rewrite. If you find yourself reaching for one, stop and re-read this section.

### 15.1 Hard nos

- **No purple/blue gradient backgrounds.** No `bg-gradient-to-br from-purple-500 to-blue-600` anywhere, ever. The accent color is a flat solid; the surface palette is solid grays.
  - **Clarification (new):** A flat blue-violet *button* is **not** a gradient. The Generate button in the mockup is `--accent` solid. This is fine. The forbidden thing is gradient *backgrounds* (page floors, hero cards) and gradient *text* (`bg-clip-text` rainbow titles). Solid accent ≠ gradient.
- **No glassmorphism as a theme.** No `backdrop-blur` panels as the page-wide aesthetic. We use clear surfaces with hairline borders. (`backdrop-blur` may appear on a single specific element if it solves a real problem — e.g., the canvas toolbar overlay — but it never defines the palette of a page.)
- **No `rounded-3xl` everywhere.** The radius scale tops out at `lg` (12px) and `lg` is used only on the canvas frame and gallery cards. Buttons and inputs are `sm` (6px). If a designer suggests `rounded-2xl` on a button, they are designing a different product.
- **No emoji as primary iconography.** Phosphor duotone is the icon system. Emoji are content, not chrome.
- **No faux-3D / neumorphism.** No inset+outset shadow combos, no claymation 3D illustrations, no embossed buttons. The whole point of hairline borders is that we do not need to fake depth.
- **No centered-hero + three-feature-columns layout.** That is a marketing page. This is a workspace.
- **No AI-generated pastel palettes.** No "soft mint + dusty pink + lavender + cream" combination. The palette is cool gray + one blue-violet accent. Done.
- **No spinners as the only loading state.** Use Skeletons that match the shape of the eventual content. A bare spinner with no shape context is forbidden. (Spinners *may* appear inside a button's pressed-during-async state, but they are paired with a label like "Generating…")

### 15.2 New additions (Quiet-Density)

- **No floating action buttons (FAB) over content.** Actions live inside toolbars and panels, where the user expects them. A floating circle button overlaying the canvas reads as mobile-app aesthetic — wrong register.
- **No hero or marketing hero sections.** No oversized H1 + sub-headline + "Get started" CTA on any in-app page. The user already chose to be here. Empty states are the closest we get to a hero — and even those use `title`, not `display-XL`.
- **No top-bar persistent app navigation.** The five-item nav lives in the left rail. A top bar would re-introduce the L-shaped chrome the prior design suffered from.
- **No "Models," "Tools," "Boards," "Credits," or "Buy Now" top-level nav rows.** Models are configured per-provider on the Providers page. Tools are out of scope. Boards live as a left-side filter inside the Gallery page. There is no billing — this app is local-only.
- **No semantic color used as decoration.** `--success`, `--warning`, `--danger` are reserved for status. Don't reach for them to "spice up" a divider or chip.
- **No drop shadows on cards or buttons.** Borders carry separation. Shadows are reserved for popovers and dialogs (the two `--shadow-*` tokens) and are used **only** when an element is genuinely floating above the page.

---

## 16. Migration notes

This section is informational. It maps the design changes onto the existing M1–M8 implementation so a future implementer knows *what to change* — it does **not** prescribe the actual code diffs.

### 16.1 Token swap (`packages/ui/src/styles.css`)

Replace the entire Clay token block (cream canvas, 6 brand-color cards, Plain Black display) with the §3.6 `@theme` blocks. All references in components to `bg-canvas`, `bg-brand-pink`, `bg-surface-card` etc. need to be re-mapped to `bg-surface`, `bg-surface-raised`, `bg-accent`, `bg-accent-soft`. The 6-color brand-card vocabulary is **gone** — there is no per-feature card color in this system.

### 16.2 Top-bar nav → left sidebar nav

The current `apps/desktop/src/renderer/App.tsx` shell renders a horizontal top bar with six links (Studio / Video / Gallery / Assets / Providers / Settings). Rework:

- Remove the top-bar component entirely.
- Mount a new `<NavRail>` component (§10.1) at the left, persistent across routes.
- Reduce the nav set from six items to **five**, in this exact order: **Studio, Gallery, Assets, Providers, Settings.**
- The wordmark "Imagine" moves from the top bar into the rail's header.

### 16.3 Studio + Video Studio merge

Merge the previously separate `pages/Studio.tsx` and `pages/VideoStudio.tsx`:

- Add a `mode: "image" | "video"` slice to the Studio store (or use a URL search param `?mode=video`).
- In `pages/Studio.tsx`, render the `Image | Video` underline tab strip at the top of the canvas (§9.6, §11.1).
- The params rail's Settings block, Model select, and (when video) the "First frame" slot are conditional on `mode`. The rest of the rail is mode-invariant.
- Add a router redirect: `/video → /studio?mode=video`. Existing deep links survive.
- Delete or fold `pages/VideoStudio.tsx` — its contents merge into the conditional Settings block of `pages/Studio.tsx`.

### 16.4 PromptComposer narrows

The current `PromptComposer` likely renders full-width across the canvas area. Narrow it to fit inside the 280px params rail (§5.2, §10.2). Specifically:

- Textarea autosize range: 5 → 10 lines. Default 5 visible.
- Drop any horizontal layout (provider chip + prompt side-by-side). Stack vertically.
- Section labels are sentence-case `body --text-muted`, **not** uppercase caption.

### 16.5 Right gallery rail (Studio-only)

A new component reading from `useGalleryStore` with a `recent` filter, two filter chips (`All` / `Newest`), and a "View All Gallery" footer ghost button that routes to `/gallery`. Lives only on the Studio route.

### 16.6 Asset chips between prompt blocks

The §10.3 AssetPicker (chip row) sits between Prompt and Negative Prompt in the params rail. If the current implementation has it elsewhere, move it.

### 16.7 Theme tokens are paths to follow

Every component re-rendering with the new tokens should be visually verified in both light and dark themes before merging. The §12.2 no-FOUC script is already in place from M4 — confirm it reads `imagine.theme` and not a different storage key.

### 16.8 Out of scope for this design pass

- Variations strip below the canvas (M-future).
- Command palette (⌘K) — listener stub OK; full implementation M-future.
- Drag-and-drop reorder of NavRail items — not a feature.
- Per-board accent tinting — not a feature.

---

## 17. Iteration guide

1. **Work on one composite at a time.** Don't try to land Studio + Gallery + Assets in a single PR. Each composite is its own scoped PR.
2. **Reference tokens, never literals.** A class of `bg-[#5a5cdc]` will fail review. Use `bg-accent`.
3. **Verify both themes.** Every visual change ships with screenshots in light and dark.
4. **Verify keyboard.** Every new interactive element is reachable by Tab and dismissible by Esc.
5. **Verify motion.** With `prefers-reduced-motion: reduce`, the change must still be functional.
6. **Don't add a color.** If you feel you need a new color, the answer is almost certainly "you don't" — recompose with existing tokens or use `--accent-soft`.
7. **Don't add a shadow.** If you feel you need a shadow, the answer is "use `--border-strong`" 99% of the time. The 1% is a popover or dialog, which already has its token.

---

## 18. Known gaps

- The Phosphor brand glyph for the wordmark is currently `Image` from Phosphor as a placeholder — a real custom logomark is M-future.
- The capability table data (`max-resolution`, `cost`, `latency`) requires the providers package to expose these as a structured shape; current providers expose only model IDs. Schema work is M-future.
- The variations strip (mockup-visible) is not specced here beyond a TODO note.
- Command palette content (commands, search index, fuzzy match) is not specced here.
- Per-asset color tinting (e.g., a Style asset showing a color swatch) is not specced — the current system shows thumbnails only.
- Drag-and-drop targets (drop a board onto another to nest) are not specced — boards are flat for now.
- High-contrast mode (Windows forced-colors) is not specced beyond "respect `forced-colors: active` and let the OS overrides take over." A formal spec is M-future.
