# Design Changelog

Reverse-chronological log of meaningful design changes. One entry per push to the
implementation repo. Keep entries terse — what changed, why, what it implies for
engineering, what's blocked.

Format:

```
## YYYY-MM-DD — <one-line summary>

**Surface(s):** dashboard / landing / cli / comparison / system

**Changed**
- bullet list of concrete changes

**Implementation notes**
- props / states / API shapes the change implies
- divergences from the upstream Svelte source, if any

**Open**
- unresolved questions, blocked items
```

---

## 2026-04-28 — Tweaks panel cleanup; first formal handoff

**Surface(s):** dashboard, system

**Changed**
- **Removed all decorative effects from the Tweaks panel.** Compaction pulse and
  CRT scanlines are gone — both were ornamental and competed with real signal in a
  tool that's supposed to be utilitarian. The Effects section no longer exists.
- Removed Berkeley Mono from the mono-font radio. It's a paid font, was never loaded,
  and was silently falling back to Plex — the toggle did nothing for that option.
- Added inline hint text under the Mono Font radio explaining it affects only
  monospace text (values, IDs, code).
- New `handoffs/` directory with naming convention, lifecycle docs, and the first
  handoff folder: `handoffs/2026-04-28-dashboard-v1/`. SYNC.md updated.

**Implementation notes**
- Tweaks now: accent (signal color), mono font, density. Three knobs, all functional,
  none decorative. Don't add ornamental tweaks back — the design system is the
  utilitarian center.
- Handoff folders are read-only once committed; revisions get a new dated folder.

---

## 2026-04-28 — Bloomberg Terminal direction locked; dashboard v1

**Surface(s):** dashboard, landing, cli, comparison, system

**Changed**
- Visual direction locked to "Bloomberg Terminal re-skin": dense monospace, amber
  signal color, hard-edged panel chrome, no rounded corners on data surfaces.
- `colors_and_type.css` rewritten as the canonical token sheet for both this folder
  and the real app. Variables: `--bg-0..3`, `--ink..ink-3`, `--border`,
  `--signal-amber/green/red/cyan/violet`, `--font-mono`, `--font-sans`, density tiers.
- Dashboard mock built out across six stacked panels in `ui_kits/dashboard/`:
  STRAT (context stratigraphy), ECON (token economics), TOOLS (tool effectiveness),
  CMPCT (compaction analytics), AGENTS (subagents), RAW (raw-data explorer).
- Per-tool and per-model rows are click-to-expand, revealing the full call list
  with latency / cost profile bars and failure annotations.
- Live tweaks panel exposes accent, monospace family, and density as
  user-toggleable knobs.
- Logo + wordmark drafted in `assets/`.

**Implementation notes**
- Real app should import `colors_and_type.css` directly rather than redefining
  tokens. If this isn't acceptable, we need a token-export pipeline.
- Each panel maps 1:1 to an upstream Svelte view (TokenEconomics, ToolEffectiveness,
  Compaction, Subagents, FailureAnalysis). Component names in the mock match.
- Expandable rows are a new pattern not present upstream. Engineering decision:
  add to the real `ToolEffectivenessView` and `TokenEconomicsView`, or keep
  expansion design-only?
- The "RAW DATA EXPLORER" is a new panel without an upstream equivalent. Lower
  priority; can ship without it.

**Open**
- Confirm token-import strategy with engineering.
- Animation for compaction pulse: currently CSS keyframes. Real app uses no motion
  beyond `transition-colors` — is the pulse acceptable or should it be removed?
- Mock fixture data shape is in `ui_kits/dashboard/analytics-data.js`. Diff against
  the real loader output and reconcile field names before handing off.

---

## Template entry

```
## YYYY-MM-DD — <summary>

**Surface(s):**

**Changed**
-

**Implementation notes**
-

**Open**
-
```
