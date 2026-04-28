// Thread mock — events for session 7a1c4f92 ("add compaction analyzer").
// Shape is intentionally loose; mirrors what Facies' analyzer would emit.

const THREAD_EVENTS = [
  // Pre-compaction era
  { i: 1,  t: 1500, role: 'user', text: "we're hitting the context limit on long sessions. let's add a compaction analyzer that flags sessions where compaction lost >50% of tokens." },
  { i: 2,  t: 2200, role: 'assistant_thinking', durationMs: 11_400, tokens: 1280, text: "User wants a heuristic. The session loader already emits compaction events with preTokens/postTokens. I should add a derived field on Session — call it compactionRatio — and a filter helper. The filter probably belongs in src/filters/ alongside the project= and model= matchers." },
  { i: 3,  t: 13700, role: 'assistant', text: "I'll add a `compactionRatio` derived field on Session and a `compaction>` filter. Reading the loader and existing filters first." },
  { i: 4,  t: 14100, role: 'tool', tool: 'Read', args: 'src/sessions/loader.ts', result: '247 lines · 8.2k tokens', ok: true },
  { i: 5,  t: 14400, role: 'tool', tool: 'Read', args: 'src/filters/index.ts', result: '92 lines · 2.1k tokens', ok: true },
  { i: 6,  t: 14600, role: 'tool', tool: 'Glob', args: 'src/filters/*.ts', result: '6 files', ok: true },

  { i: 7,  t: 15100, role: 'assistant', text: "Loader already computes preTokens/postTokens per compaction. I'll fold the ratio into the rollup pass and expose it on the Session shape." },
  { i: 8,  t: 15300, role: 'tool', tool: 'Edit', args: 'src/sessions/loader.ts +14 −2', result: 'patched', ok: true },
  { i: 9,  t: 15400, role: 'tool', tool: 'Edit', args: 'src/types.ts +1 −0', result: 'patched', ok: true },

  { i: 10, t: 15800, role: 'user', text: "make sure ratio is null if no compactions, not 0" },
  { i: 11, t: 16200, role: 'assistant', text: "Good catch — null is a meaningful signal here. Fixing." },
  { i: 12, t: 16400, role: 'tool', tool: 'Edit', args: 'src/sessions/loader.ts +3 −1', result: 'patched', ok: true },

  // Subagent spawn — search for prior art across other filter shapes
  { i: 13, t: 16900, role: 'subagent', label: 'find existing comparison-filter conventions', tokens: 18_400, durationMs: 47_000, children: [
    { role: 'tool', tool: 'Grep', args: '"compactionRatio" -- src/', result: '0 matches' },
    { role: 'tool', tool: 'Grep', args: 'parseComparison', result: '3 matches in src/filters/' },
    { role: 'tool', tool: 'Read', args: 'src/filters/numeric.ts', result: '88 lines' },
    { role: 'finding', text: 'Existing pattern: parseComparison(token) returns {op, value}. Reuse it.' },
  ]},

  { i: 14, t: 64200, role: 'assistant', text: "Reusing parseComparison from src/filters/numeric.ts. Adding the compaction filter now." },
  { i: 15, t: 64400, role: 'tool', tool: 'Write', args: 'src/filters/compaction.ts (new, 34 lines)', result: 'created', ok: true },
  { i: 16, t: 64500, role: 'tool', tool: 'Edit', args: 'src/filters/index.ts +2 −0', result: 'patched', ok: true },

  { i: 17, t: 65100, role: 'tool', tool: 'Bash', args: 'pnpm test src/filters', result: '14 passing · 0 failing', ok: true },
  { i: 18, t: 87300, role: 'tool', tool: 'Bash', args: 'pnpm test', result: '187 passing · 2 failing', ok: false },

  { i: 19, t: 87600, role: 'assistant_thinking', durationMs: 6_200, tokens: 740, text: "Two failing tests. Probably the loader snapshot test that needs the new field, and one compaction-related regression." },
  { i: 20, t: 93800, role: 'assistant', text: "Snapshot drift in loader.test.ts and a stale fixture in compaction.test.ts. Fixing both." },
  { i: 21, t: 94000, role: 'tool', tool: 'Edit', args: 'src/sessions/__fixtures__/sample.json', result: 'patched', ok: true },
  { i: 22, t: 94100, role: 'tool', tool: 'Bash', args: 'pnpm test -u src/sessions', result: 'snapshots updated', ok: true },
  { i: 23, t: 94600, role: 'tool', tool: 'Bash', args: 'pnpm test', result: '189 passing · 0 failing', ok: true },

  { i: 24, t: 95000, role: 'assistant', text: "Green. Now wiring it into the dashboard query bar so `compaction>0.5` filters live." },
  { i: 25, t: 95200, role: 'tool', tool: 'Read', args: 'ui_kits/dashboard/Overview.jsx', result: '172 lines · 4.8k tokens', ok: true },
  { i: 26, t: 95400, role: 'tool', tool: 'Edit', args: 'ui_kits/dashboard/Overview.jsx +9 −0', result: 'patched', ok: true },
  { i: 27, t: 95800, role: 'tool', tool: 'Bash', args: 'pnpm typecheck', result: 'ok', ok: true },

  // COMPACTION EVENT
  { i: 28, role: 'compaction', preTokens: 1_180_000, postTokens: 340_000, durationMs: 18_200, summaryTokens: 22_000 },

  // Post-compaction era
  { i: 29, t: 113700, role: 'user', text: "looks good. add a row badge in the session table when ratio > 0.5" },
  { i: 30, t: 113900, role: 'assistant', text: "Adding a 'HEAVY COMP' pill in the cost column." },
  { i: 31, t: 114100, role: 'tool', tool: 'Edit', args: 'ui_kits/dashboard/Overview.jsx +6 −1', result: 'patched', ok: true },

  { i: 32, t: 114400, role: 'user', text: "ship it" },
  { i: 33, t: 114600, role: 'assistant', text: "Tests green, types clean, dashboard shows the new pill on session 1a6f9e22 (ratio 0.71). Ready to commit." },
];

window.THREAD_EVENTS = THREAD_EVENTS;
