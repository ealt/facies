# Conversation View: Deep Nesting UX Improvements

## Context

The Conversation view (`src/lib/components/views/ConversationView.svelte`) shows a session's message tree in an indented node list on the left with a detail panel on the right. Deep nesting — especially from subagents which recursively contain their own conversation trees — makes the tree hard to scan and navigate. The user wants two core capabilities:

1. **Find** — Filter to nodes of interest by type and type-specific criteria
2. **Context** — Explore around a found node: expand ancestors (upward) and descendants (downward), one step or all at once, with counts visible before expanding

## Two view modes

The tree panel operates in two modes:

### Tree mode (default)
The existing hierarchical tree view with indentation and collapse toggles. Enhanced with:
- Subagents collapsed by default
- Expand All / Collapse All / Depth preset buttons in toolbar
- Child/descendant counts on collapsed nodes
- Indentation capped at depth 5
- Keyboard navigation (arrows/hjkl)

### Filter mode (when `viewMode === 'filter'`)
A flat list of matching nodes, each with a one-line ancestry breadcrumb:

```
👤 "Help me fix the auth bug" › 🤖 Assistant › 🧩 Subagent: Explore
   🔧 Read result (error)                          3 ancestors · 12 descendants
```

- Breadcrumb line is compact, dimmed text — just enough to answer "where in the conversation is this?"
- If ancestry is long, truncate from the middle: `👤 User › ... › 🤖 Assistant › 🔧 Read`
- Breadcrumb segments are clickable — clicking one sets `selectedNodeId` to that node, switches to tree mode, uncollapsing ancestors and scrolling to it
- The match itself is styled normally below the breadcrumb
- Ancestor/descendant counts shown inline on the right

**Transition between modes:**

- **Tree → Filter:** Activating any type chip or typing in the search bar sets `viewMode = 'filter'`. The tree state (`collapsedNodes`) is preserved so returning to tree mode is seamless.
- **Filter → Tree (expand context):** Clicking an expand control (↑/↓) on a filtered match sets `viewMode = 'tree'` explicitly, uncollapsing the ancestor chain of the selected node so it's visible, and scrolling to it. Filters remain set (chips stay highlighted) — a "Back to results" button appears in the toolbar to return to filter mode.
- **Filter → Tree (clear filters):** Clearing all filter chips and search text sets `viewMode = 'tree'`.
- **Tree → Filter (re-apply):** Clicking "Back to results" (visible when `hasActiveFilters && viewMode === 'tree'`) sets `viewMode = 'filter'`. The filtered list re-renders from the current filter state; selection is preserved (the previously selected node remains selected if it matches the filters, otherwise selection clears).

## Changes

### 1. Filter panel

Add a filter toolbar above the tree/list, below the existing expand/collapse controls.

**Type filter chips** — toggle buttons for each node kind, using the actual `ConversationNode['kind']` values as chip identifiers:

| Chip label | `kind` value | Icon |
|-----------|-------------|------|
| User | `user-prompt` | 👤 |
| Assistant | `assistant` | 🤖 |
| Tool | `tool-result` | 🔧 |
| Subagent | `subagent` | 🧩 |
| System | `system` | ⚙️ |
| Meta | `meta` | 📋 |

- Multiple can be active simultaneously (OR logic — show nodes matching any active kind)
- All off = no filter (tree mode)
- Activating any chip sets `viewMode = 'filter'`

**Type-specific secondary filters** — appear when a type chip is active:

| `kind` value | Secondary filters |
|-----------|------------------|
| `tool-result` | Tool name (dropdown from `availableToolNames`), Error only toggle (`isError`) |
| `subagent` | Agent type (dropdown from `availableSubagentTypes`), Agent ID (dropdown) |
| `assistant` | Model (dropdown from `availableModels`), Has thinking (`thinkingBlocks.length > 0`), Has tool calls (`toolUseBlocks.length > 0`) |
| `system` | Subtype chips: `compact_boundary` / `turn_duration` / `api_error` |
| `user-prompt` | Is compaction summary (`isCompactSummary`) |

Available dropdown values are derived by scanning the tree once (e.g., collect all unique tool names).

**Secondary filter lifecycle:** When a type chip is deactivated, its dependent secondary filters are cleared (reset to null/false). This prevents hidden state where invisible filters still affect results.

**Text search** — A search input that filters by node label text (case-insensitive substring match). Combines with type filters (AND logic — must match both type and text).

### 2. Filtered results view (flat list + breadcrumbs)

When `viewMode === 'filter'`, replace the tree with a flat list of matching nodes.

Each result item:
```
[dimmed breadcrumb: icon › label › icon › label]
[icon] [full node label]              [N ancestors · M descendants]
```

- Breadcrumb: compact one-line ancestry path using node icons and truncated labels
- Truncate breadcrumb from the middle if > ~80 chars
- Breadcrumb segments clickable → switch to tree mode at that node
- Match row styled normally (same as tree node rows)
- Counts displayed as dimmed text on the right side

