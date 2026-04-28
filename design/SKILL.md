---
name: facies-design
description: Use this skill to generate well-branded interfaces and assets for Facies (context window stratigraphy / Claude Code session analytics), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map

- `README.md` — Brand overview, content fundamentals, visual foundations, iconography.
- `colors_and_type.css` — Drop-in CSS variables. Class `.dark` on `<html>` flips to dark theme (the canonical look).
- `assets/` — `logo-mark.svg`, `logo-lockup.svg`, `wordmark.svg`. No raster logos — the mark is geological strata.
- `fonts/` — Empty by design. Stack is system-sans + system-mono (`ui-monospace, JetBrains Mono`); no webfonts loaded.
- `ui_kits/dashboard/` — Pixel-grade React recreation of the dashboard. Read components before designing new ones.
- `preview/` — 21 design-system specimen cards (colors, type, components, voice). Reference, don't copy verbatim.

## Non-negotiables

- Dark canvas (`oklch(0.145 0 0)`) is the default. Light theme exists in tokens; ship dark unless told otherwise.
- Borders structure the UI; shadows are reserved for floating chrome (popovers, tooltips). Don't decorate cards with shadows.
- Mono font for: tokens, costs, IDs, model names, query input, axis labels. Sans for headings and prose.
- Tone is forensic. No emoji, no exclamation points, no second-person warmth. Examples in `README.md`.
- Iconography: Lucide-style stroke icons at 1.5–2px. No filled icons, no hand-drawn SVG illustration.

## When the user is fuzzy

Ask whether they want: (a) a new dashboard surface (extend `ui_kits/dashboard/`), (b) a marketing/docs page (no kit yet — propose typography-led layout), or (c) a slide/asset for an internal share-out. Confirm dark vs. light. Confirm whether real session-data shapes matter (point them at `ui_kits/dashboard/data.js`).
