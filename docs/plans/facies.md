# Claude Code Session Analyzer — Implementation Plan

## Context

Build a web UI to visualize and analyze events from Claude Code sessions. The user has logging hooks in ~/Documents/toolchain that capture session events to `~/.claude/logs/` (lightweight event stream) and full transcripts to `~/.claude/projects/` (conversation history with token usage). The goal is a "Chrome DevTools Network tab" for the context window, plus token economics, tool effectiveness, compaction analysis, and a conversation browser.

**Scope**: Single-user local forensic tool. Reads `~/.claude/` directly — no redaction, no multi-user concerns, no deployment beyond `localhost`. Intended for the user who owns the session data.

**Data accuracy contract**: The data falls into two tiers:

- **Authoritative** (exact values from the API/logs): token counts per API call (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), model name, timestamps, tool names, tool input/response sizes, compaction `preTokens`, event sequences.
- **Heuristic** (estimated, labeled as such in the UI): context window composition breakdown (which content categories account for which tokens), post-compaction token count (inferred from the next API call), per-message token estimates (chars/4 approximation), "context cost" of a tool call (how many tokens the result contributed to subsequent API calls).

All heuristic values are displayed with a visual indicator (e.g., `~` prefix or dashed styling) and tooltip explaining the estimation method. The UI never presents heuristic values as exact.

**Version compatibility**: Transcripts span multiple Claude Code versions (observed: 2.1.86–2.1.91) and contain model strings including real models (`claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-5-20251101`, `claude-sonnet-4-5-20250929`) and `<synthetic>` placeholder records (zero-token framework-generated messages). The parser:

- Skips `<synthetic>` assistant records (they have zero tokens and are not real API calls)
- Handles unknown model strings gracefully: displays the raw string, omits cost calculation, and flags with "unknown model — cost unavailable"
- Tolerates missing or unexpected fields (the transcript format is a tagged union with extensible payloads — unknown fields are ignored, missing optional fields default to null/zero)

## Stack

- **Svelte 5 + SvelteKit** — framework
- **shadcn-svelte** — UI components (tabs, tables, dialogs, select, tooltips)
- **LayerCake + D3** — charting (LayerCake for standard charts, raw D3 for Sankey/DAG/treemap)
- **Tailwind CSS 4** — styling
- **Tiny local API server** (SvelteKit server routes) — serves JSONL files from `~/.claude/`
- **Session index cache** — lightweight JSON file (`.cache/session-index.json`) that caches per-session summary metadata (title, model, duration, total tokens, total cost, compaction count, tool counts). See "Cross-Session Index" section below.
- **No external database** — individual sessions are parsed from filesystem at request time; only the cross-session index is cached

**Expected corpus scale** (from observed data): ~25 session event logs (2.5 MB), ~650 transcript files including subagents (211 MB). The session index cache avoids reparsing the full corpus on every landing page load. Individual session detail views parse one session's files on demand — the largest observed session transcript is ~5 MB, which parses in <1 second.

## Data Sources

### Event Logs — `~/.claude/logs/{session_id}.jsonl`

Lightweight event stream (13 event types). Common fields on all events: timestamp, session_id, cwd, transcript_path. Event-specific fields:

- **SessionStart**: source, model
- **SessionEnd**: reason
- **UserPromptSubmit**: prompt_length, slash_command (optional)
- **PreToolUse**: tool_name, tool_input_keys (no tool_use_id, no sizes)
- **PostToolUse**: tool_name, tool_use_id, tool_input_keys, tool_input_size, tool_response_size
- **PostToolUseFailure**: tool_name, tool_use_id, error
- **PreCompact**: trigger, input_tokens_before
- **PostCompact**: trigger, input_tokens_after, tokens_freed (calculated from stashed PreCompact value)
- **SubagentStart**: agent_id, agent_type
- **SubagentStop**: agent_id, agent_type, agent_transcript_path
- **Stop**: stop_hook_active
- **TaskCreated/TaskCompleted**: task_id, task_subject

Note: `tool_input_size` and `tool_response_size` are only on PostToolUse, not PreToolUse.

**Compaction data — important metric distinction**: The hook's `input_tokens_before`/`input_tokens_after` fields read `usage.input_tokens` from the transcript — this is the **uncached** input tokens only, which is often near-zero (e.g., 3 tokens) when caching is effective. This is NOT the total context size. The transcript's `compactMetadata.preTokens` (from `compact_boundary` records) is the full context size as reported by the Claude Code runtime (~183K in observed data, closely matching `input_tokens + cache_read + cache_create` from the last API call at ~182K).

**For compaction analysis, prefer**: `compactMetadata.preTokens` from the transcript for pre-compaction size (authoritative). For post-compaction size, use the next API call's `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (inferred, labeled with `~`). Do NOT use the hook's `input_tokens_before`/`input_tokens_after` for context size — they measure the wrong quantity.

### Transcripts — `~/.claude/projects/{project-id}/{session-id}.jsonl`

Full conversation DAG (uuid/parentUuid). Record types: user, assistant, system, progress, file-history-snapshot, attachment, permission-mode, queue-operation, custom-title, agent-name, last-prompt. Assistant records contain `message.usage` with input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens. System records have subtypes: turn_duration (durationMs, messageCount), compact_boundary (compactMetadata.preTokens), api_error.

### Subagent Transcripts — `{session-id}/subagents/agent-{id}.jsonl` + `.meta.json`

Same format as main transcripts but scoped to a subagent. Meta files have agentType and description.

### Diagnostics — `~/.claude/logs/_diagnostics.jsonl`

Version changes, schema drift events.

## Architecture

