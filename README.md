# Facies

Context window stratigraphy. Session analytics for Claude Code.

Facies analyzes the layers of your context window -- what fills it, what it
costs, and how compaction reshapes it. It reads Claude Code session data from
your local `~/.claude/` directory and presents it as an interactive dashboard.

## What It Shows

- **Overview Dashboard** -- total spend, token usage trends, tool distribution, session table with sort/filter/search
- **Token Economics** -- per-API-call token waterfall, cumulative cost, cache efficiency, latency scatter
- **Context Window** -- stacked area chart of context composition over time (system, user, assistant, tool results, compacted summary)
- **Tool Effectiveness** -- tool success rates, latency, context cost, Gantt-style timeline
- **Compaction Analysis** -- pre/post compaction metrics, cache rate recovery, threshold patterns
- **Conversation Browser** -- hierarchical DAG of the session: prompts, responses, tool calls, subagent sub-trees

## Quick Start

1. **Prerequisites**: Node.js 20+, Claude Code with logging hooks configured (`~/.claude/logs/` must contain session data)

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` -- Facies discovers and indexes all sessions from `~/.claude/`, then presents the overview dashboard.

## How It Works

Facies reads two data sources from your local Claude Code installation:

- **Event logs** (`~/.claude/logs/*.jsonl`) -- lightweight event stream: session start/end, tool calls, compaction events, subagent lifecycle
- **Transcripts** (`~/.claude/projects/**/*.jsonl`) -- full conversation history with API token usage, content blocks, and the uuid/parentUuid DAG

On first load, Facies parses all sessions and builds a cached index (`.cache/session-index.json`). Subsequent loads only reparse sessions whose source files have changed (mtime-based staleness detection). Individual session detail views parse one session on demand.

No data leaves your machine. Facies is a local-only forensic tool.

## Stack

- **Svelte 5 + SvelteKit** -- framework
- **shadcn-svelte** -- UI components
- **D3 + LayerCake** -- charting
- **Tailwind CSS 4** -- styling
- **Vitest** -- testing

## Documentation

- [Contributing](CONTRIBUTING.md) -- development setup and workflow
- [Style Guide](STYLE_GUIDE.md) -- code formatting rules
- [AGENTS.md](AGENTS.md) -- AI agent guidance (commands, architecture, patterns)

## License

MIT
