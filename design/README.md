# Facies Design System

> Context window stratigraphy. Session analytics for Claude Code.

This is the design system folder for **Facies** — a local-only forensic web tool that reads Claude Code session data from `~/.claude/` and presents it as an interactive dashboard. Facies decomposes the context window into its constituent layers (system / user / assistant / tool results / compacted summary) and renders them as charts, tables, and a session DAG.

The brand metaphor is **geological stratigraphy**: each Claude Code session builds invisible *layers* over time, with compaction events cutting across like *unconformities*. "Facies" itself is a geological term for the distinctive observable character of a rock unit — applied here to context window regions.

---

## Sources

This system was reconstructed from the upstream Facies repository. The reader may not have access; record everything we used:

- **Repo:** `github.com/ealt/facies` @ `main`
- **Key files referenced:**
  - `src/app.css` — full shadcn-svelte default theme (OKLCH neutral) + dark mode
  - `src/app.html` — `<html class="dark">` (dark by default)
  - `src/lib/components/layout/Header.svelte` — top bar with `Facies` wordmark
  - `src/lib/components/views/*` — view components (OverviewDashboardView, ContextWindowView, TokenEconomicsView, CompactionView, ToolEffectivenessView, ConversationView)
  - `src/lib/components/charts/*` — D3 / LayerCake chart family
  - `src/lib/components/home/SessionTable.svelte` — sortable / groupable session table
  - `docs/facies-naming.md` — full naming rationale + geological glossary
  - `STYLE_GUIDE.md` — code formatting (does NOT cover visual design)
  - `AGENTS.md` — repo overview
  - `package.json` — Svelte 5 + SvelteKit + shadcn-svelte + Tailwind 4 + D3 + LayerCake

There are **no design files** (Figma, Sketch) in the upstream repo. There is **no logo** — the brand surfaces as the wordmark `Facies` in the header.

---

## Index

| File / folder | Purpose |
|---|---|
| `README.md` | This file — context, content, and visual fundamentals |
| `SYNC.md` | **Round-trip workflow.** How design and code stay in sync. Read first if you're a new contributor. |
| `CHANGELOG.md` | Reverse-chronological log of design decisions. Update on every meaningful push. |
| `SKILL.md` | Agent skill manifest — invoke-able as `facies-design` |
| `colors_and_type.css` | Token foundations — colors, typography, radii, shadows. Canonical for both design and code. |
| `assets/` | Logo lockup, favicon, category swatch SVGs |
| `fonts/` | (System / web fonts — Facies uses Tailwind defaults) |
| `preview/` | Design-system review cards (one per atomic concept) |
| `ui_kits/dashboard/` | High-fidelity, interactive HTML mock of the Facies dashboard |
| `landing.html` | Marketing site mock |
| `cli_mocks.html` | Terminal output mocks in the same visual language |
| `comparison.html` | Two-session side-by-side comparison view |
| `snapshots/` | Frozen, self-contained HTML exports for stakeholder review milestones |
| `explorations/` | Discarded directions kept for reference (not canonical) |

There are no slide templates or marketing surfaces in the upstream — only the dashboard. We ship one UI kit (`dashboard`).

---

## Content fundamentals

Facies is **technical, precise, scientific** — its own naming doc says so. Copy is dense, factual, and terse. There is no marketing voice, no exclamation points, no emoji, no "Welcome!" framing. The product assumes a developer audience that already knows Claude Code.

### Voice & tone

- **Forensic, not friendly.** Copy reports findings. It does not coach, congratulate, or apologize.
- **Geological metaphor used selectively.** The product itself is named for a geological concept, but the UI surfaces don't lean on it — labels are direct domain terms (`Tool Results`, `Compacted Summary`, `Cache Hit Rate`, `Latency vs Input Tokens`).
- **Second-person rare.** Most copy is third-person / declarative. "No sessions match the current filters." not "You have no sessions."
- **No filler.** Empty states are one short sentence, not an illustration + paragraph.

### Casing

- **Title Case** for view names, tab labels, chart titles: `Token Economics`, `Context Window`, `Cumulative Cost`, `Cache Efficiency`, `Per-Model Breakdown`.
- **lowercase** in inline help and footnotes: `~estimated breakdown`, `Some API calls used unknown models`.
- **Sentence case** for warnings: `Partial data — 4 malformed lines skipped. Session may be in progress or incomplete.`
- **MONOSPACE** for any value the user might paste back into a query: model strings, session IDs, token counts in tables.

### Pronouns

- Avoid `I`. Avoid `we`. The product has no persona.
- Use `you` only when describing setup steps in docs (`Open http://localhost:5173`).

### Em dashes & punctuation

