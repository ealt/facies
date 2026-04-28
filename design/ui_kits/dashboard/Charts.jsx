// Charts.jsx — Stratigraphy + Token Waterfall in terminal aesthetic.
// Flat fills, no transparency, sharp edges, mono labels.

const T = {
  bg: '#000000', border: '#1f1f1f', border2: '#2a2a2a',
  ink: '#e5e5e5', ink2: '#888888', ink3: '#555555',
  amber: '#ffb000', amber2: '#ff8800',
  green: '#00d97e', cyan: '#5dd9e0', red: '#ff4d4d', purple: '#b377ff',
  mono: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
};

const CAT_COLORS = {
  system: T.ink3, user: T.cyan, assistant_text: T.green,
  assistant_thinking: '#2a8060', tool_results: T.amber2,
  subagent_overhead: T.purple, compacted_summary: T.amber,
};
const CAT_LABELS = {
  system: 'SYS', user: 'USR', assistant_text: 'ASST',
  assistant_thinking: 'THINK', tool_results: 'TOOL',
  subagent_overhead: 'SUB', compacted_summary: 'CMP',
};

function StratigraphyChart({ snapshots, compactions, height = 320, mode = 'cumulative' }) {
  const W = 880, H = height, P = { t: 24, r: 16, b: 28, l: 56 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  if (!snapshots.length) return null;

  const cats = ['system','compacted_summary','user','assistant_text','assistant_thinking','tool_results','subagent_overhead'];

  // In incremental mode, replace each snapshot's category totals with the delta vs previous.
  // Negative deltas (e.g. compaction drops) clamp to 0 — the compaction marker captures the drop.
  const series = (mode === 'incremental')
    ? snapshots.map((s, i) => {
        if (i === 0) return s;
        const prev = snapshots[i - 1].categories;
        const next = {};
        for (const c of cats) {
          next[c] = Math.max(0, (s.categories[c] || 0) - (prev[c] || 0));
        }
        const total = Object.values(next).reduce((a, b) => a + b, 0);
        return { ...s, categories: next, totalTokens: total };
      })
    : snapshots;

  const max = Math.max(...series.map(s => s.totalTokens), 1) * 1.05;
  const xStep = innerW / Math.max(1, series.length - 1);

  const data = series.map((s, i) => {
    let acc = 0;
    const layers = cats.map(c => {
      const v = s.categories[c] || 0;
      const out = { c, y0: acc, y1: acc + v };
      acc += v;
      return out;
    });
    return { x: i * xStep, layers };
  });

  function pathFor(cat) {
    const top = data.map(d => {
      const l = d.layers.find(l => l.c === cat);
      return [d.x, innerH - (l.y1 / max) * innerH];
    });
    const bot = data.map(d => {
      const l = d.layers.find(l => l.c === cat);
      return [d.x, innerH - (l.y0 / max) * innerH];
    }).reverse();
    return 'M' + top.map(p => p.join(',')).join(' L ') + ' L ' + bot.map(p => p.join(',')).join(' L ') + ' Z';
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({ v: max * p, y: innerH - p * innerH }));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {yTicks.map((tk,i) => (
          <g key={i}>
            <line x1={0} x2={innerW} y1={tk.y} y2={tk.y} stroke={T.border} strokeWidth="1"/>
            <text x={-8} y={tk.y+3} textAnchor="end" fontSize="9" fill={T.ink3} fontFamily={T.mono}>{fmtTokens(tk.v)}</text>
          </g>
        ))}
        {cats.map(c => (
          <path key={c} d={pathFor(c)} fill={CAT_COLORS[c]} />
        ))}
        {compactions.map((cp, i) => {
          const x = cp.snapshotIndex * xStep;
          const pct = ((cp.preTokens - cp.postTokens) / cp.preTokens * 100).toFixed(0);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={-8} y2={innerH} stroke={T.red} strokeWidth="1" strokeDasharray="2 3"/>
              <text x={x+4} y={2} fill={T.red} fontSize="9" fontFamily={T.mono}>
                COMPACT · {fmtTokens(cp.preTokens)} → {fmtTokens(cp.postTokens)} · −{pct}%
              </text>
            </g>
          );
        })}
        <text x={0} y={innerH + 18} fontSize="9" fill={T.ink3} fontFamily={T.mono}>API 0</text>
        <text x={innerW} y={innerH + 18} textAnchor="end" fontSize="9" fill={T.ink3} fontFamily={T.mono}>{snapshots.length - 1}</text>
      </g>
    </svg>
  );
}

function TokenBars({ session }) {
  const fresh = session.totalInputTokens - session.totalCacheReadTokens;
  const cacheRead = session.totalCacheReadTokens;
  const cacheCreate = Math.round(session.totalInputTokens * 0.06);
  const output = session.totalOutputTokens;
  const total = fresh + cacheRead + cacheCreate + output;
  const rows = [
    ['FRESH IN',  fresh, T.red],
    ['CACHE RD',  cacheRead, T.green],
    ['CACHE WR',  cacheCreate, T.amber],
    ['OUTPUT',    output, T.cyan],
  ];
  return (
    <div style={{ font: 'var(--small)' }}>
      {rows.map(([l, v, c], i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 60px', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ color: T.ink2 }}>{l}</span>
          <span style={{ display: 'block', height: 10, background: T.border }}>
            <span style={{ display: 'block', height: '100%', width: `${(v/total)*100}%`, background: c }}/>
          </span>
          <span style={{ textAlign: 'right', color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{fmtTokens(v)}</span>
        </div>
      ))}
    </div>
  );
}

window.StratigraphyChart = StratigraphyChart;
window.TokenBars = TokenBars;
window.CAT_COLORS = CAT_COLORS;
window.CAT_LABELS = CAT_LABELS;
