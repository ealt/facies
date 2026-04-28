// AnalyticsCharts.jsx — chart primitives for Token Economics, Tool Effectiveness, Compaction.
// All flat-fill, mono-labeled, no transparency on category fills, sharp edges.

const AC_T = {
  border: '#1f1f1f', border2: '#2a2a2a',
  ink: '#e5e5e5', ink2: '#888888', ink3: '#555555',
  amber: '#ffb000', amber2: '#ff8800',
  green: '#00d97e', cyan: '#5dd9e0', red: '#ff4d4d', purple: '#b377ff',
  mono: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
};

const TOOL_PALETTE = {
  Read: '#5dd9e0', Edit: '#00d97e', Write: '#7af0a3',
  Bash: '#ffb000', Grep: '#b377ff', Glob: '#ff8ad6',
  WebFetch: '#ff4d4d', TodoWrite: '#888888',
};

// ──────────────────────────────────────────────────────────────────────
// Cumulative cost — line chart over API call index
// ──────────────────────────────────────────────────────────────────────
function CumulativeCostChart({ apiCalls, height = 180 }) {
  const W = 880, H = height, P = { t: 14, r: 56, b: 22, l: 56 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  if (!apiCalls.length) return null;
  const maxCost = Math.max(...apiCalls.map(c => c.cumCost), 0.01);
  const xStep = innerW / Math.max(1, apiCalls.length - 1);
  const pts = apiCalls.map((c, i) => [i * xStep, innerH - (c.cumCost / maxCost) * innerH]);
  const path = 'M ' + pts.map(p => p.join(',')).join(' L ');
  const area = path + ` L ${pts[pts.length - 1][0]},${innerH} L 0,${innerH} Z`;
  const yTicks = [0, 0.5, 1].map(p => ({ v: maxCost * p, y: innerH - p * innerH }));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {yTicks.map((tk, i) => (
          <g key={i}>
            <line x1={0} x2={innerW} y1={tk.y} y2={tk.y} stroke={AC_T.border} strokeWidth="1"/>
            <text x={-8} y={tk.y + 3} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>${tk.v.toFixed(2)}</text>
          </g>
        ))}
        <path d={area} fill={AC_T.green} opacity="0.10"/>
        <path d={path} stroke={AC_T.green} strokeWidth="1.4" fill="none"/>
        {/* compaction marker */}
        <line x1={28 * xStep} x2={28 * xStep} y1={0} y2={innerH} stroke={AC_T.red} strokeWidth="1" strokeDasharray="2 3" opacity="0.7"/>
        <text x={0} y={innerH + 14} fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>API 0</text>
        <text x={innerW} y={innerH + 14} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>{apiCalls.length - 1}</text>
        <text x={innerW + 8} y={pts[pts.length - 1][1] + 3} fontSize="10" fill={AC_T.green} fontFamily={AC_T.mono}>${maxCost.toFixed(2)}</text>
      </g>
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Cache efficiency — line chart, % over API call index
// ──────────────────────────────────────────────────────────────────────
function CacheEfficiencyChart({ apiCalls, height = 180 }) {
  const W = 880, H = height, P = { t: 14, r: 56, b: 22, l: 56 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  if (!apiCalls.length) return null;
  const xStep = innerW / Math.max(1, apiCalls.length - 1);
  const pts = apiCalls.map((c, i) => [i * xStep, innerH - c.cacheRate * innerH]);
  const path = 'M ' + pts.map(p => p.join(',')).join(' L ');
  const yTicks = [0, 0.5, 1].map(p => ({ v: p, y: innerH - p * innerH }));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {yTicks.map((tk, i) => (
          <g key={i}>
            <line x1={0} x2={innerW} y1={tk.y} y2={tk.y} stroke={AC_T.border} strokeWidth="1"/>
            <text x={-8} y={tk.y + 3} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>{(tk.v * 100).toFixed(0)}%</text>
          </g>
        ))}
        <path d={path} stroke={AC_T.cyan} strokeWidth="1.4" fill="none"/>
        <line x1={28 * xStep} x2={28 * xStep} y1={0} y2={innerH} stroke={AC_T.red} strokeWidth="1" strokeDasharray="2 3" opacity="0.7"/>
        <text x={28 * xStep + 4} y={11} fontSize="9" fill={AC_T.red} fontFamily={AC_T.mono}>COMPACT</text>
        <text x={0} y={innerH + 14} fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>API 0</text>
        <text x={innerW} y={innerH + 14} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>{apiCalls.length - 1}</text>
      </g>
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Latency scatter — input tokens (x) vs latency ms (y), colored by model
// ──────────────────────────────────────────────────────────────────────
function LatencyScatter({ apiCalls, height = 240 }) {
  const W = 880, H = height, P = { t: 14, r: 14, b: 28, l: 56 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  if (!apiCalls.length) return null;
  const maxIn = Math.max(...apiCalls.map(c => c.totalInputTokens), 1);
  const maxLat = Math.max(...apiCalls.map(c => c.latencyMs), 1);
  const modelColor = (m) => m === 'claude-3-5-sonnet' ? AC_T.cyan
    : m === 'claude-3-haiku' ? AC_T.green : AC_T.amber;

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({ v: maxIn * p, x: p * innerW }));
  const yTicks = [0, 0.5, 1].map(p => ({ v: maxLat * p, y: innerH - p * innerH }));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {yTicks.map((tk, i) => (
          <g key={i}>
            <line x1={0} x2={innerW} y1={tk.y} y2={tk.y} stroke={AC_T.border} strokeWidth="1"/>
            <text x={-8} y={tk.y + 3} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>{(tk.v / 1000).toFixed(1)}s</text>
          </g>
        ))}
        {xTicks.map((tk, i) => (
          <text key={i} x={tk.x} y={innerH + 14} textAnchor="middle" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>
            {fmtTokens(tk.v)}
          </text>
        ))}
        {apiCalls.map((c, i) => (
          <circle key={i}
            cx={(c.totalInputTokens / maxIn) * innerW}
            cy={innerH - (c.latencyMs / maxLat) * innerH}
            r="2.5" fill={modelColor(c.model)}
          />
        ))}
        <text x={innerW / 2} y={innerH + 22} textAnchor="middle" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>INPUT TOKENS →</text>
      </g>
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Cost breakdown — horizontal bar chart of perModel rows (treemap-ish)
// ──────────────────────────────────────────────────────────────────────
function CostBreakdownBars({ perModel, height }) {
  const total = perModel.reduce((s, m) => s + m.totalCost, 0);
  return (
    <div style={{ font: 'var(--small)' }}>
      {perModel.map((m, i) => {
        const pct = total ? m.totalCost / total : 0;
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontFamily: AC_T.mono, color: AC_T.ink, fontSize: 11 }}>{m.model}</span>
              <span style={{ color: AC_T.ink2, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                ${m.totalCost.toFixed(2)} <span style={{ color: AC_T.ink3 }}>({(pct * 100).toFixed(1)}%)</span>
              </span>
            </div>
            <div style={{ height: 10, background: AC_T.border, border: `1px solid ${AC_T.border2}` }}>
              <div style={{ height: '100%', width: `${pct * 100}%`, background: i === 0 ? AC_T.green : AC_T.cyan }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Tool cost distribution — stacked horizontal bar of context tokens by tool
// ──────────────────────────────────────────────────────────────────────
function ToolCostStack({ summaries }) {
  const total = summaries.reduce((s, x) => s + x.totalContextTokens, 0);
  if (!total) return null;
  return (
    <div>
      <div style={{ display: 'flex', height: 20, border: `1px solid ${AC_T.border2}`, marginBottom: 10 }}>
        {summaries.map((s, i) => (
          <div key={i}
            title={`${s.toolName} · ${fmtTokens(s.totalContextTokens)} (${((s.totalContextTokens/total)*100).toFixed(1)}%)`}
            style={{ width: `${(s.totalContextTokens/total)*100}%`, background: TOOL_PALETTE[s.toolName] || AC_T.ink2 }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 10 }}>
        {summaries.map((s, i) => (
          <span key={i} style={{ color: AC_T.ink2, display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ width: 10, height: 8, background: TOOL_PALETTE[s.toolName] || AC_T.ink2, marginRight: 6 }}/>
            {s.toolName}
            <span style={{ color: AC_T.ink3, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>
              {fmtTokens(s.totalContextTokens)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Tool timeline — Gantt-like dots over API call index, colored by tool
// ──────────────────────────────────────────────────────────────────────
function ToolTimeline({ calls, height = 220 }) {
  const W = 880, H = height, P = { t: 14, r: 14, b: 26, l: 80 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  const tools = [...new Set(calls.map(c => c.toolName))];
  const rowH = innerH / Math.max(tools.length, 1);
  const maxIdx = Math.max(...calls.map(c => c.apiCallIndex), 1);
  const xFor = (idx) => (idx / maxIdx) * innerW;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {tools.map((t, i) => (
          <g key={t}>
            <line x1={0} x2={innerW} y1={(i + 0.5) * rowH} y2={(i + 0.5) * rowH} stroke={AC_T.border} strokeWidth="1"/>
            <text x={-8} y={(i + 0.5) * rowH + 3} textAnchor="end" fontSize="10" fill={AC_T.ink2} fontFamily={AC_T.mono}>
              {t}
            </text>
          </g>
        ))}
        {calls.map((c, i) => {
          const tIdx = tools.indexOf(c.toolName);
          const x = xFor(c.apiCallIndex);
          const y = (tIdx + 0.5) * rowH;
          // size proportional to log(latency)
          const r = 2 + Math.min(5, Math.log10(c.latencyMs + 10) - 1);
          return (
            <circle key={i} cx={x} cy={y} r={r}
              fill={c.failed ? AC_T.red : (TOOL_PALETTE[c.toolName] || AC_T.ink2)}
              opacity={c.failed ? 1 : 0.85}
            />
          );
        })}
        <line x1={xFor(28)} x2={xFor(28)} y1={-4} y2={innerH} stroke={AC_T.red} strokeWidth="1" strokeDasharray="2 3" opacity="0.7"/>
        <text x={0} y={innerH + 16} fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>API 0</text>
        <text x={innerW} y={innerH + 16} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>{maxIdx}</text>
      </g>
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Tool scatter — context cost (x) vs latency (y), dot size = response size
// ──────────────────────────────────────────────────────────────────────
function ToolScatter({ calls, height = 240 }) {
  const W = 880, H = height, P = { t: 14, r: 14, b: 28, l: 56 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  if (!calls.length) return null;
  const maxCtx = Math.max(...calls.map(c => c.contextTokens), 1);
  const maxLat = Math.max(...calls.map(c => c.latencyMs), 1);
  const maxResp = Math.max(...calls.map(c => c.responseSize), 1);
  const yTicks = [0, 0.5, 1].map(p => ({ v: maxLat * p, y: innerH - p * innerH }));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({ v: maxCtx * p, x: p * innerW }));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {yTicks.map((tk, i) => (
          <g key={i}>
            <line x1={0} x2={innerW} y1={tk.y} y2={tk.y} stroke={AC_T.border} strokeWidth="1"/>
            <text x={-8} y={tk.y + 3} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>
              {tk.v >= 1000 ? (tk.v / 1000).toFixed(1) + 's' : Math.round(tk.v) + 'ms'}
            </text>
          </g>
        ))}
        {xTicks.map((tk, i) => (
          <text key={i} x={tk.x} y={innerH + 14} textAnchor="middle" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>
            {fmtTokens(tk.v)}
          </text>
        ))}
        {calls.map((c, i) => {
          const r = 1.5 + Math.sqrt(c.responseSize / maxResp) * 6;
          return (
            <circle key={i}
              cx={(c.contextTokens / maxCtx) * innerW}
              cy={innerH - (c.latencyMs / maxLat) * innerH}
              r={r}
              fill={c.failed ? AC_T.red : (TOOL_PALETTE[c.toolName] || AC_T.ink2)}
              opacity={c.failed ? 1 : 0.7}
            />
          );
        })}
        <text x={innerW / 2} y={innerH + 22} textAnchor="middle" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>~CONTEXT TOKENS →</text>
      </g>
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Compaction chart — context size line + dashed compaction markers
// ──────────────────────────────────────────────────────────────────────
function CompactionContextChart({ apiCalls, snapshots, compactions, height = 220 }) {
  const W = 880, H = height, P = { t: 14, r: 14, b: 24, l: 56 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  if (!snapshots.length) return null;
  const max = Math.max(...snapshots.map(s => s.totalTokens), 1) * 1.05;
  const xStep = innerW / Math.max(1, snapshots.length - 1);
  const pts = snapshots.map((s, i) => [i * xStep, innerH - (s.totalTokens / max) * innerH]);
  const path = 'M ' + pts.map(p => p.join(',')).join(' L ');
  const area = path + ` L ${pts[pts.length - 1][0]},${innerH} L 0,${innerH} Z`;
  const yTicks = [0, 0.5, 1].map(p => ({ v: max * p, y: innerH - p * innerH }));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {yTicks.map((tk, i) => (
          <g key={i}>
            <line x1={0} x2={innerW} y1={tk.y} y2={tk.y} stroke={AC_T.border} strokeWidth="1"/>
            <text x={-8} y={tk.y + 3} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>{fmtTokens(tk.v)}</text>
          </g>
        ))}
        <path d={area} fill={AC_T.cyan} opacity="0.10"/>
        <path d={path} stroke={AC_T.cyan} strokeWidth="1.4" fill="none"/>
        {compactions.map((c, i) => (
          <g key={i}>
            <line x1={c.apiCallIndex * xStep} x2={c.apiCallIndex * xStep} y1={0} y2={innerH}
              stroke={AC_T.red} strokeWidth="1.2" strokeDasharray="3 3" opacity="0.85"/>
            <text x={c.apiCallIndex * xStep + 4} y={11} fontSize="9" fill={AC_T.red} fontFamily={AC_T.mono}>
              #{i + 1} · {c.trigger}
            </text>
          </g>
        ))}
        <text x={0} y={innerH + 14} fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>API 0</text>
        <text x={innerW} y={innerH + 14} textAnchor="end" fontSize="9" fill={AC_T.ink3} fontFamily={AC_T.mono}>{snapshots.length - 1}</text>
      </g>
    </svg>
  );
}

Object.assign(window, {
  CumulativeCostChart, CacheEfficiencyChart, LatencyScatter,
  CostBreakdownBars, ToolCostStack, ToolTimeline, ToolScatter,
  CompactionContextChart, TOOL_PALETTE,
});