```
src/
  routes/
    +layout.svelte              # App shell: sidebar + header + content area
    +page.svelte                # Overview dashboard (cross-session)
    session/[id]/
      +page.svelte              # Session detail — tabbed views
      +page.server.ts           # Load session data from filesystem
    api/
      sessions/+server.ts       # GET: list all sessions (from session index cache)
      sessions/[id]/+server.ts  # GET: full parsed session (events + transcript)

  lib/
    server/
      discovery.ts              # Walk ~/.claude/logs/ and projects/ to find sessions
      event-log-reader.ts       # Parse event log JSONL
      transcript-reader.ts      # Parse transcript JSONL, group streaming chunks by requestId
      subagent-reader.ts        # Discover + parse subagent transcripts + meta.json

    analysis/
      token-tracker.ts          # Cumulative token accounting per API call
      cost-calculator.ts        # Model pricing table, cost per API call
      context-decomposer.ts     # Estimate what fills the context window (system prompt, user msgs, tool results, etc.)
      tool-analyzer.ts          # Tool success rates, latency, context cost
      compaction-analyzer.ts    # Pre/post compaction metrics
      turn-analyzer.ts          # Turn duration, efficiency metrics

    types.ts                    # All TypeScript interfaces
    pricing.ts                  # Model pricing constants

  components/
    layout/
      Sidebar.svelte            # Session list grouped by project, searchable
      Header.svelte             # Active session info: model, duration, cost badge

    views/
      OverviewDashboard.svelte  # Cross-session: totals, trends, session table
      ContextWindowView.svelte  # Stacked area chart of context composition over time
      TokenEconomicsView.svelte # Token waterfall, cost breakdown, cache efficiency
      ToolEffectivenessView.svelte  # Tool table, timeline, scatter plot
      CompactionView.svelte     # Compaction timeline, before/after cards
      ConversationView.svelte   # Conversation DAG browser with detail panel

    charts/
      ContextTimeline.svelte    # LayerCake stacked area: context composition
      TokenWaterfall.svelte     # LayerCake grouped bar: token types per API call
      CostBreakdown.svelte      # D3 treemap: cost by model > category > turn
      ToolTimeline.svelte       # D3 Gantt-style: tool calls over time
      ToolScatter.svelte        # LayerCake scatter: response size vs latency
      CompactionChart.svelte    # LayerCake line with drop markers
      ConversationDAG.svelte    # D3 tree layout: conversation structure
      CacheEfficiency.svelte    # LayerCake line: cache hit rate over time
```

## Cross-Session Index

The overview dashboard needs per-session summary metrics (title, model, duration, total tokens, total cost, compaction count) without reparsing every transcript on each page load. The solution is a lightweight cached index.

**File**: `.cache/session-index.json` (gitignored, lives alongside the app)

**Schema**:
```typescript
interface SessionIndex {
  version: number;               // schema version for cache invalidation
  lastUpdated: string;           // ISO timestamp
  sessions: SessionSummary[];
}

interface SessionSummary {
  sessionId: string;
  project: string;
  title: string | null;
  model: string;
  startTime: string;
  endTime: string | null;        // null for interrupted sessions
  durationMs: number;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number | null;      // null if unknown model
  costIsLowerBound: boolean;     // true if any API call had unknown model pricing
  compactionCount: number;
  toolCallCount: number;
  subagentCount: number;
  // Source file metadata for staleness detection
  eventLogPath: string;
  eventLogMtime: number;         // file modification time (ms since epoch)
  transcriptPath: string;
  transcriptMtime: number;
  subagentMtimes: Record<string, number>;  // subagent file path → mtime
}
```

**Lifecycle**:
1. On app startup (or when the overview page loads), read the index file.
2. Walk `~/.claude/logs/` to discover all session event log files.
3. For each session, compare the mtime of the event log, transcript, and all subagent transcripts against the cached entry. A session is stale if **any** source file has a newer mtime than cached.
4. For sessions that are new or stale: parse the event log + transcript + subagents, compute the summary, and update the index entry.
5. Write the updated index back to disk.
6. Stale entries (event log file no longer exists) are removed.

This is a simple mtime-based cache, not a database. The index file is small (<100 KB for hundreds of sessions) and regenerates in seconds if deleted.

**Upgrade path**: If corpus size or query complexity outgrows the JSON index (e.g., thousands of sessions, or need for cross-session joins), the natural next step is a local SQLite store. The current JSON approach is a deliberate choice for simplicity at the observed scale.

**Degraded behavior when data is incomplete**:
- **Event log exists but transcript is missing**: Show the session in the index with metadata from the event log only (model, duration, tool counts). Token totals and cost are shown as "unavailable" since they require transcript parsing.
- **Transcript exists but no event log**: These sessions are not discovered (event logs are the primary discovery mechanism). This is acceptable — sessions without hooks enabled predate the logging system.
- **Partially written files** (e.g., session in progress or interrupted write): The JSONL parser reads line-by-line and skips malformed lines. Partial last lines are silently dropped. The parser tracks a `skippedLines` count; if nonzero, the UI displays a subtle warning badge: "Partial data — N malformed lines skipped. Session may be in progress or incomplete." This prevents silent undercounting of token totals or missing compaction events.

## Key Data Processing

### Session Metadata Resolution

Multiple data sources provide session metadata. Precedence rules:

