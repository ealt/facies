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
- **No external database** — all data read from filesystem at request time

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
      sessions/+server.ts       # GET: list all sessions (index from event logs)
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

### Streaming Chunk Deduplication

Multiple assistant records per API call share the same `requestId` (thinking, text, tool_use chunks). Group by requestId. Token usage is identical across chunks — take from the first.

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
4. **Compaction boundaries**: After a `compact_boundary`, the context resets. The first post-compaction API call's total input tokens shows the new baseline. The "tokens freed" calculation (`preTokens - post total`) is exact for preTokens (from `compactMetadata.preTokens`) and uses the next API call's total input as the post estimate — labeled as "~post-compaction size (inferred from next API call)".
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
- Known models: exact match against pricing table
- Unknown models: attempt prefix match (e.g., `claude-opus-*` → use opus pricing). If no match, display token counts without cost and flag "unknown model — cost unavailable" in the UI. The session's total cost is shown as a lower bound with a warning badge.
- The pricing table is a single `pricing.ts` file — easy to update when new models ship.

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

### Phase 1: Foundation

- `npx sv create claude-session-analyzer` (SvelteKit skeleton)
- Add shadcn-svelte, Tailwind CSS 4, LayerCake, D3
- Implement server-side data discovery and parsing (`lib/server/`)
- Build API routes (`/api/sessions`, `/api/sessions/[id]`)
- Build app shell: sidebar with session list, header, tab navigation
- Define all TypeScript types (`lib/types.ts`)

### Phase 2: Token Economics View

- Implement `token-tracker.ts` and `cost-calculator.ts`
- Build token waterfall chart (LayerCake grouped bar)
- Build cost breakdown (D3 treemap)
- Build cache efficiency line chart
- Wire up top metrics bar

### Phase 3: Context Window View

- Implement `context-decomposer.ts` — the hardest analysis piece
- Build stacked area chart (LayerCake)
- Add compaction boundary markers
- Add hover tooltips and click-to-detail

### Phase 4: Tool Effectiveness View

- Implement `tool-analyzer.ts`
- Build tool summary table (shadcn-svelte data table)
- Build tool timeline (D3 Gantt)
- Build scatter plot (LayerCake)
- Add subagent deep dive and failure table

### Phase 5: Compaction + Conversation

- Implement `compaction-analyzer.ts`
- Build compaction timeline and cards
- Implement DAG builder from uuid/parentUuid
- Build conversation tree (D3 tree layout)
- Build detail panel with content rendering

### Phase 6: Overview Dashboard + Polish

- Cross-session aggregation
- Session table with sorting/filtering
- Trend charts
- Dark mode (default — dev tool)
- Keyboard navigation

## Verification

### Core functionality

1. **Startup**: `npm run dev` → app loads, sidebar shows discovered sessions
2. **Session index**: Verify all sessions from `~/.claude/logs/` appear with correct metadata (title from custom-title record, model from SessionStart, duration from first/last event timestamps)
3. **Token accuracy**: For a known session, compare dashboard's total tokens with manual sum of transcript usage fields (deduplicating by requestId, excluding `<synthetic>` records)
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

## Critical Files

- `src/lib/server/transcript-reader.ts` — most complex parser (streaming chunk grouping, DAG construction, subagent correlation)
- `src/lib/analysis/context-decomposer.ts` — core challenge (estimating context composition from aggregate token counts)
- `src/lib/analysis/cost-calculator.ts` — must stay in sync with actual Anthropic pricing
- `src/lib/types.ts` — shared types drive the entire app
- `src/routes/+layout.svelte` — app shell that every view lives inside