- `—` (em dash) for parenthetical clauses in metadata: `Partial data — 4 malformed lines skipped`.
- `·` (middle dot) as a separator in dense rows: `claude-3-5-sonnet · 12s · 4.2M tokens · $0.34`.
- `→` for transitions: `1.2M → ~340K` (compaction marker).
- `~` prefix on estimated values: `~Tokens`, `~estimated breakdown`, `~340K`.

### Specific examples (lifted verbatim from the codebase)

- `Filter sessions... (e.g. total_tokens > 1M AND project = "my-app")`
- `~estimated breakdown` — in a `<span title>` next to `Context Window Composition`
- `Partial data — 4 malformed lines skipped. Session may be in progress or incomplete.`
- `Some models have unknown pricing and are not shown in the treemap.`
- `Saved by Caching` — metric label
- `Avg Cost/Turn` — metric label, slash for "per"
- `No data` / `No sessions match the current filters.` — empty states
- Table sort indicators: ` ▲` / ` ▼` (Unicode triangles, leading space)

### Numbers & units

- Tokens: `1.2M`, `340K`, raw integer for `< 1000` (`712`).
- Cost: `$1.23`, `$0.043`, `$0.0021` — precision adapts to magnitude.
- Duration: `12s`, `4m`, `1.3h`.
- Time-since: `5m ago`, `2h ago`, `3d ago`, `Mar 12 14:22` past one week.
- Percent: one decimal — `87.4%`.

### Emoji & icons

- **No emoji anywhere.** Not in copy, not in the UI.
- **No unicode pictographs.** Triangles for sort indicators (`▲ ▼`) and middle dots / arrows for separators are the only non-ASCII chars used.
- Icons are tiny inline SVGs — see Iconography.

---

## Visual foundations

Facies is built on the shadcn-svelte default theme. It is fundamentally a **dark, low-saturation, dense, dashboard** aesthetic. No gradients, no decorative imagery, no motion beyond interaction feedback. The visual character is Bloomberg Terminal × Chrome DevTools × a stratigraphic column diagram.

### Color

- **OKLCH-defined neutrals** with a near-grayscale palette. Backgrounds: `oklch(0.145 0 0)` (dark) / `oklch(1 0 0)` (light). Foreground inverts.
- **`<html class="dark">` is the default** — design dark first.
- **Semantic accent**: `destructive` is the only chromatic role at the foundation level, set to a desaturated red `oklch(0.396 0.141 25.723)`.
- **Chart palette is separate** from the foundation palette and uses Tailwind's named hex colors:
  - `system` → `#6b7280` (slate gray)
  - `user` → `#3b82f6` (blue)
  - `assistant_text` → `#22c55e` (green)
  - `assistant_thinking` → `#9ca3af` (light gray)
  - `tool_results` → `#f97316` (orange)
  - `subagent_overhead` → `#a855f7` (purple)
  - `compacted_summary` → `#f59e0b` (amber)
  - `compaction marker` → `#ef4444` (red, dashed line)
- **Project colors** come from `d3.schemeTableau10` — assigned in sorted order so a project always gets the same color across charts in one view.
- Chart fills sit at `opacity: 0.6 – 0.85`. Compaction lines at `opacity: 0.7`. Hover guidelines at `opacity: 0.4`.

### Typography

- **Sans:** Tailwind's default `ui-sans-serif, system-ui, sans-serif`. No custom display face.
- **Mono:** Tailwind's default `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, ...`. Used for: model names, session IDs, token counts in dense tables, the query input, code-like badges.
- **Sizes are utilitarian:** `text-xs` (12px) is the workhorse — table cells, axis ticks, legends. `text-sm` (14px) for default body. `text-lg` (18px) for metric values. `text-[10px]` and `text-[9px]` for chart labels and footnotes. The wordmark in the header is `text-lg font-semibold tracking-tight`.
- **Weight:** mostly `font-medium` (500) for labels, `font-semibold` (600) for KPIs, regular for body.
- **No display typography.** No drop caps, no all-caps banners.

### Layout & spacing

