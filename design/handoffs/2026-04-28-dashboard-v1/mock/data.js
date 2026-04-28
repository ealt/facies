// Mock data for the Facies dashboard. Loosely modeled on real session shapes.

const SESSIONS = [
  { sessionId: '3f2a8b1e', title: 'refactor session-loader', project: 'facies',     model: 'claude-3-5-sonnet', startTime: Date.now() - 12*60*1000,        durationMs: 14*60*1000,  totalInputTokens: 3_200_000, totalOutputTokens: 180_000, totalCacheReadTokens: 2_600_000, totalCost: 6.21, apiCalls: 42 },
  { sessionId: '7a1c4f92', title: 'add compaction analyzer', project: 'facies',     model: 'claude-3-5-sonnet', startTime: Date.now() - 2*60*60*1000,       durationMs: 38*60*1000,  totalInputTokens: 2_100_000, totalOutputTokens: 145_000, totalCacheReadTokens: 1_700_000, totalCost: 4.04, apiCalls: 31 },
  { sessionId: '9d4e2a17', title: 'fix cache rate calc',     project: 'facies',     model: 'claude-3-haiku',    startTime: Date.now() - 3*24*60*60*1000,    durationMs: 22*60*1000,  totalInputTokens: 1_100_000, totalOutputTokens: 92_000,  totalCacheReadTokens: 880_000,   totalCost: 2.18, apiCalls: 18 },
  { sessionId: '5b8d1c34', title: 'sweep stale subagents',   project: 'karya',      model: 'claude-3-5-sonnet', startTime: Date.now() - 5*24*60*60*1000,    durationMs: 9*60*1000,   totalInputTokens: 540_000,   totalOutputTokens: 38_000,  totalCacheReadTokens: 410_000,   totalCost: 0.94, apiCalls: 9  },
  { sessionId: '2e9f7b61', title: 'scaffold marketing site', project: 'garth',      model: 'claude-3-5-sonnet', startTime: Date.now() - 6*24*60*60*1000,    durationMs: 48*60*1000,  totalInputTokens: 4_200_000, totalOutputTokens: 220_000, totalCacheReadTokens: 3_400_000, totalCost: 7.82, apiCalls: 56 },
  { sessionId: '8c3a5d47', title: 'evaluate latency regression', project: 'eden',  model: 'claude-3-haiku',    startTime: Date.now() - 8*24*60*60*1000,    durationMs: 4*60*1000,   totalInputTokens: 210_000,   totalOutputTokens: 14_000,  totalCacheReadTokens: 160_000,   totalCost: 0.32, apiCalls: 5  },
  { sessionId: '1a6f9e22', title: 'plan home page redesign', project: 'facies',     model: 'claude-3-5-sonnet', startTime: Date.now() - 11*24*60*60*1000,   durationMs: 31*60*1000,  totalInputTokens: 1_800_000, totalOutputTokens: 110_000, totalCacheReadTokens: 1_400_000, totalCost: 3.12, apiCalls: 24 },
];

// Project color map (Tableau10 in sorted order)
const TABLEAU10 = ['#4e79a7','#f28e2c','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ab'];
function buildColorMap(sessions) {
  const projects = [...new Set(sessions.map(s => s.project))].sort();
  const map = new Map();
  projects.forEach((p, i) => map.set(p, TABLEAU10[i % TABLEAU10.length]));
  return map;
}

// Mock context snapshots over 60 API calls — used by the Stratigraphy chart
function buildContextSnapshots() {
  const out = [];
  let user = 0, assistant = 0, tool = 0, summary = 0;
  const system = 22_000;
  for (let i = 0; i < 60; i++) {
    user += Math.random() * 1500 + 800;
    assistant += Math.random() * 1800 + 1100;
    tool += Math.random() * 4200 + 2600;
    // compaction at i=28
    if (i === 28) {
      const total = system + user + assistant + tool;
      summary = total * 0.22;
      user = user * 0.10;
      assistant = assistant * 0.10;
      tool = tool * 0.05;
    }
    out.push({
      apiCallIndex: i,
      categories: { system, user, assistant_text: assistant, tool_results: tool, compacted_summary: summary, assistant_thinking: 0, subagent_overhead: 0 },
      totalTokens: system + user + assistant + tool + summary,
    });
  }
  return out;
}

const CONTEXT_SNAPSHOTS = buildContextSnapshots();
const COMPACTIONS = [{ snapshotIndex: 28, preTokens: 1_180_000, postTokens: 340_000 }];

const CATEGORY_COLORS = {
  system: '#6b7280',
  compacted_summary: '#f59e0b',
  user: '#3b82f6',
  assistant_text: '#22c55e',
  assistant_thinking: '#9ca3af',
  tool_results: '#f97316',
  subagent_overhead: '#a855f7',
};
const CATEGORY_LABELS = {
  system: 'System',
  compacted_summary: 'Compacted',
  user: 'User',
  assistant_text: 'Assistant',
  assistant_thinking: 'Thinking',
  tool_results: 'Tool Results',
  subagent_overhead: 'Subagent',
};

function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}
function fmtCost(n) {
  if (n == null) return 'N/A';
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(3);
  return '$' + n.toFixed(4);
}
function fmtDuration(ms) {
  if (ms < 60_000) return Math.round(ms / 1000) + 's';
  if (ms < 3_600_000) return Math.round(ms / 60_000) + 'm';
  return (ms / 3_600_000).toFixed(1) + 'h';
}
function fmtTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 3_600_000) return Math.round(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.round(diff / 3_600_000) + 'h ago';
  if (diff < 7 * 86_400_000) return Math.round(diff / 86_400_000) + 'd ago';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

Object.assign(window, {
  SESSIONS, buildColorMap, CONTEXT_SNAPSHOTS, COMPACTIONS,
  CATEGORY_COLORS, CATEGORY_LABELS,
  fmtTokens, fmtCost, fmtDuration, fmtTimeAgo,
});
