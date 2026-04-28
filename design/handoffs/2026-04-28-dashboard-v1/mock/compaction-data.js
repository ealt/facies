// compaction-data.js — mock dataset for the compaction inspector overlay.
// Represents the state of the context window IMMEDIATELY before and after
// API call 28 in session 7a1c4f92.

const COMPACTION_EVENT = {
  apiCall: 28,
  sessionId: '7a1c4f92',
  timestamp: 113_400, // ms into session
  preTokens: 1_180_000,
  postTokens: 340_000,
  summaryTokens: 22_000,
  durationMs: 18_200,
  triggerReason: 'auto: 92% of 1.28M context window',
  ratio: 0.712, // (pre - post) / pre
};

// Categorized breakdown of the 1.18M pre-compaction context.
// Each row: bucket label, tokens, count of items, kept/dropped/summarized,
// short example so the bucket reads concrete.
const PRE_BUCKETS = [
  { id: 'system',     label: 'System prompt',           tokens:   12_400, items:  1, fate: 'kept',
    sample: 'tool definitions · capability matrix · safety rules' },
  { id: 'user-msgs',  label: 'User messages',           tokens:    8_900, items: 12, fate: 'summarized',
    sample: '"add compaction analyzer"  ·  "make ratio null if none"  ·  "ship it"' },
  { id: 'asst-msgs',  label: 'Assistant prose',         tokens:   34_700, items: 18, fate: 'summarized',
    sample: 'design notes · plan checkpoints · status reports' },
  { id: 'thinking',   label: 'Thinking blocks',         tokens:   28_200, items:  4, fate: 'dropped',
    sample: '4 thinking blocks · longest 11.4s · 1.28k tokens' },
  { id: 'tool-args',  label: 'Tool calls (args)',       tokens:    9_100, items: 47, fate: 'summarized',
    sample: 'Read · Edit · Grep · Bash · Glob — call signatures' },
  { id: 'file-reads', label: 'File-read results',       tokens:  612_000, items: 23, fate: 'dropped',
    sample: 'src/sessions/loader.ts (8.2k) · 22 others, mostly stale re-reads' },
  { id: 'grep-out',   label: 'Grep / search output',    tokens:   84_400, items: 11, fate: 'dropped',
    sample: '11 searches across src/ · most superseded by later edits' },
  { id: 'bash-out',   label: 'Bash output',             tokens:  142_300, items:  9, fate: 'summarized',
    sample: 'pnpm test  (3 runs · 5–22k tokens each) · typecheck · lint' },
  { id: 'subagent',   label: 'Subagent transcripts',    tokens:   97_200, items:  1, fate: 'summarized',
    sample: 'find existing comparison-filter conventions (47s · 18.4k)' },
  { id: 'edits',      label: 'Edit diffs',              tokens:   18_500, items: 13, fate: 'kept',
    sample: '13 edits to 7 files — small diffs, kept verbatim' },
  { id: 'meta',       label: 'Cache / metadata',        tokens:  132_300, items: '—', fate: 'dropped',
    sample: 'cache breakpoints · streaming overhead · usage records' },
];

// What the post-compaction context looks like.
const POST_BUCKETS = [
  { id: 'system',     label: 'System prompt',         tokens:  12_400, fate: 'kept',
    sample: 'unchanged' },
  { id: 'summary',    label: 'Compaction summary',    tokens:  22_000, fate: 'new',
    sample: 'model-generated · replaces 970k tokens of prior turns' },
  { id: 'edits',      label: 'Edit diffs (kept)',     tokens:  18_500, fate: 'kept',
    sample: '13 edits — load-bearing for follow-up work' },
  { id: 'recent',     label: 'Last 3 turns',          tokens: 287_100, fate: 'kept',
    sample: 'tool calls 25–27 + assistant prose verbatim' },
];

// The synthesized summary itself, as rendered text.
// (In Facies this would be the actual stored summary string.)
const SUMMARY_TEXT = `User asked to add a compaction analyzer that flags sessions where compaction lost more than 50% of tokens. We added a derived field \`compactionRatio\` to the Session shape (computed in src/sessions/loader.ts during the rollup pass), with null when the session has no compactions — per user clarification.

A new filter src/filters/compaction.ts (34 lines) wraps the existing parseComparison helper from src/filters/numeric.ts (discovered via subagent search). Wired into src/filters/index.ts.

Initial test run: 187 passing, 2 failing — snapshot drift in loader.test.ts and a stale fixture in compaction.test.ts. Updated src/sessions/__fixtures__/sample.json and ran pnpm test -u; now 189 passing, 0 failing. Typecheck clean.

Started wiring into the dashboard query bar (ui_kits/dashboard/Overview.jsx +9 −0) so that \`compaction>0.5\` filters live. Last user request before compaction: add a row badge ("HEAVY COMP" pill in cost column) when ratio > 0.5.

Files touched: src/sessions/loader.ts, src/types.ts, src/filters/compaction.ts (new), src/filters/index.ts, src/sessions/__fixtures__/sample.json, src/sessions/loader.test.ts, ui_kits/dashboard/Overview.jsx.

Open: complete the badge in Overview.jsx and confirm with user.`;

// What was lost — items that didn't make it into the summary, ranked by token weight.
const LOSSES = [
  { tokens: 612_000, label: 'File-read results',   note: '23 reads dropped. Most were stale re-reads of the same loader.ts during exploration.' },
  { tokens: 142_300, label: 'Bash output (full)',  note: 'Test run output collapsed to "189 passing, 0 failing". Failure traces lost.' },
  { tokens: 132_300, label: 'Cache/streaming meta', note: 'Not user-facing. Always discarded.' },
  { tokens:  84_400, label: 'Grep output',         note: '11 search results dropped — superseded by edits.' },
  { tokens:  28_200, label: 'Thinking blocks',     note: '4 thinking blocks dropped. Reasoning gone; conclusions captured in the summary.' },
];

window.COMPACTION_EVENT = COMPACTION_EVENT;
window.PRE_BUCKETS = PRE_BUCKETS;
window.POST_BUCKETS = POST_BUCKETS;
window.SUMMARY_TEXT = SUMMARY_TEXT;
window.LOSSES = LOSSES;
