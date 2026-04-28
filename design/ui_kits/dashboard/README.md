# Facies Dashboard — UI Kit

Pixel-grade recreation of the Facies dashboard, a forensic browser for Claude Code session data. Two screens, fully clickable:

- **Overview** — KPI tiles, query input, sortable/clickable session table.
- **Session Detail** — Stratigraphy chart (stacked area + compaction "unconformity"), token waterfall, tabbed message/tool ledger.

## Files

- `index.html` — entry point. Loads CSS from `../../colors_and_type.css` and the SVG mark from `../../assets/`.
- `data.js` — mock sessions + context snapshots, formatting helpers, category color/label maps. Exposed as window globals.
- `Charts.jsx` — `StratigraphyChart`, `TokenWaterfall`. SVG-based, no chart lib.
- `Header.jsx` — App chrome with breadcrumb and session pill.
- `Overview.jsx` — `KpiTiles`, `QueryBar` (with simple parser + error state), `SessionTable` (sortable, hoverable, clickable).
- `SessionDetail.jsx` — Stratigraphy + waterfall + stats grid + tabbed body.
- `App.jsx` — Two-view router (overview ↔ detail).

## Notes

The chart uses real-feeling SVG data; the snapshot generator simulates a single compaction event partway through. Colors map directly to the brand's stratigraphic category palette.

Numeric formatting is exact (cost) vs. abbreviated (tokens) — the same convention the real dashboard uses. Cost may be `N/A` when a model lookup is missing; we display `$0.00` here only because mock data is complete.
