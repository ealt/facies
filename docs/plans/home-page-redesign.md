# Home Page Redesign

## Context

Facies currently has a fixed sidebar listing sessions grouped by project, plus a home page that buries session discovery below aggregate stats and charts. The user wants a proper home page with a powerful interactive table (grouping, filtering, sorting, SQL-like queries), rich visualizations that react to filters, and clean navigation back from session detail pages.

**Data contract:** The home page receives `SessionSummary[]` from the layout server load. This is precomputed per-session data from the session index cache. The redesign stays within this data contract — no per-call or per-turn time series is available on the home page. Charts that show data over time must step at session-level granularity (using `startTime`, `endTime`, `durationMs`, and per-session totals).

## Layout

```txt
┌────────────────────────────────────────────────────────────┐
│  Facies                                          (header)  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─ Query Bar ───────────────────────────────────────────┐ │
│  │ total_tokens > 1M AND project = "my-app"              │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Charts ──────────────────────────────────────────────┐ │
│  │ Session Timeline    │  Cumulative Tokens + Cost       │ │
│  │ (bars, gap-collapsed│  (step chart at session         │ │
│  │  color=project)     │   boundaries)                   │ │
│  ├─────────────────────┴─────────────────────────────────┤ │
│  │ Token Treemap                                         │ │
│  │ (area=tokens, grouping follows table grouping)        │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Table ─────────── [Columns ▾] [Group by ▾] ──────────┐ │
│  │ (summary) │  —    │  —   │ 24 sessions │ 4.2M  │ $12  │ │
│  ├───────────┼───────┼──────┼─────────────┼───────┼──────┤ │
│  │ Title     │ Proj  │ Model│ Started     │ Tokens│ Cost │ │
│  │ Title     │ Proj  │ Model│ Started     │ Tokens│ Cost │ │
│  │ ...                                                   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

Natural page scroll — charts on top, table below at full height.

## 1. Remove sidebar, fix layout for natural scroll, add back-navigation

**`src/routes/+layout.svelte`** — Remove `<Sidebar>` import and rendering. Change the layout's overflow strategy: the current shell uses `h-screen` + `overflow-hidden` on the outer div, with `overflow-auto` on `<main>`. For the home page, the outer div should not constrain height — allow natural document flow so the full page (charts + table) scrolls as one. For session detail pages, the existing `h-screen` + internal scroll is fine (keeps tabs visible). Use a derived `isHomePage` boolean to toggle between the two layout modes.

**`src/lib/components/layout/Header.svelte`** — On session detail pages (session prop non-null), show a back-arrow `<a href="/">` before session title. On home page, show "Facies".

**Delete `src/lib/components/layout/Sidebar.svelte`.**

## 2. Query bar

A text input at the top of the page for SQL-like filtering.

**Syntax:**

- Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `CONTAINS` (case-insensitive substring for strings)
- Combinators: `AND`, `OR`
- Value shorthands: `100M` = 100,000,000, `1K` = 1,000, `5m` = 5 minutes, `2h` = 2 hours
- String values in quotes: `project = "my-app"`
- Date literals: ISO date strings in quotes (`"2026-04-01"`, `"2026-04-01T12:00"`), or relative shorthands: `7d` (7 days ago), `2w` (2 weeks ago), `1mo` (1 month ago). Relative dates resolve to absolute timestamps at parse time. Timezone: local (matches `SessionSummary.startTime` which is ISO with offset).
- **Null semantics:** Fields that can be null (e.g., `cost`) treat null as "unknown." Note: `title` is never null at query time — its accessor falls back to `sessionId`. Comparisons against null always evaluate to **false** — `cost > 0` excludes sessions with null cost, `cost = 0` excludes null, `cost != 0` also excludes null. To explicitly test for null, use `cost = null` or `cost != null`.
- Real-time parse validation — red underline + hint on error

**Query schema:** The parser uses user-facing snake_case field names that map to typed `SessionSummary` accessors. This mapping is explicit:

```typescript
// src/lib/query/schema.ts
interface QueryField {
  key: string;                          // user-facing name
  accessor: (s: SessionSummary) => string | number | null;
  type: 'string' | 'number' | 'date';  // determines valid operators + parsing
}