- **Title**: `custom-title` record from transcript (if present) > `slug` field from first transcript record > session_id
- **Model**: `SessionStart.model` from event log (authoritative for the main session's model). Subagents may use different models — their model comes from their own transcript's assistant records. **Sanitize model strings** before display and pricing lookup: strip ANSI escape codes, terminal formatting artifacts, and trailing whitespace. Some log entries may contain terminal-formatted model names.
- **Duration**: `SessionEnd.timestamp - SessionStart.timestamp` from event log. If SessionEnd is missing (interrupted session), use the last event's timestamp.
- **Project**: Derived from `cwd` in SessionStart. The `transcript_path` also encodes the project slug.

### Aggregation Rules: Main Session vs Subagents

**Single semantic model**: All cost/token totals always include main session + subagents. This is the "true cost" of the session — what you were billed for. The breakdown is always available.

- **Session total tokens**: Sum of all API calls in main transcript + all subagent transcripts.
- **Session total cost**: Main session cost + sum of all subagent costs. Displayed as "$X total (main: $Y, subagents: $Z)".
- **Overview dashboard totals**: Sum of all session total costs (main + subagents). The "total spend" card answers "how much was I billed across all sessions?" — this matches what you'd see on an API billing page.
- **Session table rows**: Show the full session total cost. Consistent with the total.
- **Per-model breakdown**: Includes both main and subagent API calls, since different models may be used (e.g., main session uses Opus, Explore subagents use Haiku).
- **Tool counts**: Main session event log tool calls only. Subagent internal tool calls are shown separately in the subagent deep dive section.

### Transcript Record Coverage

How each transcript record type is handled:

| Record type | Rendered in conversation browser? | Used in analysis? |
|---|---|---|
| `user` | Yes — user prompt node (blue) | Token estimates, turn boundaries |
| `assistant` | Yes — API call group (thinking/text/tool_use) | Token accounting, cost, latency |
| `system:turn_duration` | Collapsed into parent turn | Turn efficiency analysis |
| `system:compact_boundary` | Yes — compaction marker (purple) | Compaction analysis |
| `system:api_error` | Yes — error node (red) | Error/retry analysis |
| `progress` | Ignored (hook lifecycle noise) | Not used |
| `file-history-snapshot` | Ignored | Not used |
| `attachment` | Ignored (deferred tool deltas) | Not used |
| `permission-mode` | Shown as annotation on timeline | Mode correlation |
| `queue-operation` | Ignored | Not used |
| `custom-title` | Ignored (used for session metadata only) | Session title |
| `agent-name` | Ignored (used for session metadata only) | Session display name |
| `last-prompt` | Ignored | Not used |
| `<synthetic>` assistant | Ignored (zero-token placeholders) | Not used |
| Empty thinking blocks | Collapsed — show "No thinking" | Not counted in token breakdown |

### Tool Result Normalization

Tool results appear in two places in the transcript, which must be unified into a single internal representation before analysis or display:

1. **Inside `message.content[]`** on user records: `tool_result` content blocks with `tool_use_id`, `content` (string), and optional `is_error` flag. This is the API-level representation — what was sent back to the model.
2. **Top-level `toolUseResult`** on the same user record: can be a plain string OR a structured object `{type: "text", file: {filePath, content, numLines, startLine, totalLines}}`. This is a richer representation added by Claude Code's framework.

**Normalization strategy**:

```typescript
interface NormalizedToolResult {
  toolUseId: string;
  content: string;                // the text content sent to the model
  isError: boolean;
  // Enrichment from toolUseResult (when available)
  sourceFile?: {                  // present when toolUseResult is a structured file read
    filePath: string;
    numLines: number;
    startLine: number;
    totalLines: number;
  };
}
```

For each user record containing `tool_result` content blocks:
1. Extract `tool_use_id` and `content` from the `tool_result` block (authoritative — this is what the model saw).
2. If `toolUseResult` is a structured object with `type: "text"` and `file`: attach the file metadata as enrichment.
3. If `toolUseResult` is a string: it's redundant with `content` — ignore it.
4. If `toolUseResult` is absent: no enrichment available.

The conversation browser uses `content` for display and `sourceFile` metadata for the detail panel header (e.g., "Read /src/lib/parser.ts — lines 1–1847 of 1847"). The context decomposer uses `content.length` for token estimation.

In observed data: 129 user records with `tool_result` blocks, of which 119 also have structured `toolUseResult` objects and 10 have string `toolUseResult`. The normalization layer handles all variants.

### Streaming Chunk Deduplication

Multiple assistant records per API call share the same `requestId` (thinking, text, tool_use chunks). Group by `requestId`. Token usage is identical across chunks — take from the first.

**Fallback when `requestId` is missing**: The schema declares `requestId` as optional. In observed data, the only assistant records without `requestId` are `<synthetic>` records (which are already skipped). However, the parser must not crash on missing `requestId`. Fallback strategy:

1. If `requestId` is present: group by it (primary path).
2. If `requestId` is missing and the record is `<synthetic>` (model = `<synthetic>`, zero tokens): skip entirely.
3. If `requestId` is missing on a real assistant record: treat it as its own standalone API call group. Use `message.id` (the API message ID, always present on real records) as the group key. Log a warning for diagnostics but do not fail.

This ensures the parser is robust against schema evolution while the primary grouping path handles >99% of real data.

### Context Decomposition (heuristic — the core challenge)

The API reports aggregate token counts per API call, not per-message breakdowns. There is no authoritative way to know exactly how many tokens a specific user message or tool result consumed. This view is therefore **heuristic** — it provides a useful approximation, not exact accounting.

**What is authoritative**: Total input tokens per API call (the sum `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`). This is the context window size at each API call. The growth curve and compaction drops are exact.

**What is estimated**: The breakdown of that total into categories (system prompt, user messages, tool results, etc.). Strategy:

1. **System baseline**: The first API call's `cache_creation_input_tokens` is predominantly system prompt + CLAUDE.md + tool definitions. This is a reasonable estimate but not exact (it also includes any initial message framing). Label as "~system baseline".
2. **Per-content token estimates**: Estimate tokens for each content item in the transcript:
   - User messages: `content.length / 4` (rough chars-to-tokens ratio)
   - Tool results: `tool_response_size` from event logs (bytes, roughly tokens for ASCII text)
   - Assistant text/thinking: `content.length / 4`
   - These are independent estimates — they won't sum exactly to the authoritative total.
3. **Proportional attribution**: For each API call, compute the estimated token count for each content category present. Scale proportionally so the category estimates sum to the authoritative total. This preserves correct totals while giving a reasonable categorical breakdown.
4. **Compaction boundaries**: After a `compact_boundary`, the context resets. The compacted summary becomes its own category — **"Compacted summary"** — in the stacked area chart. It replaces the prior breakdown with a single block representing the summarized context. The first post-compaction API call's total input tokens shows the new baseline. As new content accretes after compaction, the "Compacted summary" block remains at the base (like the system baseline) while new user messages, tool results, etc. stack on top. The "tokens freed" calculation (`preTokens - post total`) is exact for preTokens (from `compactMetadata.preTokens`) and uses the next API call's total input as the post estimate — labeled as "~post-compaction size (inferred from next API call)".
5. **Confidence signal**: The UI marks all decomposed values with `~` prefix and a tooltip: "Estimated — breakdown is proportionally attributed; totals are exact."

### Cost Calculation

```typescript
// Known model pricing (per 1M tokens)
const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6':              { input: 15.00, output: 75.00, cacheRead: 1.50, cacheCreate: 18.75 },
  'claude-sonnet-4-6':            { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheCreate: 3.75  },
  'claude-haiku-4-5-20251001':    { input: 0.80,  output: 4.00,  cacheRead: 0.08, cacheCreate: 1.00  },
  'claude-opus-4-5-20251101':     { input: 15.00, output: 75.00, cacheRead: 1.50, cacheCreate: 18.75 },
  'claude-sonnet-4-5-20250929':   { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheCreate: 3.75  },
};
// cost = (input_tokens * input + cache_read * cacheRead + cache_create * cacheCreate + output_tokens * output) / 1_000_000
```

**Model string normalization**:

- `<synthetic>` records: skip entirely (zero-token framework placeholders, not real API calls)
- **Strip suffixes and annotations** before lookup: real data contains strings like `claude-opus-4-6[1m]` (context window annotation), ANSI escape codes, and trailing whitespace. Normalize by stripping `[...]` suffixes, ANSI codes, and whitespace before matching.
- Known models: exact match against pricing table (after normalization)
- Unknown models: attempt prefix match (e.g., `claude-opus-*` → use opus pricing). If no match, display token counts without cost and flag "unknown model — cost unavailable" in the UI. The session's total cost is shown as a lower bound with a warning badge.
- The pricing table lives in `pricing-data.json` (checked-in, updated by `scripts/update-pricing.ts`). See "Pricing Update Script" section below.

### Tool Latency Correlation

`PreToolUse` events do **not** carry `tool_use_id` — only `PostToolUse` does. Correlation strategy:

1. **Sequential pairing within the event log**: For each `PostToolUse`, find the most recent preceding `PreToolUse` with the same `tool_name` that hasn't already been paired. This works because tool calls within a single session are serialized (parallel tool calls within a turn are dispatched sequentially in the event stream).
2. **Latency** = `PostToolUse.timestamp - paired PreToolUse.timestamp`.
3. **Cross-reference with transcript**: Use the `tool_use_id` from `PostToolUse` to find the matching `tool_use` content block in the transcript for full input/output content.
4. **Fallback**: If pairing is ambiguous (e.g., multiple concurrent subagents calling the same tool), latency is marked as unavailable for those calls rather than guessed.

## Views

### 1. Context Window Timeline (flagship view)

**Analogy**: Chrome DevTools Network tab, but for the context window. The Network tab shows every HTTP request as a row in a waterfall — you see what loaded, how big it was, how long it took, and how it contributed to overall page weight. This view does the same for the context window: every piece of content that enters the context is a visible element, showing what it is, how many tokens it costs, and how it contributes to the overall context size over time.

**Questions this answers**:

- Where is my context window budget going? Is it mostly system prompt overhead, tool results, my messages, or the assistant's responses?
- Which tool calls are dumping the most content into context? (e.g., a Read of a 2000-line file vs a Grep that returns 5 lines)
- How fast is the context filling up? At what point does compaction get triggered?
- After compaction, how much of the original context survived? What got dropped?
- Over the course of a long session, what's the rhythm? Long stretches of tool calls filling context, punctuated by compaction resets?

**Layout**: Full-width stacked area chart on top, detail panel below.

**The chart**: X-axis is time (or API call index, toggleable). Y-axis is cumulative token count. The area is divided into stacked colored regions:

- **System baseline** (dark gray): system prompt, CLAUDE.md, available tool/skill definitions. This is the "floor" — always present, estimated from the first API call's `cache_creation_input_tokens`.
- **User messages** (blue): the human's prompts, accumulated over time
- **Assistant text** (green): the assistant's visible text responses (not thinking)
- **Assistant thinking** (light gray): extended thinking blocks — often large, shows how much context goes to reasoning
- **Tool results** (orange): output returned from tool calls (Read file contents, Bash output, Grep results, web fetch content). This is often the biggest and most variable contributor.
- **Subagent overhead** (purple): content from subagent calls — the Agent tool input/output, subagent transcript results piped back into the main context
- **Compacted summary** (amber, post-compaction only): the summarized context block that replaces all prior categories after a compaction event. Sits at the base of the stack (above system baseline) until the next compaction replaces it.

**Compaction events** appear as vertical dashed lines with annotations: "Compacted: 182K → ~26K tokens (freed ~156K)". The pre-compaction value is exact (from `compactMetadata.preTokens`); the post value and freed amount are inferred and marked with `~`. The stacked area visibly drops at these points.

**Interaction**:

- Hover any point on the chart → tooltip breaks down that moment: "Turn 14: ~System 8.3K, ~User 2.1K, ~Assistant 4.7K, ~Tool results 38.2K, Total: 53.3K tokens" (category values prefixed with `~` since they are heuristic; the total is exact)
- Click a region → the detail panel below shows the actual content that was added at that point. If you click on an orange (tool result) section, you see the specific tool call: "Read /src/lib/parser.ts — 1,847 lines, ~4,200 tokens". If you click a blue (user) section, you see the user's prompt.
- Brush/zoom to focus on a time range
- Toggle between "cumulative" (shows total context at each point) and "incremental" (shows only what was added per API call — like the Network tab's individual request sizes)

**The "Network tab" row view** (below the chart): A table where each row is one item that entered the context, ordered chronologically:

| Time | Type | Description | Tokens (est.) | Cumulative |
|------|------|-------------|---------------|------------|
| 17:44:34 | System | System prompt + CLAUDE.md + tools | ~8,300 | 8,300 |
| 17:55:53 | User | "I want to build a web UI..." | ~275 | 8,575 |
| 17:56:03 | Tool result | Agent (Explore): toolchain hooks | ~3,200 | 11,775 |
| 17:56:04 | Tool result | Agent (Explore): session data | ~2,800 | 14,575 |
| ... | | | | |

Each row is clickable to expand and show full content. Rows are color-coded to match the chart above.

---

### 2. Token Economics — Input vs Output vs Cached, by Model, Translated to Cost and Latency

**Analogy**: A financial dashboard for your API spend. Like a billing breakdown that shows not just the total, but exactly which calls cost what, how caching saved you money, and whether you're getting good value.

**Questions this answers**:

- How much did this session cost? How much does a typical session cost?
- What fraction of input tokens are cache hits vs fresh input? Is caching working effectively?
- Which API calls were the most expensive? (A single Opus call with 180K input tokens dwarfs everything else)
- How do input tokens, output tokens, and cache tokens translate to actual dollars? (Cache reads are 90% cheaper than fresh input — how much is that saving?)
- What's the cost per turn? Are some turns dramatically more expensive than others?
- When subagents use Haiku vs the main session using Opus, how does the cost compare?
- How does latency correlate with token count? (Bigger context = slower response?)

**Layout**: Metrics bar at top, 4 chart panels below.

**Top metrics bar** (single row of cards):

- **Total cost**: e.g., "$2.47" — the headline number
- **Input tokens**: "142.3K" with breakdown hover: "Fresh: 12.1K, Cache read: 118.4K, Cache create: 11.8K"
- **Output tokens**: "8.7K"
- **Cache hit rate**: "89.2%" — (cache_read / (cache_read + input + cache_create))
- **Cost saved by caching**: "$1.60" — difference between what it would have cost without caching vs with
- **Avg cost per turn**: "$0.18"
- **Model(s) used**: "Opus 4.6, Haiku 4.5" with badges

**Chart 1 — Token waterfall** (the core visualization): A bar chart where each bar is one API call (grouped by requestId). Each bar is split into 4 colored segments stacked horizontally:

- Red: `input_tokens` (uncached — freshly processed, most expensive per token)
- Green: `cache_read_input_tokens` (cache hits — 90% discount)
- Yellow: `cache_creation_input_tokens` (new content entering cache — 25% premium)
- Blue (extending right): `output_tokens` (generated text — most expensive category for Opus at $75/M)

This makes it visually obvious: a mostly-green bar means great cache efficiency; a mostly-red bar means a cache miss (e.g., after compaction). The blue (output) portion shows how much the model generated vs consumed.

**Chart 2 — Cumulative cost over time**: Line chart with X = time, Y = running total USD. Each turn adds a step. Overlay bars showing per-turn cost. Compaction boundaries marked — you can see if cost rate changes after compaction (it often increases temporarily due to cache misses).

**Chart 3 — Cost breakdown treemap**: Nested rectangles. Outer level: model (Opus vs Haiku). Inner level: cost category (input, output, cache_read, cache_create). Each rectangle's area is proportional to cost. Click to drill into per-turn breakdown.

**Chart 4 — Latency vs token count scatter**: Each dot is an API call. X = total input tokens, Y = response latency (from turn_duration system records). Color = model. Shows the relationship between context size and response time. Hypothesis: latency increases roughly linearly with input token count, with a step-change for output-heavy responses.

**Per-model comparison table** (if multiple models used):

| Model | API Calls | Input Tokens | Output Tokens | Cache Rate | Total Cost | Avg Latency |
|-------|-----------|-------------|---------------|------------|------------|-------------|
| claude-opus-4-6 | 23 | 142.3K | 8.7K | 89% | $2.31 | 12.4s |
| claude-haiku-4-5 | 47 | 89.1K | 4.2K | 91% | $0.16 | 1.8s |

---

### 3. Tool & Subagent Effectiveness

**Analogy**: An APM (Application Performance Monitoring) dashboard like Datadog or New Relic, but for Claude's tool calls instead of HTTP endpoints. Which "endpoints" are slow? Which fail? Which consume the most resources for their value?

**Questions this answers**:

- Which tools are called most often? Which are most expensive?
- Which tools fail, and why? Are there patterns in failures (e.g., Bash commands failing on permission errors)?
- How much context does each tool type consume? A single Read of a large file might add 5K tokens; is that worth it?
- Are subagents efficient? A subagent might spawn 30 internal tool calls — how much does that cost, and was the result useful (did the main session actually use the subagent's output)?
- Which tool calls are slow? Is it the tool itself (e.g., a slow Bash command) or the model thinking time after the tool result?
- What's the overhead ratio — how many tokens of tool results did the model consume per token of output it produced? (A measurable proxy for efficiency, without requiring subjective "usefulness" judgment.)

**Layout**: Summary table at top, 3 chart panels below, subagent section at bottom.

**Tool summary table** (shadcn-svelte data table, sortable by any column):

| Tool | Calls | Success % | Avg Latency | Avg Input Size | Avg Response Size | Total Context Cost | Est. Cost | Cost/Call |
|------|-------|-----------|-------------|---------------|-------------------|-------------------|-----------|----------|
| Bash | 42 | 97.6% | 2.3s | 164 B | 1,250 B | 13.1K tokens | $0.20 | $0.005 |
| Read | 31 | 100% | 0.12s | 85 B | 3,200 B | 24.8K tokens | $0.37 | $0.012 |
| Grep | 28 | 100% | 0.08s | 120 B | 890 B | 6.2K tokens | $0.09 | $0.003 |
| Agent | 6 | 100% | 45.2s | 2,400 B | 8,100 B | 12.2K tokens | $0.42 | $0.070 |
| Edit | 12 | 91.7% | 0.05s | 340 B | 120 B | 1.4K tokens | $0.02 | $0.002 |
| Write | 8 | 100% | 0.03s | 1,800 B | 45 B | 0.4K tokens | $0.01 | $0.001 |

"Context cost" = tokens the tool result adds to the context. "Est. cost" = what those tokens cost as input to subsequent API calls (tool results stay in context until compaction).

**Chart 1 — Tool timeline (Gantt-style)**: Horizontal axis is session time. Each tool call is a horizontal bar, positioned at its start time, with width proportional to its latency. Color-coded by tool name. Failed calls are outlined in red with a ✕ marker. This shows the *rhythm* of a session: bursts of fast Grep/Read calls, punctuated by slow Bash or Agent calls. Overlapping bars show parallel tool execution (e.g., concurrent subagents).

**Chart 2 — Context cost vs latency scatter**: Each dot is a single tool call. X = response size (bytes), Y = latency (ms). Color = tool type. Size = relative cost. Outliers are immediately visible — a Read that returned 50K bytes of content, or a Bash that took 30 seconds. Hover shows the specific call details.

**Chart 3 — Tool cost distribution**: Horizontal stacked bar showing each tool's share of total context cost. Makes it obvious if one tool type dominates.

**Subagent deep dive section**: For each subagent spawned in the session:

- Card header: agent type (Explore/Plan/general-purpose), description from .meta.json, total duration
- Internal metrics: number of internal tool calls, total tokens consumed (input + output across all internal API calls), total cost
- Effectiveness signal: the `last_assistant_message` content (the subagent's final output that was returned to the main session) — shown truncated with expand
- Context overhead: how many tokens did the subagent's result add to the main session's context?

**Failure analysis panel**: Expandable section listing all PostToolUseFailure events:

| Time | Tool | Error | Preceding Input |
|------|------|-------|-----------------|
| 17:58:12 | Bash | Exit code 1: Permission denied | `rm -rf /protected/path` |
| 18:02:45 | Edit | old_string not found in file | Edit to `src/lib/parser.ts` |

---

### 4. Compaction Analysis

**Analogy**: Garbage collection analysis in a JVM profiler. Compaction is the context window's GC — it frees space by summarizing old content. Like GC pauses, you want to understand: how often does it happen, how much does it reclaim, and what's the cost of the compaction itself?

**Questions this answers**:

- How often does compaction trigger? At what context size?
- How much context is freed each time? Is it consistent or variable?
- What's the cost of compaction itself? (The summarization is an API call — tokens in, summary out)
- After compaction, does the cache hit rate drop? (Yes — the compacted summary is new content, so cache_creation spikes and cache_read drops)
- How does the session's behavior change after compaction? (Often the assistant loses context about earlier work)
- Is there a pattern across sessions — do all sessions compact at roughly the same threshold?

**Layout**: Session timeline on top, per-compaction detail cards below, cross-session panel at bottom.

**Session timeline**: Horizontal bar representing the full session duration. The bar's height varies to show context size over time (like a sparkline). Compaction events are marked as vertical dividers that split the bar into segments. Each segment is labeled with its peak context size before compaction. The visual makes it clear: context grows → hits threshold → drops → grows again.

**Per-compaction detail cards** (one card per compaction event):

```
┌─ Compaction #1 ─────────────────────────────────────────┐
│ Trigger: auto           Time: 18:23:45                  │
│                                                         │
│ Before: 182,288 tokens  ████████████████████████████░░  │
│ After: ~25,932 tokens   ████░░░░░░░░░░░░░░░░░░░░░░░░░  │
│ Freed: ~156,356 tokens (~85.8%)                         │
│                                                         │
│ ⓘ "Before" is exact (from compactMetadata.preTokens).   │
│   "After" is inferred from the next API call's total    │
│   input tokens. "Freed" is the difference.              │
│                                                         │
│ Time since session start: 34 min                        │
│ Turns before compaction: 23                             │
│ Cache hit rate before: 92%  →  After: 44%               │
│ First post-compaction API call cost: $0.28               │
│   (vs avg pre-compaction call: $0.08)                   │
│                                                         │
│ Recovery: cache rate returned to >80% after 3 turns     │
└─────────────────────────────────────────────────────────┘
```

**Cross-session compaction patterns** (when viewing all sessions):

- Histogram: "At what token count does auto-compaction trigger?" Observed range: 38K–224K. Shows distribution across sessions.
- Scatter: sessions plotted by duration vs number of compactions. Long sessions with many compactions vs short sessions with none.

---

### 5. Overview Dashboard (landing page)

**Analogy**: The home screen of a monitoring tool — high-level metrics and a session picker to drill into.

**Questions this answers**:

- How many sessions have been logged? Across which projects?
- What's the total spend across all sessions?
- Which sessions were the most expensive / longest / most tool-heavy?
- What's the overall trend — am I using more or less tokens over time?

**Session table** (the main element): sortable, filterable, searchable

| Project | Title | Model | Start | Duration | Turns | Tokens | Cost | Compactions |
|---------|-------|-------|-------|----------|-------|--------|------|-------------|
| tabula-rasa | warm-humming-leaf | Opus 4.6 | Apr 3 17:44 | 15m | 8 | 31.2K | $0.47 | 0 |
| direvo | — | Opus 4.6 | Mar 28 09:27 | 4h 12m | 87 | 1.2M | $18.40 | 3 |

Click any row → navigates to that session's detail view.

**Aggregate metrics cards**: total sessions, total tokens, total cost, unique projects, most-used model.

**Charts**: daily token usage trend, sessions per project (bar), tool usage distribution across all sessions.

---

### 6. Conversation Browser

**Analogy**: A structured view of the conversation, like a code AST viewer or a debugger call stack. Instead of reading a flat chat log, you see the hierarchical structure: user prompt → assistant thinking → assistant response → tool calls (branching) → tool results → next response. Subagents appear as nested sub-trees.

**Questions this answers**:

- What actually happened in this session, step by step?
- What did the assistant think before responding? (Thinking blocks, often hidden in normal use)
- What was the exact input/output of each tool call?
- How do subagent conversations relate to the parent session?
- Which parts of the conversation were the most token-heavy?

**Layout**: Tree view on left (60% width), content detail panel on right (40% width).

**Tree view**: Vertical layout, each node is a card representing one logical event:

- **User prompt** (blue): shows first ~80 chars of the prompt, token estimate badge
- **API call group** (gray container): groups the streaming chunks for one API response. Shows model badge and total usage. Expands to reveal:
  - **Thinking** (light gray, collapsed by default): "Extended thinking — 847 tokens"
  - **Text response** (green): first ~120 chars of the response
  - **Tool calls** (orange, one per tool_use): "Bash: `ls -la ~/.claude/logs/`" — each branches to:
    - **Tool result** (yellow): "1,247 bytes returned" — expandable
- **System events** (red for errors, purple for compaction): "Compaction: 182K → ~26K"
- **Subagent** (purple container): collapsible nested tree showing the subagent's own conversation

Nodes are sized proportionally to their token cost (thicker border or larger card for expensive items).

**Detail panel**: Click any node to see full content:

- Assistant text: rendered as markdown with syntax highlighting
- Tool inputs: syntax-highlighted JSON (for structured inputs) or code (for Bash commands)
- Tool results: auto-detected language highlighting, with line numbers
- Thinking blocks: full text in a collapsible, scrollable panel
- Token badge: exact usage numbers for the containing API call

---

### Bonus Derived Insights

Additional analyses the data supports beyond the five core views:

- **Turn efficiency**: Correlate `turn_duration` system records (durationMs) with tool call count and token consumption per turn. Identify "expensive" turns — high latency, many tokens, many tools — vs "cheap" turns. Visualize as a scatter plot.
- **API error/retry analysis**: From `system:api_error` records, track error rates, retry delays (`retryInMs`), and total time lost to retries. Show retry cascade patterns.
- **Permission mode impact**: Sessions switch between permission modes (plan, default, bypassPermissions). Correlate mode with tool failure rates and throughput.
- **Session comparison**: Side-by-side two sessions on any metric — useful for comparing different approaches to similar tasks (e.g., "did using subagents make this faster or more expensive?").
- **Context overhead ratio**: For each turn, show the ratio of tool result tokens to assistant output tokens. High ratios suggest the model read a lot of data to produce a small response — potentially inefficient. This is a measurable proxy (unlike "usefulness", which would require subjective judgment not available in the data).

## Implementation Phases

Each phase ends at a working checkpoint — the app builds, runs, and shows
something useful. No phase depends on later phases for a runnable state.

### Phase 1a: Scaffold + Types

- Initialize SvelteKit project with Tailwind CSS 4
- Add shadcn-svelte component library
- Define all TypeScript interfaces (`lib/types.ts`) — event log types, transcript record types, analysis result types
- Add fixture data: a small representative sample of JSONL files (event logs + transcripts + subagent data, including compaction and tool failures) in `tests/fixtures/`
- **Checkpoint**: `npm run dev` → blank app loads, types compile, fixtures parse with `tsc`

### Phase 1b: Server-Side Parsing

- Implement `lib/server/discovery.ts` — walk data directories, index sessions
- Implement `lib/server/event-log-reader.ts` — parse event log JSONL
- Implement `lib/server/transcript-reader.ts` — parse transcripts, group streaming chunks by requestId, build DAG
- Implement `lib/server/subagent-reader.ts` — discover + parse subagent transcripts + meta.json
- Unit tests for all parsers against fixture data
- **Checkpoint**: parsers work against fixtures, tests pass

### Phase 1c: API Routes + App Shell

- Implement session index cache (`lib/server/session-index.ts`) — mtime-based JSON cache for cross-session summaries
- Build SvelteKit server routes: `GET /api/sessions` (from session index cache), `GET /api/sessions/[id]` (full parsed session on demand)
- Build app shell: sidebar with session list grouped by project, header with active session info, tab navigation
- Build `+page.server.ts` loaders for session detail route
- **Checkpoint**: `npm run dev` → sidebar lists discovered sessions from cached index, clicking one loads session data and displays raw JSON in the content area (placeholder for real views)

### Phase 2a: Pricing + Cost Calculator

- Implement `lib/pricing.ts` — model pricing constants with local cache
- Implement `scripts/update-pricing.ts` — script to fetch/update pricing from Anthropic's published rates (writes to `src/lib/pricing-data.json`)
- Implement `lib/analysis/cost-calculator.ts` — cost per API call, model string normalization, unknown model handling
- Unit tests for cost calculation against known values
- **Checkpoint**: cost calculator tested, pricing script runnable

### Phase 2b: Token Economics View

- Implement `lib/analysis/token-tracker.ts` — cumulative token accounting per API call
- Build top metrics bar (total cost, input/output tokens, cache hit rate, cost saved by caching)
- Build token waterfall chart (LayerCake grouped bar — input/cache_read/cache_create/output per API call)
- Build cumulative cost over time chart (LayerCake line)
- Build cache efficiency line chart
- Build per-model comparison table
- **Checkpoint**: navigate to a session → Token Economics tab shows real data with working charts

### Phase 2c: Cost Treemap + Latency

- Build cost breakdown treemap (D3 nested rectangles — model > category)
- Build latency vs token count scatter (LayerCake scatter)
- **Checkpoint**: Token Economics view is feature-complete

### Phase 3: Context Window View

- Implement `lib/analysis/context-decomposer.ts` — estimate context composition from aggregate token counts, with compacted summary as its own category
- Build stacked area chart (LayerCake) with color-coded regions
- Add compaction boundary markers (vertical dashed lines with annotations)
- Build "Network tab" row table below the chart (chronological content items)
- Add hover tooltips and click-to-detail interaction
- Add cumulative/incremental toggle, brush/zoom
- Unit tests for context decomposer proportional attribution logic
- **Checkpoint**: navigate to a session → Context Window tab shows stacked area chart with compaction drops and clickable detail panel

### Phase 4a: Tool Analysis

- Implement `lib/analysis/tool-analyzer.ts` — tool success rates, latency (PreToolUse→PostToolUse sequential pairing), context cost
- Build tool summary table (shadcn-svelte data table, sortable)
- Build tool cost distribution (horizontal stacked bar)
- Unit tests for tool latency pairing
- **Checkpoint**: navigate to a session → Tool Effectiveness tab shows summary table and cost distribution

### Phase 4b: Tool Timeline + Subagents

- Build tool timeline (D3 Gantt-style — tool calls over time with latency bars)
- Build context cost vs latency scatter (LayerCake)
- Build subagent deep dive section (cards per subagent with internal metrics)
- Build failure analysis panel (PostToolUseFailure table)
- **Checkpoint**: Tool Effectiveness view is feature-complete

### Phase 5a: Compaction Analysis

- Implement `lib/analysis/compaction-analyzer.ts` — pre/post metrics, cache rate recovery tracking
- Build session compaction timeline (horizontal bar with sparkline height + compaction dividers)
- Build per-compaction detail cards (before/after tokens, cache rate change, recovery turns)
- Unit tests for compaction metrics
- **Checkpoint**: navigate to a session with compaction events → Compaction tab shows timeline and cards

### Phase 5b: Conversation Browser

- Implement DAG builder from uuid/parentUuid in transcript records
- Build conversation tree view (D3 tree layout — user prompts, API call groups, tool calls, system events)
- Build detail panel (full content with markdown rendering, syntax highlighting, token badges)
- Handle subagent nesting (collapsible sub-trees)
- **Checkpoint**: navigate to a session → Conversation tab shows interactive tree with content panel

### Phase 6: Overview Dashboard + Polish

- Implement cross-session aggregation (total sessions, total tokens, total cost, sessions per project)
- Build session table (shadcn-svelte data table — sortable, filterable, searchable)
- Build trend charts (daily token usage, sessions per project, tool usage distribution)
- Cross-session compaction patterns (trigger threshold histogram, duration vs compaction count scatter)
- Dark mode (default — dev tool aesthetic)
- Keyboard navigation
- Error states and loading states for all views
- **Checkpoint**: landing page shows overview dashboard with all sessions, drill-down into any session works end-to-end

## Pricing Update Script

The pricing table lives in `src/lib/pricing-data.json` — a checked-in JSON file that the app reads at runtime. A separate script (`scripts/update-pricing.ts`) updates this file:

```
npx tsx scripts/update-pricing.ts
```

The script:

1. Fetches current pricing from Anthropic's published pricing page (or API docs)
2. Parses model names and per-token rates (input, output, cache_read, cache_create)
3. Merges with existing `pricing-data.json` — adds new models, updates changed prices, preserves manual entries
4. Writes the updated file with a `lastUpdated` timestamp
5. Diffs the old vs new and prints a summary of changes
6. **Fails loudly** if parsing returns zero models or if the page structure has changed beyond recognition — never silently writes partial/empty pricing data

**Design rationale**: The app should never hit external URLs at runtime — it's a local forensic tool analyzing past sessions. Pricing data changes infrequently (new model launches, rare price changes). A manual script run is the right cadence. The JSON file is checked into git so changes are auditable.

**Fallback for unknown models**: The app still uses prefix matching at runtime (e.g., `claude-opus-4-6-20260301` → match `claude-opus-4-6` pricing). The script just keeps the canonical table current.

## Fixture Data

A small representative dataset lives in `tests/fixtures/` for development and testing. The fixtures are extracted from the real session data in `.claude/` and trimmed to be small but representative.

### What to include

- **Event log** (`fixtures/logs/{session_id}.jsonl`): A single session log containing all event types — SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop, Stop. ~50 events, covering the important patterns (sequential tool pairing, subagent lifecycle, failures).
- **Transcript** (`fixtures/projects/{project-slug}/{session_id}.jsonl`): The corresponding transcript with: user records, assistant records (with thinking, text, and tool_use content blocks), system records (turn_duration, compact_boundary, api_error), multiple requestId groups showing streaming chunk deduplication, at least one `<synthetic>` assistant record to test skipping. Include a `compact_boundary` record with real `compactMetadata.preTokens`.
- **Subagent** (`fixtures/projects/{project-slug}/{session_id}/subagents/agent-{id}.jsonl` + `.meta.json`): One subagent transcript with a few turns.
- **Diagnostics** (`fixtures/logs/_diagnostics.jsonl`): A few version change events.

### Extraction approach

Extract from the richest real session (`221974d6-d7aa-4622-854e-0cf013c1c732` — has 24 subagent events, 21 failures, and a matching transcript with compaction). Trim to ~50 event log lines and ~100 transcript lines. Redact any sensitive content (file paths are fine, but strip any secrets or credentials if present). The goal is a fixture that exercises every code path in the parsers.

## Testing Strategy

### Unit tests (Vitest)

Test the analysis and parsing layers against fixture data:

- **`event-log-reader.test.ts`**: Parse fixture event log → verify event counts by type, field presence, timestamp ordering
- **`transcript-reader.test.ts`**: Parse fixture transcript → verify requestId grouping (multiple chunks → single API call), `<synthetic>` filtering, DAG parent-child links, content block extraction. Also: requestId fallback (real assistant record missing requestId falls back to message.id grouping). Also: tool result normalization (structured `toolUseResult` enriches `tool_result` without overriding, string `toolUseResult` ignored, absent `toolUseResult` handled gracefully).
- **`subagent-reader.test.ts`**: Parse fixture subagent → verify meta.json loading, transcript linking
- **`cost-calculator.test.ts`**: Known model → exact cost. Unknown model → prefix match. Unrecognizable model → null cost with warning. `<synthetic>` → skipped.
- **`token-tracker.test.ts`**: Cumulative totals across API calls, cache rate calculation, per-model breakdown
- **`context-decomposer.test.ts`**: Proportional attribution sums to authoritative total. Compaction resets decomposition. Post-compaction "compacted summary" category is correctly sized.
- **`tool-analyzer.test.ts`**: Sequential PreToolUse→PostToolUse pairing. Ambiguous cases → latency unavailable. Success rate calculation.
- **`compaction-analyzer.test.ts`**: preTokens extraction, post-compaction size inference, cache rate recovery tracking
- **`session-index.test.ts`**: Staleness detection — event log mtime change triggers recompute, transcript-only mtime change triggers recompute, subagent-only mtime change triggers recompute, deleted event log removes cached entry, new session is added. Also verify the partial-data `skippedLines` count propagates to the summary.

### Integration tests

- **Session loading**: Load a fixture session through the full pipeline (discovery → parse → analyze) and verify the composite result has all expected fields
- **API route**: Hit `/api/sessions` and `/api/sessions/[id]` with fixture data and verify response shape

### What NOT to test

- UI rendering (charts, layout) — visual verification during development is sufficient for a single-user local tool
- External pricing fetching — the script is run manually and the output is checked in

## Verification

### Core functionality

1. **Startup**: `npm run dev` → app loads, sidebar shows discovered sessions
2. **Session index**: Verify all sessions from `~/.claude/logs/` appear with correct metadata (title from custom-title record, model from SessionStart, duration from first/last event timestamps)
3. **Token accuracy**: For a known session, compare dashboard's total tokens with manual sum of transcript usage fields (deduplicating by requestId or message.id fallback, excluding `<synthetic>` records)
4. **Cost accuracy**: Cross-check cost calculation against Claude API pricing page for each known model
5. **Compaction**: Verify compaction events appear at correct positions. `preTokens` is exact (from `compactMetadata.preTokens`). Post-compaction size is labeled as inferred (`~`) and derived from the next API call's total input tokens.
6. **Tool latency**: Spot-check a few tool calls — confirm latency matches sequential PreToolUse→PostToolUse pairing by tool_name
7. **Conversation DAG**: Verify parent-child relationships render correctly, subagents nest properly

### Edge cases

1. **Unknown model**: Load a session that used a model not in the pricing table. Verify token counts display correctly, cost shows "unavailable" badge, and session total cost shows lower-bound warning.
2. **Synthetic records**: Verify `<synthetic>` assistant records are skipped (not counted in token totals, not rendered in conversation browser)
3. **Missing thinking**: Assistant records with empty thinking blocks show "No thinking" collapsed state, not an error
4. **Incomplete sessions**: Sessions without a SessionEnd event (interrupted) show duration based on last event timestamp, marked as "interrupted"
5. **Subagent aggregation**: Verify session total shows "$X total (main: $Y, subagents: $Z)" breakdown. Overview dashboard total spend = sum of all session totals (main + subagents). Verify the overview total matches the sum of session row costs.
6. **Partial data warning**: Load a session with a truncated/malformed transcript line. Verify the parser skips the bad line, the `skippedLines` count is nonzero, and the UI shows the "Partial data" warning badge.

## Critical Files

- `src/lib/server/transcript-reader.ts` — most complex parser (streaming chunk grouping, DAG construction, subagent correlation)
- `src/lib/analysis/context-decomposer.ts` — core challenge (estimating context composition from aggregate token counts)
- `src/lib/analysis/cost-calculator.ts` — must stay in sync with actual Anthropic pricing
- `src/lib/pricing-data.json` — checked-in pricing table, updated by script
- `scripts/update-pricing.ts` — fetches current Anthropic pricing, updates pricing-data.json
- `src/lib/types.ts` — shared types drive the entire app
- `src/routes/+layout.svelte` — app shell that every view lives inside
- `tests/fixtures/` — representative session data for development and testing