- **Tailwind 4 spacing scale**, used as-is. Cards padded `p-3` (small KPI tiles) or `p-4` (chart containers).
- **Grid for KPI rows:** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` — collapses to 2 cols on phones.
- **Gaps:** `gap-3` between dense KPIs, `gap-4` between chart cards.
- **Top bar height fixed at `h-12`** with `border-b border-border`, no shadow.
- **Page padding `p-6`** (`24px`) — comfortable but not generous.
- The dashboard is a **fixed left sidebar + top header + scrollable main**, but the home view drops the sidebar and uses the full width.

### Borders, radii, shadows

- **Radii:** `--radius: 0.625rem` (10px). Cards use `rounded-lg`. Pills/badges `rounded-md` or `rounded`. Color swatches `rounded-sm` (2px). The dot in legend rows uses `rounded-full` only when it's a true dot.
- **Borders:** 1px `--border` (`oklch(0.269 0 0)` in dark) on every card, every divider, every input. The visual rhythm of the entire UI is **borders, not shadows**.
- **Shadows:** essentially none on cards. `shadow-lg` only on tooltips and floating menus (e.g. the Columns dropdown). No drop shadows on KPIs, charts, or chrome.

### Backgrounds

- **Solid `var(--background)` everywhere.** No gradients, no patterns, no images, no textures.
- Rare semi-transparent fills used for hover/select state: `bg-muted/30`, `bg-primary/10`, `bg-yellow-500/10`.
- Tooltip cards use `bg-card/95` + `backdrop-blur-sm` — the **only** use of blur in the UI.

### Animation

- **None beyond `transition-colors`** (200ms default) on hover/active. No fades, no slides, no bounces, no springs, no view transitions.
- Charts redraw imperatively via D3 + `$derived`, not animated.
- The aesthetic asks for instant, mechanical feedback — never "delightful" motion.

### Hover & press

- **Hover:** background drops in by one tier — `hover:bg-muted/30` on rows, `hover:bg-muted` on buttons/menu items, `hover:text-foreground` on icon buttons that were `text-muted-foreground` at rest. No scale, no lift.
- **Press:** no scale, no shadow change. The active tab uses `bg-primary/20 font-medium text-foreground`.
- **Focus:** `focus:outline-none focus:ring-2 focus:ring-ring` on inputs; rings are subtle (low-chroma).

### Cards

A "card" in Facies is just `rounded-lg border border-border bg-card p-3` (or `p-4`). No shadow. No hover lift. They are containers for charts and tables, not affordances.

### Data viz idioms

- **Stacked area** for context composition over time, with `curveMonotoneX`.
- **Stacked bars** for the per-API-call incremental view.
- **Treemap** for session token distribution.
- **Gantt-style block timeline** for sessions across time, with collapsed dead-time gaps shown as dashed vertical separators.
- **Scatter** for latency vs input tokens.
- **Compaction events** are always rendered as dashed red vertical lines with `→` token-count labels.

### Transparency, layering, z-stack

- The only layered effects are: tooltip popovers (with backdrop-blur), dropdown menus, and the "Warnings" / "Partial data" alert banners (yellow / orange-tinted backgrounds at 10% opacity).

### Layout rules (fixed elements)

- `<html class="dark">` at the root.
- `<header class="h-12 border-b border-border">` is always 48px tall.
- Main content is `overflow-auto p-6` inside `flex-1`.
- The home page does not have a sidebar; session detail does (a `<select>` on mobile, tabs on desktop).

---

## Iconography

Facies is **anti-icon**. There is no icon font, no icon library, no Lucide / Heroicons / Phosphor in the dependencies. The codebase contains **inline SVG** in exactly two places:

1. The header back-arrow on session detail — a hand-rolled 16×16 chevron-left at `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. This is a deliberate Lucide-style stroke icon.
2. Sort indicators in tables — Unicode `▲` / `▼`.

For new work in this style, **use Lucide** as the substitution. It matches the existing chevron's stroke weight and style exactly. We provide a CDN link via `assets/icons/README.md`.

- **No emoji.** Emoji is forbidden in this brand.
- **No raster icons.** Inline SVG only.
- **No filled icons.** Stroke-only, 1.5–2px weight.

We have copied no icons from the repo because there are none beyond the chevron — we recreate that one in `assets/`.

---

## Substitutions flagged

- **Fonts:** Facies ships no custom webfonts; it relies on the system stack (`ui-sans-serif`, `ui-monospace`). Nothing to substitute. If a user wants a more distinctive feel, **JetBrains Mono** or **IBM Plex Mono** would match the forensic vibe; **Inter** would not (too soft) — try **Geist** instead.
- **Icons:** Repo has no icon set; we substitute **Lucide** (CDN link in `assets/icons/`). FLAGGED — please confirm if you'd prefer Heroicons or Phosphor.
- **Logo:** Repo has no logo file. We provide a wordmark-only treatment in `assets/logo.svg`. FLAGGED — replace if a real mark exists.

---

## Open questions for you

1. **Logo** — there is no logo in the repo. Do you have one? Should we commission a wordmark + a stratigraphic-column glyph?
2. **Marketing site** — is there one planned? If yes, we should add a `ui_kits/marketing/` surface.
3. **Light mode** — the theme defines it but the app forces `dark`. Is light mode a real surface or vestigial?
4. **Iconography** — Lucide is our default substitution. Confirm or swap.