const QUERY_SCHEMA: QueryField[] = [
  { key: 'title',         accessor: s => s.title ?? s.sessionId, type: 'string' },
  { key: 'project',       accessor: s => s.project,              type: 'string' },
  { key: 'model',         accessor: s => s.model,                type: 'string' },
  { key: 'started',       accessor: s => s.startTime,            type: 'date' },
  { key: 'duration',      accessor: s => s.durationMs,           type: 'number' },
  { key: 'turns',         accessor: s => s.turns,                type: 'number' },
  { key: 'total_tokens',  accessor: s => s.totalInputTokens + s.totalOutputTokens, type: 'number' },
  { key: 'input_tokens',  accessor: s => s.totalInputTokens,     type: 'number' },
  { key: 'output_tokens', accessor: s => s.totalOutputTokens,    type: 'number' },
  { key: 'cost',          accessor: s => s.totalCost,            type: 'number' },
  { key: 'compactions',   accessor: s => s.compactionCount,      type: 'number' },
  { key: 'tool_calls',    accessor: s => s.toolCallCount,        type: 'number' },
  { key: 'subagents',     accessor: s => s.subagentCount,        type: 'number' },
];
```

**Parser result:** The parser returns a structured result, not just a predicate:

```typescript
// src/lib/query/parser.ts
interface ParseSuccess {
  ok: true;
  predicate: (s: SessionSummary) => boolean;
  ast: QueryNode;  // for debugging / potential future use
}

interface ParseError {
  ok: false;
  error: string;       // human-readable message
  offset: number;      // character position of error
  length: number;      // span length for underline
}

type ParseResult = ParseSuccess | ParseError;
```

**Implementation:** `src/lib/query/parser.ts` — tokenizer + recursive descent parser + compiler. `src/lib/query/schema.ts` — field definitions and alias mapping. Unit tests in `tests/query/parser.test.ts` (following repo convention of tests under `tests/`).

## 3. Interactive table

**New file: `src/lib/components/home/SessionTable.svelte`**

Props: `{ sessions: SessionSummary[], groupBy: string | null, onGroupByChange: ... }`

**Features:**

- **Column visibility:** A "Columns" dropdown/popover with checkboxes. Default visible: Title, Project, Started, Total Tokens. Available: all columns defined in the query schema + any additional display columns.
- **Group by:** A "Group by" dropdown listing groupable columns (Project, Model). When grouped:
  - Rows collapse under group headers
  - Group headers show aggregates (see §3a below)
  - Groups are collapsible
  - Sort applies to group headers by aggregate, and within each group by the same column
  - The active groupBy value is communicated to the parent (OverviewDashboardView) so the treemap can follow it
- **Sort:** Click column header → desc. Click again → asc. Click different column → that column desc. Arrow indicator in header.
- **Summary row:** Fixed first row aggregating all filtered sessions using the same generic aggregation function as group headers.
- **Row click:** Navigates to `/session/{id}`.

### 3a. Generic group aggregation

**New file: `src/lib/analysis/group-aggregator.ts`**

The existing `computeAggregateMetrics()` and `computeProjectBreakdown()` are purpose-built for the old dashboard and don't support arbitrary grouping by visible columns. A new generic aggregation function computes aggregates for any group of sessions across any set of columns:

```typescript
interface ColumnAggregate {
  column: string;
  value: string | number | null;   // the aggregated display value
  raw: number | null;              // raw numeric value for sorting (null for non-numeric)
}

