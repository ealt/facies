// project-data.js — synthesizes a 30-day daily cost/sessions/cache trend for each project.
// In real Facies this would be derived from the SESSIONS array by date binning + extrapolation.

const PROJECTS = [
  { id: 'facies',  label: 'facies',  description: 'Self-hosted analyzer for Claude sessions',     repo: '~/code/facies',     active: true,  budget: 200, alert: 0.80 },
  { id: 'karya',   label: 'karya',   description: 'Internal task scheduler — agent-orchestrated', repo: '~/code/karya',      active: true,  budget: 80,  alert: 0.90 },
  { id: 'garth',   label: 'garth',   description: 'Marketing site (Astro · Tailwind)',            repo: '~/code/garth.dev',  active: false, budget: 50,  alert: 0.75 },
  { id: 'eden',    label: 'eden',    description: 'Latency regression harness',                   repo: '~/code/eden',       active: false, budget: 30,  alert: 0.90 },
];

// Deterministic-ish daily series for the last 30 days, per project.
// Anchored to the projects' SESSIONS rollups so the totals add up plausibly.
function buildProjectSeries(seed = 1) {
  const rng = (() => {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  })();

  const out = {};
  PROJECTS.forEach((p) => {
    const days = 30;
    const series = [];
    let baseline = { facies: 0.55, karya: 0.18, garth: 0.32, eden: 0.06 }[p.id] || 0.20;
    let calls = 0, sessions = 0, cost = 0, tokens = 0, cacheTok = 0, inTok = 0;
    for (let d = days - 1; d >= 0; d--) {
      const wave = Math.sin((d / days) * Math.PI * 2.3) * 0.3 + 1;
      const spike = (d === 6 || d === 14) ? 1.8 : 1; // visible bumps
      const dayCost = Math.max(0.02, baseline * wave * spike + rng() * baseline * 0.6 - baseline * 0.2);
      const daySessions = Math.max(0, Math.round(dayCost * 6 + (rng() - 0.5) * 2));
      const dayCalls = daySessions * (8 + Math.round(rng() * 30));
      const dayTok = dayCost * 480_000;
      const dayCacheTok = dayTok * (0.65 + rng() * 0.25);
      const dayInTok = dayTok * 0.92;
      cost += dayCost;
      sessions += daySessions;
      calls += dayCalls;
      tokens += dayTok;
      cacheTok += dayCacheTok;
      inTok += dayInTok;
      series.push({
        d,                          // days ago
        date: new Date(Date.now() - d * 86_400_000),
        cost: dayCost,
        sessions: daySessions,
        calls: dayCalls,
        tokens: dayTok,
        cacheTokens: dayCacheTok,
        inTokens: dayInTok,
      });
    }
    out[p.id] = {
      series,
      totals: {
        cost,
        sessions,
        calls,
        tokens,
        cacheTokens: cacheTok,
        hitRate: inTok ? (cacheTok / inTok) * 100 : 0,
        avgCostPerSession: sessions ? cost / sessions : 0,
      },
    };
  });
  return out;
}

const PROJECT_SERIES = buildProjectSeries(7);

// Per-file cost rollup for the active "facies" project — what gets touched most.
const FILE_HEAT = {
  facies: [
    { path: 'src/sessions/loader.ts',          edits: 14, reads: 23, costShare: 0.18 },
    { path: 'ui_kits/dashboard/Overview.jsx',  edits: 9,  reads: 12, costShare: 0.13 },
    { path: 'src/filters/compaction.ts',       edits: 6,  reads:  3, costShare: 0.09 },
    { path: 'src/types.ts',                    edits: 4,  reads: 18, costShare: 0.07 },
    { path: 'src/sessions/__fixtures__/sample.json', edits: 2, reads: 11, costShare: 0.06 },
    { path: 'src/filters/index.ts',            edits: 3,  reads:  9, costShare: 0.05 },
    { path: 'ui_kits/dashboard/SessionDetail.jsx', edits: 4, reads: 7, costShare: 0.05 },
  ],
  karya: [
    { path: 'src/scheduler/queue.ts', edits: 8, reads: 14, costShare: 0.32 },
    { path: 'src/agents/runner.ts',   edits: 6, reads: 11, costShare: 0.21 },
  ],
  garth: [
    { path: 'src/pages/index.astro',  edits: 12, reads: 8, costShare: 0.28 },
    { path: 'src/styles/tokens.css',  edits: 7,  reads: 4, costShare: 0.18 },
  ],
  eden: [
    { path: 'bench/runner.ts', edits: 4, reads: 6, costShare: 0.45 },
  ],
};

// Common agent shapes in this project — what kinds of work get done here?
const PROJECT_TASKS = {
  facies: [
    { kind: 'refactor',   count: 12, avgCost: 4.8, label: 'refactor' },
    { kind: 'bugfix',     count:  8, avgCost: 1.9, label: 'bugfix' },
    { kind: 'feature',    count:  6, avgCost: 7.2, label: 'feature' },
    { kind: 'investigation', count: 4, avgCost: 2.1, label: 'investigate' },
  ],
  karya:   [{ kind: 'bugfix', count: 5, avgCost: 1.2, label: 'bugfix' }, { kind: 'feature', count: 2, avgCost: 3.4, label: 'feature' }],
  garth:   [{ kind: 'feature', count: 8, avgCost: 5.8, label: 'feature' }],
  eden:    [{ kind: 'investigation', count: 3, avgCost: 1.4, label: 'investigate' }],
};

window.PROJECTS = PROJECTS;
window.PROJECT_SERIES = PROJECT_SERIES;
window.FILE_HEAT = FILE_HEAT;
window.PROJECT_TASKS = PROJECT_TASKS;