### 3. Inline context expansion controls

When a node is selected (in either view mode), show small inline expand controls on its row:

```
   ↑3        ← "3 ancestors above, click to reveal" (or ↑1 for one step)
🔧 Read result (error)                    5 children · 23 descendants
   ↓5 ↓23   ← "expand 1 level (5 children)" / "expand all (23 descendants)"
```

Controls:
- **↑1** — expand (uncollapse) one parent above. In filter mode: switch to tree mode, expand parent chain up one level.
- **↑N** (where N = ancestor count) — expand all ancestors. In filter mode: switch to tree mode with full ancestor chain visible.
- **↓N** (children count) — expand one level of children.
- **↓N** (descendant count) — expand all descendants recursively.

In **tree mode**, "expand" means uncollapse the relevant nodes so they become visible. The controls appear as small, dimmed buttons above/below the selected node row.

In **filter mode**, any expand action switches to tree mode with:
- The selected node centered in view
- The requested ancestors/descendants uncollapsed
- Filter chips preserved in toolbar for re-application

### 4. Child/descendant counts on collapsed nodes

In tree mode, every collapsed node that has children shows counts inline:

```
▶ 🧩 Subagent: Explore (agent-123)        5 children · 47 total
```

Counts are always visible on collapsed nodes (not just the selected one), styled as dimmed text on the right. This lets the user gauge subtree size before expanding.

### 5. Collapse subagents by default

Pre-populate `collapsedNodes` with every `SubagentNode`'s ID by walking the tree. This runs on initial render and resets whenever `tree` changes (see tree-change reset in State section). The top-level conversation flow is immediately scannable — subagent sub-trees are expanded on demand.

```typescript
function collectSubagentIds(nodes: ConversationNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(nodes: ConversationNode[]) {
    for (const node of nodes) {
      if (node.kind === 'subagent') ids.add(node.id);
      walk(node.children);
    }
  }
  walk(nodes);
  return ids;
}

let collapsedNodes = $state(collectSubagentIds(tree.roots));
```

### 6. Toolbar: Expand All / Collapse All / Depth presets

Compact toolbar at the top of the tree panel:

```
[Expand All] [Collapse All]  Depth: [1] [2] [3] [All]  |  [filter chips...] [search]
```

- **Expand All** — clears `collapsedNodes`
- **Collapse All** — adds every node with children
- **Depth N** — collapse nodes at depth >= N that have children

### 7. Cap visual indentation

Stop increasing indentation past depth 5:

```
style="padding-left: {Math.min(node.depth, 5) * 16 + 8}px"
```

Breadcrumb in the detail panel (existing right-side panel) shows full ancestry for the selected node when depth >= 2, providing context that the capped indentation doesn't convey visually.

### 8. Keyboard navigation

Add `onkeydown` handler on the tree panel container:

| Key | Action |
|-----|--------|
| `↓` / `j` | Select next visible node |
| `↑` / `k` | Select previous visible node |
| `→` / `l` | Expand selected node (if collapsed and has children) |
| `←` / `h` | Collapse selected node, or select parent if already collapsed/leaf |
| `Enter` | Toggle selection |

Auto-scroll selected node into view with `scrollIntoView({ block: 'nearest' })`.

**Focus guard:** Only handle keyboard shortcuts when the tree panel itself (or a node within it) has focus. Ignore events when focus is inside the search input, dropdown controls, or other toolbar elements — otherwise arrow keys and `hjkl` conflict with text entry and menu navigation. Check `e.target` against the tree container before handling.

## Precomputed data

All indexes are `$derived` from `tree.roots`, so they recompute whenever the `tree` prop changes (e.g., navigating between sessions). This prevents stale state leaking across session changes.

```typescript
interface NodeStats {
  childCount: number;      // node.children.length
  descendantCount: number; // recursive total
}

// Map<nodeId, NodeStats> — for displaying counts on collapsed nodes
const nodeStatsMap: Map<string, NodeStats> = ...;

// Map<nodeId, ConversationNode> — for looking up any node by ID (selection,
// ancestry traversal). Built by walking the full tree once.
const nodeById: Map<string, ConversationNode> = ...;

// Map<nodeId, string | null> — parentId for each node (null for roots).
// Required for: breadcrumb construction, ↑1 ancestor expansion, keyboard
// "select parent" (←/h). Built during the same tree walk as nodeById.
const parentById: Map<string, string | null> = ...;

// Available filter options (for dropdowns)
const availableToolNames: string[] = ...;      // unique ToolResultNode.toolName values
const availableSubagentTypes: string[] = ...;  // unique SubagentNode.agentType values
const availableSubagentIds: string[] = ...;    // unique SubagentNode.agentId values
const availableModels: string[] = ...;         // unique AssistantResponseNode.model values
```

Ancestor count doesn't need precomputation — it's just `node.depth`.

**Ancestry helper** (used by breadcrumbs, ↑N, keyboard nav):

