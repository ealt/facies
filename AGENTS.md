# AGENTS.md

This file provides guidance to AI agents working with this repository.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the dev server (localhost:5173) |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run all tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run check` | Type check all Svelte and TypeScript files |
| `npm run check:watch` | Type check in watch mode |

## Architecture Overview

Facies is a local forensic tool that reads Claude Code session data from `~/.claude/` and presents it as an interactive dashboard. No external database -- it parses JSONL files from the filesystem at request time and caches a lightweight session index.

### Data Flow

```
~/.claude/logs/*.jsonl          (event logs)
~/.claude/projects/**/*.jsonl   (transcripts + subagents)
        |
        v
  Server: discovery -> parsing -> indexing
        |
        v
  Analysis: token-tracker, cost-calculator, context-decomposer,
            tool-analyzer, compaction-analyzer, conversation-builder,
            session-aggregator
        |
        v
  Views: OverviewDashboard, TokenEconomics, ContextWindow,
         ToolEffectiveness, Compaction, Conversation
```

### Directory Structure

```
src/
  routes/
    +layout.svelte              # App shell: sidebar + header + content
    +page.svelte                # Overview dashboard (cross-session)
    +error.svelte               # Error page
    session/[id]/
      +page.svelte              # Session detail (10 tabbed views)
      +page.server.ts           # Loads full parsed session
    api/
      sessions/+server.ts       # GET: session index
      sessions/[id]/+server.ts  # GET: full parsed session

  lib/
    server/
      config.ts                 # ~/.claude path resolution
      discovery.ts              # Session file discovery
      event-log-reader.ts       # Event log JSONL parser
      transcript-reader.ts      # Transcript JSONL parser
      subagent-reader.ts        # Subagent transcript + meta parser
      session-loader.ts         # Combines all parsers for one session
      session-index.ts          # Mtime-based JSON cache for summaries

    analysis/
      token-tracker.ts          # Per-API-call token snapshots
      cost-calculator.ts        # Model pricing, cost per call
      context-decomposer.ts     # Context window category breakdown
      tool-analyzer.ts          # Tool success rates, latency, cost
      compaction-analyzer.ts    # Pre/post compaction metrics
      conversation-builder.ts   # DAG from uuid/parentUuid records
      session-aggregator.ts     # Cross-session aggregation

    components/
      layout/                   # Sidebar, Header
      views/                    # Per-tab view components
      charts/                   # D3/LayerCake chart components

    types.ts                    # All TypeScript interfaces
    pricing.ts                  # Model pricing constants
```

## Key Files

- `src/lib/types.ts` -- All shared TypeScript interfaces (events, transcripts, analysis results, session index)
- `src/lib/server/session-index.ts` -- Session index cache lifecycle (discovery, staleness, parsing, caching)
- `src/lib/server/transcript-reader.ts` -- Transcript JSONL parser with streaming chunk deduplication
- `src/lib/pricing.ts` -- Model pricing table and normalization
- `docs/plans/facies.md` -- Full implementation plan (Codex-reviewed)

## Patterns

### Svelte 5 Runes

This project uses Svelte 5 exclusively. Key patterns:

- Props: `let { foo }: { foo: Type } = $props()`
- Reactive state: `let x = $state(initialValue)`
- Derived values: `const y = $derived(expression)` or `$derived.by(() => { ... })`
- No `$:` reactive statements, no `export let`, no stores

### D3 Chart Components

Charts follow a consistent pattern:

- SVG with `bind:clientWidth={containerWidth}` for responsive sizing
- Computed scales via `$derived` (not D3 joins)
- Margins as a local const `{ top, right, bottom, left }`
- Tooltips via SVG `<title>` elements
- Empty-data guard renders a centered placeholder message

### Analysis Modules

All analysis functions are pure: `(inputs) => outputs`. No side effects, no filesystem access. They live in `src/lib/analysis/` and are called from `$derived` in page components.

### Session Index

The session index (`session-index.ts`) is a mtime-based JSON cache at `.cache/session-index.json`. It discovers sessions from `~/.claude/logs/`, checks staleness by comparing file mtimes, and only reparses changed sessions. Bumping `INDEX_VERSION` forces a full reparse.

## Gotchas

- `<synthetic>` assistant records (model = `<synthetic>`, zero tokens) must be skipped everywhere -- they are framework placeholders, not real API calls
- Transcript streaming chunks share `message.id` -- dedup by grouping on this field, not by treating each record as a separate API call
- Model strings may contain `[1m]` suffixes, ANSI codes, or whitespace -- always normalize via `normalizeModel()` before display or pricing lookup
- `compactMetadata.preTokens` is the authoritative pre-compaction context size, NOT `input_tokens_before` from the event log (which measures uncached input only)
- `FileHistorySnapshotRecord` does not extend `BaseTranscriptRecord` and lacks `timestamp` -- use `'timestamp' in record` guards

## Tool Usage Patterns

### When Reading Files

- Start with `src/lib/types.ts` to understand the data model
- Check `tests/` for usage examples and expected behavior of analysis modules
- Read `docs/plans/facies.md` for design rationale behind implementation choices

### When Editing Files

- Run `npm run check` after editing to catch Svelte/TypeScript errors
- Run `npm test` to verify no regressions
- When adding new analysis: create a pure function in `src/lib/analysis/`, call it via `$derived` in the page component, pass results to a view component

## Multi-Step Workflows

### Adding a New Analysis View

1. Create the analysis function in `src/lib/analysis/`
2. Create chart components in `src/lib/components/charts/`
3. Create a view component in `src/lib/components/views/`
4. Wire it into `src/routes/session/[id]/+page.svelte` as a new tab
5. Write tests in `tests/analysis/`

### Extending the Session Index

1. Add new fields to `SessionSummary` in `src/lib/types.ts`
2. Compute them in `computeSessionSummary()` in `session-index.ts`
3. Bump `INDEX_VERSION` to force reparse of cached sessions
4. Update tests in `tests/server/session-index.test.ts`

## Style Reference

For detailed formatting rules, see [STYLE_GUIDE.md](STYLE_GUIDE.md).
