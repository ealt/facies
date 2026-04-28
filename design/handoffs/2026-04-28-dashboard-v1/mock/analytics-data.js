// analytics-data.js — mock data for Token Economics, Tool Effectiveness,
// Compaction analytics, Subagents deep dive, and the raw-data explorer.
//
// Loosely modeled on the upstream Facies analyzers. Numbers are made up but
// internally consistent (per-call cost matches per-model totals, etc).

(function () {
  // ──────────────────────────────────────────────────────────────────────
  // Per-API-call timeseries — used for cumulative cost, cache efficiency,
  // latency scatter, and the cost-breakdown / per-model table.
  // ──────────────────────────────────────────────────────────────────────
  const API_CALLS = (function () {
    const out = [];
    let cumIn = 0, cumOut = 0, cumCacheRead = 0, cumCost = 0;
    let cumFresh = 0, cumCacheWrite = 0;
    for (let i = 0; i < 60; i++) {
      // Pre-compaction: cache builds up steadily. Compaction at i=28 zeroes it.
      const isCompactedTurn = i >= 28;
      const cacheBoost = isCompactedTurn ? Math.min((i - 28) / 8, 1) : 1;

      const fresh = Math.round(800 + Math.random() * 1200 + (isCompactedTurn ? 1500 * (1 - cacheBoost) : 0));
      const cacheRead = Math.round(isCompactedTurn ? cacheBoost * (40_000 + i * 1500) : 28_000 + i * 800 + Math.random() * 4000);
      const cacheWrite = Math.round(2000 + Math.random() * 2500);
      const out_ = Math.round(1100 + Math.random() * 1800);
      const model = i < 12 ? 'claude-3-5-sonnet'
                  : i < 18 ? 'claude-3-haiku'
                  : 'claude-3-5-sonnet';
      // Sonnet pricing approx: $3/M in (fresh), $0.30/M cache read, $3.75/M cache write, $15/M out
      // Haiku: $0.25/M in, $0.03/M cache read, $0.30/M cache write, $1.25/M out
      const px = model === 'claude-3-5-sonnet'
        ? { in: 3 / 1e6, cr: 0.30 / 1e6, cw: 3.75 / 1e6, out: 15 / 1e6 }
        : { in: 0.25 / 1e6, cr: 0.03 / 1e6, cw: 0.30 / 1e6, out: 1.25 / 1e6 };
      const cost = fresh * px.in + cacheRead * px.cr + cacheWrite * px.cw + out_ * px.out;

      cumFresh += fresh;
      cumIn += fresh + cacheRead + cacheWrite;
      cumOut += out_;
      cumCacheRead += cacheRead;
      cumCacheWrite += cacheWrite;
      cumCost += cost;

      const totalIn = fresh + cacheRead + cacheWrite;
      const cacheRate = totalIn ? cacheRead / totalIn : 0;
      // Latency: roughly correlated to non-cache input + small noise
      const latencyMs = Math.round(800 + (fresh + out_ * 0.6) * 0.4 + Math.random() * 1500);

      out.push({
        index: i,
        timestamp: Date.now() - (60 - i) * 60_000,
        model,
        freshTokens: fresh,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        outputTokens: out_,
        totalInputTokens: totalIn,
        cacheRate,
        cost,
        latencyMs,
        cumFresh, cumCacheRead, cumCacheWrite, cumOut, cumCost,
        cumCacheRate: cumIn ? cumCacheRead / cumIn : 0,
      });
    }
    return out;
  })();

  // ──────────────────────────────────────────────────────────────────────
  // Per-model summary, derived from API_CALLS.
  // ──────────────────────────────────────────────────────────────────────
  const PER_MODEL = (function () {
    const map = new Map();
    for (const c of API_CALLS) {
      let m = map.get(c.model);
      if (!m) {
        m = {
          model: c.model, apiCalls: 0,
          freshTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0,
          totalCost: 0, totalLatency: 0,
        };
        map.set(c.model, m);
      }
      m.apiCalls++;
      m.freshTokens += c.freshTokens;
      m.cacheReadTokens += c.cacheReadTokens;
      m.cacheWriteTokens += c.cacheWriteTokens;
      m.outputTokens += c.outputTokens;
      m.totalCost += c.cost;
      m.totalLatency += c.latencyMs;
    }
    return [...map.values()].map(m => ({
      ...m,
      inputTokens: m.freshTokens + m.cacheReadTokens + m.cacheWriteTokens,
      cacheRate: (m.freshTokens + m.cacheReadTokens + m.cacheWriteTokens)
        ? m.cacheReadTokens / (m.freshTokens + m.cacheReadTokens + m.cacheWriteTokens)
        : 0,
      avgLatencyMs: m.apiCalls ? m.totalLatency / m.apiCalls : 0,
    })).sort((a, b) => b.totalCost - a.totalCost);
  })();

  // ──────────────────────────────────────────────────────────────────────
  // Tool calls — used by Tool Effectiveness panel (table, timeline, scatter,
  // failure analysis).
  // ──────────────────────────────────────────────────────────────────────
  const TOOL_NAMES = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob', 'WebFetch', 'TodoWrite'];
  const TOOL_CALLS = (function () {
    const out = [];
    let n = 0;
    for (let i = 0; i < 86; i++) {
      const name = TOOL_NAMES[Math.floor(Math.random() * TOOL_NAMES.length)];
      // Per-tool latency profile
      const baseLatency = {
        Read: 60, Edit: 120, Write: 90, Bash: 1800,
        Grep: 220, Glob: 120, WebFetch: 2400, TodoWrite: 40,
      }[name];
      const baseInput = {
        Read: 90, Edit: 1200, Write: 2400, Bash: 80,
        Grep: 70, Glob: 60, WebFetch: 200, TodoWrite: 800,
      }[name];
      const baseResp = {
        Read: 12_000, Edit: 800, Write: 200, Bash: 6_000,
        Grep: 4_500, Glob: 1_200, WebFetch: 28_000, TodoWrite: 200,
      }[name];

      const inputSize = Math.round(baseInput * (0.7 + Math.random() * 0.8));
      const respSize = Math.round(baseResp * (0.5 + Math.random() * 1.6));
      const latencyMs = Math.round(baseLatency * (0.6 + Math.random() * 1.5));
      const failed = Math.random() < (name === 'WebFetch' ? 0.18 : name === 'Bash' ? 0.09 : 0.03);
      const apiCallIndex = Math.min(59, Math.floor(i / 86 * 60));

      out.push({
        index: n++,
        toolName: name,
        timestamp: Date.now() - (86 - i) * 25_000,
        endTimestamp: Date.now() - (86 - i) * 25_000 + latencyMs,
        latencyMs,
        inputSize,
        responseSize: failed ? 0 : respSize,
        // ~4 chars/token rough estimate, like upstream tool-analyzer
        contextTokens: Math.round((failed ? 0 : respSize) / 4),
        failed,
        error: failed
          ? (name === 'WebFetch' ? 'request timed out after 30s'
            : name === 'Bash' ? "command exited with code 1: 'permission denied'"
            : 'tool execution failed')
          : null,
        inputPreview: name === 'Read' ? `src/lib/components/views/${['ContextWindowView','ConversationView','TokenEconomicsView'][i%3]}.svelte`
          : name === 'Edit' ? `replaced 3 lines in ./src/app.css`
          : name === 'Bash' ? `pnpm run check`
          : name === 'Grep' ? `pattern: 'computeContextDecomposition'`
          : name === 'Glob' ? `pattern: 'src/**/*.svelte'`
          : name === 'WebFetch' ? `url: https://docs.anthropic.com/${['claude','agents','tools'][i%3]}`
          : name === 'Write' ? `wrote 248 lines to ./README.md`
          : name === 'TodoWrite' ? `5 tasks updated`
          : '',
        inputKeys: name === 'Read' ? ['file_path']
          : name === 'Edit' ? ['file_path','old_string','new_string']
          : name === 'Bash' ? ['command']
          : name === 'Grep' ? ['pattern','path']
          : name === 'Glob' ? ['pattern']
          : name === 'WebFetch' ? ['url']
          : name === 'Write' ? ['file_path','content']
          : ['todos'],
        apiCallIndex,
      });
    }
    return out;
  })();

  // Aggregate: per-tool summary
  const TOOL_SUMMARY = (function () {
    const map = new Map();
    for (const c of TOOL_CALLS) {
      let s = map.get(c.toolName);
      if (!s) {
        s = {
          toolName: c.toolName, callCount: 0, failureCount: 0,
          totalInput: 0, totalResponse: 0, totalContextTokens: 0,
          latencies: [],
        };
        map.set(c.toolName, s);
      }
      s.callCount++;
      if (c.failed) s.failureCount++;
      s.totalInput += c.inputSize;
      s.totalResponse += c.responseSize;
      s.totalContextTokens += c.contextTokens;
      s.latencies.push(c.latencyMs);
    }
    return [...map.values()].map(s => {
      const sortedLat = [...s.latencies].sort((a, b) => a - b);
      const p95 = sortedLat[Math.floor(sortedLat.length * 0.95)] ?? null;
      const avgLat = sortedLat.reduce((a, b) => a + b, 0) / sortedLat.length;
      // ~$3/M for context tokens (roughly avg sonnet cost)
      const contextCost = s.totalContextTokens * (3 / 1_000_000);
      return {
        toolName: s.toolName,
        callCount: s.callCount,
        failureCount: s.failureCount,
        successRate: (s.callCount - s.failureCount) / s.callCount,
        avgInputSize: s.totalInput / s.callCount,
        avgResponseSize: s.totalResponse / s.callCount,
        totalContextTokens: s.totalContextTokens,
        estimatedContextCost: contextCost,
        costPerCall: contextCost / s.callCount,
        avgLatencyMs: avgLat,
        p95LatencyMs: p95,
      };
    }).sort((a, b) => b.callCount - a.callCount);
  })();

  // ──────────────────────────────────────────────────────────────────────
  // Compaction analysis — multi-compaction synthetic scenario.
  // We extend our existing single compaction with a second, smaller one for
  // demonstration purposes.
  // ──────────────────────────────────────────────────────────────────────
  const COMPACTIONS_DETAIL = [
    {
      idx: 0,
      apiCallIndex: 28,
      timestamp: Date.now() - 35 * 60_000,
      trigger: 'auto',
      preTokens: 1_180_000,
      postTokens: 340_000,
      tokensFreed: 840_000,
      elapsedMs: 18 * 60_000,
      turnsBefore: 28,
      cacheRateBefore: 0.81,
      cacheRateAfter: 0.04,
      recoveryTurns: 6,
      firstPostCompactionCost: 0.0421,
      avgPreCompactionCost: 0.1184,
    },
    // Demo only — second compaction much later
    {
      idx: 1,
      apiCallIndex: 53,
      timestamp: Date.now() - 9 * 60_000,
      trigger: 'manual',
      preTokens: 920_000,
      postTokens: 290_000,
      tokensFreed: 630_000,
      elapsedMs: 42 * 60_000,
      turnsBefore: 25,
      cacheRateBefore: 0.78,
      cacheRateAfter: 0.06,
      recoveryTurns: null,        // not yet recovered
      firstPostCompactionCost: 0.0358,
      avgPreCompactionCost: 0.0912,
    },
  ];

  // ──────────────────────────────────────────────────────────────────────
  // Subagents — used for the SubagentDeepDive panel.
  // ──────────────────────────────────────────────────────────────────────
  const SUBAGENTS_DETAIL = [
    {
      agentId: 'sub-01',
      agentType: 'Explore',
      description: 'find all usages of computeContextDecomposition',
      durationMs: 78_000,
      internalToolCalls: 14,
      totalInputTokens: 412_000,
      totalOutputTokens: 8_400,
      totalCost: 0.61,
      costIsLowerBound: false,
      contextOverheadTokens: 9_200,
      lastAssistantMessage: `Found 4 call sites for computeContextDecomposition:
1. src/routes/session/[id]/+page.svelte — main entry, runs on $derived
2. src/lib/components/views/ContextWindowView.svelte — receives result via props
3. tests/context-decomposer.test.ts — unit tests
4. src/lib/analysis/__fixtures__/golden.ts — golden snapshot fixtures

Recommend: refactor signature change in token-tracker.js first, then run goldens.`,
    },
    {
      agentId: 'sub-02',
      agentType: 'Plan',
      description: 'plan compaction analyzer refactor',
      durationMs: 124_000,
      internalToolCalls: 22,
      totalInputTokens: 680_000,
      totalOutputTokens: 12_100,
      totalCost: 1.02,
      costIsLowerBound: false,
      contextOverheadTokens: 14_800,
      lastAssistantMessage: `Refactor plan: split computeCompactionAnalysis into three pure functions —
(1) extractCompactionEvents: pulls compactMetadata records from transcript
(2) inferPostCompactionTokens: walks forward to next API call to attribute postTokens
(3) computeRecoveryTurns: walks forward until cache rate >80%

Each is O(n) with no side effects. Tests live alongside in compaction-analyzer.test.ts.

Risk: existing callers expect the analyzer to return the bundled shape; we'd ship a thin wrapper that preserves the public API for one release.`,
    },
    {
      agentId: 'sub-03',
      agentType: 'general-purpose',
      description: 'audit tool error taxonomy',
      durationMs: 41_000,
      internalToolCalls: 8,
      totalInputTokens: 188_000,
      totalOutputTokens: 3_900,
      totalCost: 0.28,
      costIsLowerBound: true,
      contextOverheadTokens: 4_100,
      lastAssistantMessage: `Audited 86 tool calls. Distinct error families:
- timeouts (WebFetch, mostly third-party)
- permissions (Bash, e.g. EACCES on chmod, denied sudo)
- not-found (Read against deleted files in mid-session moves)

Suggest grouping in the failure panel by family rather than by tool, and exposing a "first occurrence" timestamp.`,
    },
  ];

  // ──────────────────────────────────────────────────────────────────────
  // Raw event-log records — for the Raw Data Explorer.
  // We synthesize 4 streams: events, transcript records, api calls, tool results.
  // ──────────────────────────────────────────────────────────────────────
  const sessionId = 'sess_3f2a8b1e9d4c5e6f';
  const cwd = '/Users/eric/code/facies';
  function rid() { return Math.random().toString(36).slice(2, 12); }
  const baseTs = Date.now() - 60 * 60_000;

  const RAW_EVENTS = (function () {
    const out = [];
    out.push({ event: 'SessionStart', timestamp: new Date(baseTs).toISOString(), sessionId, cwd, model: 'claude-3-5-sonnet' });
    let t = baseTs + 800;
    for (let i = 0; i < 28; i++) {
      out.push({ event: 'UserPromptSubmit', timestamp: new Date(t).toISOString(), promptId: rid(), turn: i, len: 60 + Math.round(Math.random() * 240) });
      t += 600 + Math.random() * 1500;
      out.push({ event: 'PreToolUse', timestamp: new Date(t).toISOString(), toolName: TOOL_NAMES[i % TOOL_NAMES.length], callId: rid() });
      t += 300 + Math.random() * 800;
      out.push({ event: 'PostToolUse', timestamp: new Date(t).toISOString(), toolName: TOOL_NAMES[i % TOOL_NAMES.length], callId: rid(), durationMs: Math.round(60 + Math.random() * 1500) });
      t += 500;
    }
    out.push({ event: 'CompactionStart', timestamp: new Date(t).toISOString(), trigger: 'auto', preTokens: 1_180_000 });
    t += 1500;
    out.push({ event: 'CompactionComplete', timestamp: new Date(t).toISOString(), tokensFreed: 840_000, summaryLen: 4_200 });
    for (let i = 0; i < 30; i++) {
      t += 700 + Math.random() * 1500;
      out.push({ event: 'UserPromptSubmit', timestamp: new Date(t).toISOString(), promptId: rid(), turn: 28 + i, len: 80 + Math.round(Math.random() * 200) });
      t += 600;
      out.push({ event: 'PreToolUse', timestamp: new Date(t).toISOString(), toolName: TOOL_NAMES[i % TOOL_NAMES.length], callId: rid() });
      t += 300;
      out.push({ event: 'PostToolUse', timestamp: new Date(t).toISOString(), toolName: TOOL_NAMES[i % TOOL_NAMES.length], callId: rid(), durationMs: Math.round(60 + Math.random() * 1200) });
    }
    return out;
  })();

  const RAW_TRANSCRIPT = (function () {
    const out = [];
    let t = baseTs;
    for (let i = 0; i < 60; i++) {
      const role = i % 2 === 0 ? 'user' : 'assistant';
      const isCompactionMarker = i === 28;
      const rec = {
        type: isCompactionMarker ? 'compaction' : 'message',
        role,
        timestamp: new Date(t).toISOString(),
        uuid: rid(),
        sessionId,
        index: i,
        ...(isCompactionMarker ? {
          compactMetadata: { trigger: 'auto', preTokens: 1_180_000, postTokens: null },
        } : {
          content: role === 'user'
            ? `look at the failing test in token-tracker.test.ts and figure out why cache rate is wrong`
            : `Looking at token-tracker.test.ts now. The test expects cacheRate = (cache_read) / (input + cache_read + cache_create), but the implementation only divides by input. Will fix.`,
        }),
      };
      out.push(rec);
      t += 30_000 + Math.random() * 60_000;
    }
    return out;
  })();

  const RAW_API_CALLS = API_CALLS.map((c, i) => ({
    apiCallIndex: c.index,
    timestamp: new Date(c.timestamp).toISOString(),
    model: c.model,
    requestId: 'req_' + rid(),
    usage: {
      input_tokens: c.freshTokens,
      cache_read_input_tokens: c.cacheReadTokens,
      cache_creation_input_tokens: c.cacheWriteTokens,
      output_tokens: c.outputTokens,
    },
    cost: c.cost,
    latencyMs: c.latencyMs,
    stopReason: i === 27 ? 'compaction' : 'end_turn',
  }));

  const RAW_TOOL_RESULTS = TOOL_CALLS.map(c => ({
    callId: 'tc_' + Math.random().toString(36).slice(2, 12),
    toolName: c.toolName,
    timestamp: new Date(c.timestamp).toISOString(),
    durationMs: c.latencyMs,
    inputBytes: c.inputSize,
    responseBytes: c.responseSize,
    error: c.error,
    inputPreview: c.inputPreview,
  }));

  Object.assign(window, {
    API_CALLS, PER_MODEL, TOOL_CALLS, TOOL_SUMMARY,
    COMPACTIONS_DETAIL, SUBAGENTS_DETAIL,
    RAW_EVENTS, RAW_TRANSCRIPT, RAW_API_CALLS, RAW_TOOL_RESULTS,
  });
})();
