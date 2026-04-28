# Iconography

Facies has **no icon library** in its codebase. The only inline SVGs in the repo are:

1. The header back-arrow (chevron-left, `stroke-width="2"`, Lucide-style).
2. Sort indicators using Unicode `▲` `▼`.

## Substitution: Lucide

We use [**Lucide**](https://lucide.dev) as the official icon set for new design work in this style. It matches the existing chevron's stroke weight (1.5 / 2px), `stroke-linecap="round"`, `stroke-linejoin="round"`.

CDN:
```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

Or use individual SVGs from `https://lucide.dev/icons/`.

## Rules

- **Stroke only.** No filled icons.
- **1.5 – 2px stroke.** No hairlines, no chunky strokes.
- **16×16 or 24×24** at 1:1.
- **`currentColor`** for stroke. Tinted icons (e.g. category swatches) are fills, not strokes.
- **No emoji. No Unicode pictographs** beyond the `▲ ▼` sort indicators.