function aggregateSessions(
  sessions: SessionSummary[],
  visibleColumns: ColumnDef[],
): ColumnAggregate[];
```

Aggregation rules per column type:

- **Numeric columns** (tokens, cost, duration, turns, compactions, tool_calls, subagents): **sum**
- **Started**: **most recent** (max)
- **Title**: count display ("N sessions")
- **Model**: if all same → show it, otherwise "N models"
- **Project**: if all same → show it, otherwise "N projects"
- **Cost**: sum, with `costIsLowerBound` propagation (if any session in group has it, group inherits it)

This function is used by both the summary row and group header rows.

## 4. Charts (react to query bar filters)

**Data flow:**

```txt
All sessions → query bar filters → filtered set → charts + table + summary row
```

### 4a. Session Timeline

**New file: `src/lib/components/charts/SessionTimeline.svelte`**

- X-axis: time. Each session is a horizontal rectangle from `startTime` to `startTime + durationMs`.
- Dead time (no session running) collapsed to a small fixed-width spacer with a subtle break indicator. Overlapping sessions stack vertically (Gantt-style lane assignment).
- Thickness (height): `total_tokens / durationMs` (normalized so area ∝ total tokens).
- Color: per project (consistent color mapping across all charts).
- Tooltips on hover: session title, project, duration, tokens, cost.

### 4b. Cumulative Tokens + Cost (session-level steps)

**New file: `src/lib/components/charts/CumulativeChart.svelte`**

Since the home page only has `SessionSummary[]` (no per-call time series), this chart works at **session granularity**:

- Sessions sorted by `endTime` (since attribution is at session completion).
- Cumulative input and output tokens computed as running sums across sessions in `endTime` order.
- Displayed as a **step chart** (stacked area with step interpolation): each session's tokens and cost appear as a discrete step at its `endTime` (reflecting completed spend, not started spend). Sessions without `endTime` (still in progress) are placed last, using current time as a stand-in.
- Second y-axis: cumulative cost as a step line overlaid on the same plot.
- Attribution note: tokens/cost are attributed to session `endTime` since that's when the spend is realized. This is a session-level approximation — within a session, spend accumulates gradually, but we don't have per-call timestamps on the home page.

### 4c. Token Treemap

**New file: `src/lib/components/charts/TokenTreemap.svelte`**

- Uses D3's `d3.treemap()` layout.
- Area = total tokens per session.
- Default: flat treemap of sessions (labeled by title, colored by project).
- When table is grouped (e.g., by project): treemap nests sessions inside project blocks. The outer rectangles are groups, inner are sessions.
- Color: per project (same mapping as timeline).
- `groupBy` prop received from parent, which tracks the table's active grouping.

### 4d. Shared project color mapping

**New file: `src/lib/analysis/color-map.ts`**

A single utility that assigns stable colors to project names, used by all three charts (timeline, cumulative, treemap). Takes the full list of projects and returns a `Map<string, string>` of project→color. Uses D3's `d3.schemeTableau10` (or similar categorical palette). The mapping is computed once in `OverviewDashboardView` and passed as a prop to each chart, ensuring consistent colors.

```typescript
function buildProjectColorMap(projects: string[]): Map<string, string>;
```

## 5. Home page assembly

**`src/routes/+page.svelte`** — Remove `<h1>`. Render `OverviewDashboardView`.

**`src/lib/components/views/OverviewDashboardView.svelte`** — Rewrite to compose: query bar, charts, table. Manages the shared state:

- `queryString` ($state) — raw query bar text
- `parseResult` ($derived) — structured parse result from parser
- `filteredSessions` ($derived) — sessions filtered by predicate (or all if parse error / empty query)
- `groupBy` ($state) — current grouping column (null = ungrouped)
- `visibleColumns` ($state) — set of visible column keys
- `sortKey` / `sortDir` ($state) — current sort

State flows down: query bar → filter → charts + table. GroupBy flows up from table → treemap.

## File changes

| File | Action | Description |
|------|--------|-------------|
| `src/routes/+layout.svelte` | Modify | Remove Sidebar, conditional scroll strategy |
| `src/routes/+page.svelte` | Modify | Remove `<h1>` |
| `src/lib/components/layout/Header.svelte` | Modify | Back-arrow on session pages, "Facies" on home |
| `src/lib/components/layout/Sidebar.svelte` | Delete | Replaced by home page table |
| `src/lib/query/schema.ts` | Create | Query field definitions, alias-to-accessor mapping |
| `src/lib/query/parser.ts` | Create | Tokenizer, recursive descent parser, compiler |
| `tests/query/parser.test.ts` | Create | Unit tests for parser |
| `tests/analysis/group-aggregator.test.ts` | Create | Unit tests for group aggregation |
| `src/lib/analysis/group-aggregator.ts` | Create | Generic group aggregation for table |
| `src/lib/analysis/color-map.ts` | Create | Shared project→color mapping utility |
| `src/lib/components/home/SessionTable.svelte` | Create | Interactive table with grouping, sorting, column visibility, summary row |
| `src/lib/components/charts/SessionTimeline.svelte` | Create | Gap-collapsed timeline, thickness=token density, color=project |
| `src/lib/components/charts/CumulativeChart.svelte` | Create | Step chart: cumulative tokens (stacked) + cost (line) at session granularity |
| `src/lib/components/charts/TokenTreemap.svelte` | Create | Treemap, area=tokens, nesting follows table grouping |
| `src/lib/components/views/OverviewDashboardView.svelte` | Rewrite | Compose query bar + charts + table, manage shared state |

## Existing code to reuse

- `SessionSummary` type from `src/lib/types.ts`
- D3 (`d3`) — scales, axes, treemap layout, time formatting, color schemes
- Existing chart patterns: SVG with `bind:clientWidth`, scales via `$derived`, margins as const, tooltips via `<title>`
- `computeProjectBreakdown()` from `src/lib/analysis/session-aggregator.ts` — useful for project-level color mapping (consistent project→color across charts), though not for table aggregation

## Verification

1. `npm run check` — TypeScript/Svelte compilation passes
2. `npm run dev` — Visual inspection:
   - Home page: query bar → charts → table with natural page scroll
   - Query bar parses and filters in real-time, shows error hints on invalid input
   - Charts update when filters change
   - Table: column toggle, group by, sort by click, summary row with aggregates
   - Treemap nesting follows table grouping
   - Timeline collapses gaps, stacks overlapping sessions
   - Click table row → navigates to session detail
   - Back arrow in header → returns to home
   - Session detail pages retain existing h-screen + internal scroll behavior
3. `npm run test` — Existing tests pass
4. `npm run test` — New unit tests for query parser pass (parsing, operator evaluation, shorthands, date literals, null semantics, error positions, field alias resolution)
5. `npm run test` — New unit tests for group aggregator pass (sum/max/count rules, mixed-model labels, lower-bound cost propagation, null cost handling)