```typescript
function getAncestry(nodeId: string): ConversationNode[] {
  const path: ConversationNode[] = [];
  let current: string | null = nodeId;
  while (current != null) {
    const node = nodeById.get(current);
    if (!node) break;
    path.unshift(node);
    current = parentById.get(current) ?? null;
  }
  return path;
}
```

## State

```typescript
// View mode — explicit state, NOT derived from filters.
// Filters can remain set while the user is in tree mode (e.g., after expanding
// context from a filtered match). Re-entering filter mode is done by clicking
// a "Back to results" button or toggling a filter chip.
let viewMode = $state<'tree' | 'filter'>('tree');

// Derived: switch to filter mode automatically when a filter is first applied,
// but NOT when returning from an expand-context action (which sets viewMode
// to 'tree' explicitly).
// The transition logic:
//   - Activating a filter chip or typing in search → viewMode = 'filter'
//   - Expanding context from a match → viewMode = 'tree' (explicit)
//   - Clearing all filters → viewMode = 'tree'
//   - Clicking "Back to results" (only visible when filters are set + viewMode
//     is 'tree') → viewMode = 'filter'

const hasActiveFilters = $derived(activeKinds.size > 0 || searchText.trim() !== '');

// Filter state
let activeKinds = $state<Set<string>>(new Set());  // values are node kind literals
let toolNameFilter = $state<string | null>(null);
let errorOnlyFilter = $state(false);
let subagentTypeFilter = $state<string | null>(null);
let subagentIdFilter = $state<string | null>(null);
let modelFilter = $state<string | null>(null);
let systemSubtypeFilter = $state<string | null>(null);
let compactionOnlyFilter = $state(false);
let hasThinkingFilter = $state(false);
let hasToolCallsFilter = $state(false);
let searchText = $state('');

// Tree state (existing, enhanced)
let collapsedNodes = $state(collectSubagentIds(tree.roots));
let selectedNodeId = $state<string | null>(null);

// Selected node — resolved from the full node index, NOT from visibleNodes.
// This ensures selection persists when switching between filter and tree modes,
// and when a node is hidden under a collapsed ancestor in tree mode.
const selectedNode = $derived(
  selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null
);

// --- Tree-change reset ---
// When the `tree` prop changes (e.g., navigating between sessions), all UI
// state must reset to avoid stale data leaking across sessions. Use a $effect
// keyed on tree identity:
$effect(() => {
  tree;  // track dependency
  // Reset all mutable state:
  collapsedNodes = collectSubagentIds(tree.roots);
  selectedNodeId = null;
  viewMode = 'tree';
  activeKinds = new Set();
  toolNameFilter = null;
  errorOnlyFilter = false;
  subagentTypeFilter = null;
  subagentIdFilter = null;
  modelFilter = null;
  systemSubtypeFilter = null;
  compactionOnlyFilter = false;
  hasThinkingFilter = false;
  hasToolCallsFilter = false;
  searchText = '';
});
// The $derived indexes (nodeById, parentById, nodeStatsMap, filter options)
// recompute automatically from tree.roots — no manual reset needed.
```

## File changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/analysis/conversation-tree-index.ts` | Create | Pure TS module: tree indexing (`nodeById`, `parentById`, `nodeStatsMap`), ancestry helpers (`getAncestry`), filter predicates, collapse/expand logic (`collectSubagentIds`, `collapseToDepth`, `collectAllParentIds`), filter option extraction. Separating from the component makes all state logic unit-testable with Vitest. |
| `src/lib/components/views/ConversationView.svelte` | Modify | UI changes: filter toolbar, flat results view, inline context controls, counts display, depth toolbar, indent cap, keyboard nav. Imports logic from `conversation-tree-index.ts`. |
| `tests/analysis/conversation-tree-index.test.ts` | Create | Unit tests for: `getAncestry` (root, mid-tree, deep), filter predicates (by kind, by secondary filters, combined), `collectSubagentIds`, `collapseToDepth`, descendant count computation, `nodeById`/`parentById` correctness. |

## Verification

1. `npm run check` — no type errors
2. `npm run test` — new tests for `conversation-tree-index.ts` pass, existing tests still pass
3. `npm run dev` — visual verification:
   - Subagents start collapsed; top-level flow is scannable
   - Expand All / Collapse All / Depth buttons work
   - Type filter chips toggle to filter mode; type-specific secondary filters appear and clear when chip is deactivated
   - Filtered view shows flat list with breadcrumbs and counts
   - Breadcrumb segments clickable → sets selection and navigates to node in tree mode
   - Inline expand controls (↑/↓) appear on selected node with counts
   - Expanding from filter mode switches to tree view centered on node
   - "Back to results" button appears when filters are set and in tree mode; clicking returns to filtered list
   - Collapsed nodes show child/descendant counts
   - Deep nodes stop indenting past depth 5
   - Breadcrumb in detail panel for deep nodes
   - Arrow keys / hjkl navigate the tree (only when tree panel is focused, not in search/dropdowns)
   - Switching sessions resets all state (indexes recompute from new tree)
