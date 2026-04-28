# Handoff — Dashboard v1

**Date:** 2026-04-28
**Surface:** Facies session dashboard (Overview, Project View, Session Detail, Analytics, Raw Data Explorer)
**Snapshot:** `../../snapshots/2026-04-28-dashboard-v1.html`
**Mock (frozen):** `./mock/index.html`

This is the first formal handoff for the Facies dashboard. Engineering should
implement the surfaces below from the frozen mock in `./mock/`. The mock is
working JSX — read the components directly to lift exact values rather than
inferring from screenshots.

---

## 1. Surface

The dashboard is a single-page app with five top-level views:

1. **Overview** — list of all sessions with a query bar and KPI strip.
2. **Project View** — drill-down for one project: file heatmap, sessions, costs.
3. **Session Detail** — one session: KPIs, message thread, subagents, compaction inspector.
4. **Analytics** — token economics, tool effectiveness, compaction analysis (3 panels).
5. **Raw Data Explorer** — virtualized list of API call records with collapsible rows.

Navigation is keyboard-driven (arrow keys, `/` for search, `Enter` to drill in,
`Esc` to go back). See `mock/KeyboardController.jsx`.

## 2. Scope & non-goals

**In scope:**
- All five views above, fully composable.
- Tweaks panel (signal color, mono font, density, effects) — runtime preferences.
- Compaction Inspector overlay (modal showing pre/post tokens, summary, file deltas).
- Query bar grammar: `field:value`, `field>value`, `field<value`, free-text.

**Out of scope (defer to v2):**
- Saved views / shareable URLs.
- Real-time updates / websocket.
- Export to CSV.
- Multi-session comparison (separate `comparison.html` mock; will get its own handoff).
- Settings / auth / org switcher.

## 3. Data shape

Fixture data lives in `mock/data.js`, `mock/analytics-data.js`, `mock/thread-data.js`,
`mock/compaction-data.js`, `mock/project-data.js`. Treat these as the contract:

- `Session` — id, title, project, model, startTime, costs, tokens, compactionRatio.
- `ApiCall` — index, fresh/cacheRead/cacheWrite/output token counts, latency, cost,
  toolCalls.
- `Compaction` — apiCallIndex, preTokens, postTokens, summaryTokens, durationMs.
- `ThreadEvent` — discriminated union: user, assistant, assistant_thinking, tool,
  subagent, compaction, finding.

The real loader should produce these shapes; the analyzer functions in `data.js`
(`computeTotals`, `computeRecoveryTurns`, etc.) lift cleanly into the backend.

## 4. Layout

| Element        | Spec                                                            |
|----------------|-----------------------------------------------------------------|
| Sidebar        | 220px fixed, dark bg-1, rule between sections.                  |
| Main column    | flex: 1, min-width 880px (analytics charts assume this).        |
| Header strip   | 56px, sticky, contains breadcrumb + KPI tiles.                  |
| Panel          | 1px border, no rounding, `panel-head` 32px high, `panel-body` 12px pad. |
| Modal overlay  | Compaction Inspector — full-viewport backdrop, max-width 880px. |

Density is configurable via `body[data-density]` (compact/regular/comfy) — only
vertical padding scales; column widths are fixed.

## 5. Tokens

All colors and type are in `../../colors_and_type.css`. **Do not introduce new
colors.** Notable tokens:

- Backgrounds: `--bg-1` (page), `--bg-2` (panel), `--bg-3` (raised inputs).
- Ink: `--ink` (primary), `--ink-2`, `--ink-3` (descending emphasis).
- Signals: `--signal-amber` (default accent), `--signal-cyan`, `--signal-green`,
  `--signal-red`, `--signal-purple`.
- Type: `--font-sans` (IBM Plex Sans), `--font-mono` (IBM Plex Mono).
- Spacing: `--tracked` (uppercase labels), `--tracked-tight` (numerics).

Accent override is `body[data-accent]` (amber/cyan/magenta/lime).

## 6. Interactions

| Action                                   | Result                                              |
|------------------------------------------|-----------------------------------------------------|
| Click session row                        | Open Session Detail.                                |
| Click project pill (amber)               | Open Project View, filter to that project.          |
| Click compaction divider in thread       | Open Compaction Inspector overlay.                  |
| `/` in any view                          | Focus query bar.                                    |
| Type `field:` in query bar               | Show suggestions for that field's values.           |
| Arrow keys in any list                   | Move keyboard cursor; row highlights.               |
| `Enter` on cursor row                    | Drill into that row's detail.                       |
| `Esc`                                    | Pop one navigation level.                           |
| Click subagent row                       | Expand to show child tool calls + final response.   |

Tweaks panel state persists via the host's `__edit_mode_set_keys` protocol; in the
real app, store as user prefs on the org/user record.

## 7. Edge cases

| State            | Treatment                                                  |
|------------------|------------------------------------------------------------|
| Empty session list | "No sessions match." Centered ink-3, no illustration.    |
| Loading          | `mock/States.jsx` — block-fill skeleton lines, mono. No spinners. |
| Error            | `E0xx` prefix + plain-text error in `--signal-red`. See `States.jsx`. |
| Compaction with `null` ratio | Render "—" not "0%". Compaction may not have happened. |
| Long file paths in heatmap   | Ellipsis at left ("…/very/long/path.ts"), full path in title. |
| API call with no tool calls  | Hide the tool column; don't show empty cells.   |

## 8. Fidelity

**Pixel-exact in the mock:**
- All token values (colors, font sizes, line heights, paddings).
- All component structure and naming (translate JSX → your framework directly).
- The KPI strip layout and value formatting (`fmtTokens`, `fmtCost` in `data.js`).
- All chart types and their visual rules (flat fills, no rounding, mono labels).

**Illustrative in the mock:**
- Fixture data values themselves (timestamps, project names, costs).
- The exact set of fields surfaced — these will tighten as we learn what users want.
- Subagent rendering — depth limit is hardcoded to 1 in the mock; real app needs N.

## 9. Open questions

1. **Token sheet sharing** — should `colors_and_type.css` be imported directly into
   the real app (single source), or duplicated and manually synced? Open since 2026-04-15.
2. **Density and accent persistence** — runtime tweak now; should they become user
   preferences? Likely yes.
3. **Compaction Inspector "rebuild summary" action** — the button is in the mock but
   wired to nothing. Spec needs the backend contract for triggering a re-summarization.
4. **Raw Data Explorer pagination** — virtualized in the mock; need to confirm
   real-app data volume. Could be 1k-100k rows.

---

## Notes on running the mock

The mock is a static HTML file — open `mock/index.html` in any modern browser. No
build step. React + Babel are loaded from the page directly so JSX transpiles
in-browser. Tweak panel toggles persist via the design tool's edit-mode protocol; in
isolation those persist to no-op handlers, which is fine.

Tweaks: the panel exposes signal color, mono font (Plex / JetBrains Mono only —
Berkeley Mono is paid and not loaded), and density. No decorative effects — this is
a utilitarian tool. The mono swap intentionally only affects monospace text —
values, IDs, code, file paths — not the sans labels.
