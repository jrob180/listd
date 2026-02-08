# Listd — Landing Page

Pixel-perfect recreation of [rid.me](https://rid.me/) as a single-page landing for **Listd**. Built with Next.js (App Router), TypeScript, TailwindCSS, and Framer Motion.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## QA / Debug Mode

Append `?debug=1` to the URL to show:

- Section boundaries (dashed outlines)
- Baseline grid overlay
- Scroll progress bar at the top

Example: `http://localhost:3000?debug=1`

## Project structure

- `app/page.tsx` — Main landing page (client component with sections)
- `app/layout.tsx` — Root layout, metadata, fonts
- `app/globals.css` — Design tokens and global styles
- `components/` — Nav, Hero, MessageSection, FaqSection, CtaSection, QaOverlay
- `public/` — Static assets (add images here; no hotlinked Rid assets)
- `PARITY_CHECKLIST.md` — Typography, colors, breakpoints, and animation specs for parity with Rid

## Tech stack

- **Next.js 15** (App Router) + TypeScript
- **TailwindCSS** for layout and tokens
- **Framer Motion** for on-load, in-view, and scroll-driven animations
- **next/font** (Inter) for typography
- **next/image** ready for local images in `public/`

## Brand

All on-page and meta “Rid” references are replaced with “Listd”. Copy, layout, and behavior otherwise match the reference.

## Reduced motion

`prefers-reduced-motion: reduce` is respected: animations are minimized (duration → 0.01ms, single iteration) so the page remains usable.
