# Listd Landing — Parity Checklist (vs Rid)

Reference: rid.me. This document records design tokens, breakpoints, and animation specs for pixel parity.

---

## 1. Typography

| Element | Font family | Weight | Size | Line height | Letter spacing |
|--------|-------------|--------|------|-------------|----------------|
| Body | Inter (--font-geist-sans fallback) | 400 | 16px (1rem) | 1.5 | 0 |
| Hero headline | Inter | 600 | 3.5rem → 4.5rem (lg) | 1.1 | -0.02em |
| Hero subline | Inter | 400 | 1.125rem → 1.5rem (lg) | 1.5 | 0 |
| Section title (e.g. FAQ) | Inter | 600 | 1.5rem → 2rem (sm) | 1.25 | -0.02em |
| Nav links | Inter | 400 | 1rem | 1.5 | 0 |
| Message bubbles | Inter | 400 | 0.875rem (14px) | 1.4 | 0 |
| Small / captions | Inter | 400 | 0.875rem | 1.5 | 0 |

- **Fallbacks:** `system-ui, -apple-system, sans-serif`.
- **Sizes by breakpoint:** Hero uses `text-4xl` (375px) up to `text-7xl` (1280px+); section titles scale at `sm:` and `md:`.

---

## 2. Color tokens

| Token | Value | Usage |
|-------|--------|--------|
| --bg | #0a0a0a | Page background |
| --bg-elevated | #111111 | Nav, cards elevation |
| --bg-card | #161616 | Message card, FAQ, CTA card |
| --bg-muted | #1a1a1a | Message bubble (agent), hover states |
| --fg | #fafafa | Primary text |
| --fg-muted | #a1a1aa | Secondary text (zinc-400) |
| --fg-subtle | #71717a | Tertiary (zinc-500) |
| --accent | #3b82f6 | Primary CTA, user bubble |
| --accent-soft | rgba(59,130,246,0.15) | Glow / soft highlight |
| --gradient-start | #3b82f6 | Gradient start (blue) |
| --gradient-end | #8b5cf6 | Gradient end (violet) |
| --border | rgba(255,255,255,0.08) | Borders |
| --border-strong | rgba(255,255,255,0.12) | Strong borders |

**Shadows**

- --shadow: `0 4px 24px rgba(0,0,0,0.4)`
- --shadow-glow: `0 0 60px rgba(59,130,246,0.15)`

**Border radii**

- --radius: 12px
- --radius-lg: 16px
- --radius-xl: 24px
- Buttons / pills: 9999px (full rounded)

---

## 3. Breakpoints and layout

| Breakpoint | Min width | Container max-width | Section padding (x) | Notes |
|------------|-----------|----------------------|--------------------|------|
| Default | 0 | 100% | 1rem (16px) | Single column, stacked |
| sm | 640px | 100% | 1.5rem (24px) | Same |
| md | 768px | 1024px (max-w-4xl / 2xl where used) | 1.5rem | Nav links visible, hero larger |
| lg | 1024px | 1152px (max-w-6xl) nav | 2rem (32px) | More spacing |
| xl | 1280px | 1152px | 2rem | Hero text-7xl |
| 2xl | 1440px | 1152px | 2rem | Same |

- **Nav:** Fixed top, h-16 (64px), max-w-6xl centered, px-4 sm:px-6 lg:px-8.
- **Hero:** min-h-[85vh], centered, pt-24 pb-16.
- **Sections:** py-20 or py-24, same horizontal padding as container.
- **Message card:** max-w-4xl, inner p-6 md:p-8.
- **FAQ / CTA:** max-w-2xl centered.

---

## 4. Animations

### 4.1 On-load (hero / nav)

| Element | Trigger | Duration | Easing | Delay | Transform / opacity |
|---------|--------|----------|--------|-------|----------------------|
| Hero headline | mount | 600ms | cubic-bezier(0.16, 1, 0.3, 1) | 100ms | opacity 0→1, translateY 24px→0 |
| Hero subline | mount | 600ms | cubic-bezier(0.16, 1, 0.3, 1) | 250ms | opacity 0→1, translateY 20px→0 |
| Nav link (each) | mount | 400ms | cubic-bezier(0.16, 1, 0.3, 1) | 100ms × index | opacity 0→1, translateY -8px→0 |

### 4.2 Scroll-driven (nav)

| Element | Trigger | Scroll range | Output |
|---------|--------|--------------|--------|
| Nav background | scrollY | 0→80px | backgroundColor rgba(10,10,10,0)→rgba(10,10,10,0.92) |
| Nav | — | — | backdrop-blur-xl (constant when sticky) |

### 4.3 In-view (sections)

| Element | Trigger | Duration | Easing | Delay | Values |
|---------|--------|----------|--------|-------|--------|
| Message section labels | inView (once, margin -80px) | 500ms | cubic-bezier(0.16, 1, 0.3, 1) | 0 | opacity 0→1, translateY 20→0 |
| Message card container | inView | 600ms | cubic-bezier(0.16, 1, 0.3, 1) | 100ms | opacity 0→1, scale 0.98→1 |
| Each message bubble | inView | 400ms | cubic-bezier(0.16, 1, 0.3, 1) | 150ms + 80ms×index | opacity 0→1, translateX ±12px→0 |
| Message footer line | inView | 400ms | — | 800ms | opacity 0→1 |
| FAQ title | inView | 500ms | cubic-bezier(0.16, 1, 0.3, 1) | 0 | opacity 0→1, translateY 16→0 |
| FAQ items | inView | 400ms | cubic-bezier(0.16, 1, 0.3, 1) | 100ms×index | opacity 0→1, translateY 12→0 |
| CTA block | inView | 600ms | cubic-bezier(0.16, 1, 0.3, 1) | 0 | opacity 0→1, translateY 20→0 |
| CTA button | inView | 400ms | — | 200ms | opacity 0→1, translateY 8→0 |

### 4.4 Hover / tap

| Element | Trigger | Duration | Easing | Values |
|---------|--------|----------|--------|--------|
| CTA button | hover | — | — | scale 1.02 |
| CTA button | tap | — | — | scale 0.98 |
| Nav links | hover | — | — | color muted→fg (transition-colors) |
| FAQ button | — | 200ms | — | rotate chevron |

### 4.5 Scroll progress (QA mode only)

| Element | Trigger | Scroll range | Output |
|---------|--------|--------------|--------|
| Progress bar | scrollYProgress | 0→1 | width 0%→100% (fixed top bar) |

### 4.6 Reduced motion

- `prefers-reduced-motion: reduce` in globals.css sets animation-duration and transition-duration to 0.01ms and iteration-count 1 so scroll-tied and in-view motion are effectively disabled; opacity/visibility can still update for accessibility.

---

## 5. QA mode (?debug=1)

- **Section boundaries:** Sections get class `qa-section-outline` (dashed blue outline).
- **Baseline grid:** Full-viewport overlay with class `qa-baseline` (repeating 8px horizontal lines, subtle blue).
- **Scroll progress:** Fixed top bar (4px height) showing scroll progress; width driven by `scrollYProgress` 0→1.

---

## 6. Assets

- **Fonts:** Inter via next/font (Google). No hotlinked Rid assets.
- **Images:** Message section uses placeholder “Sneakers” block (same aspect ratio as reference); logo is wordmark “Listd” only.
- **Favicon:** Local favicon.ico in public/ (Listd branding).

---

## 7. Brand swap

- All “Rid” → “Listd” (logo, meta title/description, OG tags, FAQ, CTA copy).
- “Get Rid of something” → “Get Listd of something.”
- All other copy unchanged except where the product name appears.
