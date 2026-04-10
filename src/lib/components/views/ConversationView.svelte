<script lang="ts">
	import type {
		ConversationTree,
		ConversationNode,
		UserPromptNode,
		ToolResultNode,
		AssistantResponseNode,
		SystemEventNode,
		SubagentNode,
		MetaNode,
	} from '$lib/analysis/conversation-builder.js';
	import { untrack } from 'svelte';
	import {
		buildTreeIndex,
		getAncestry,
		collectSubagentIds,
		collectAllParentIds,
		collapseToDepth,
		expandAncestors,
		expandSubtree,
		expandOneLevel,
		expandOneAncestor,
		matchesFilter,
		filterNodes,
		hasActiveFilters as checkActiveFilters,
		emptyFilterState,
		type TreeIndex,
		type FilterState,
	} from '$lib/analysis/conversation-tree-index.js';

	let { tree }: { tree: ConversationTree } = $props();

	const MAX_INDENT_DEPTH = 5;

	// --- Filter chip definitions ---
	const KIND_CHIPS: { label: string; kind: ConversationNode['kind']; icon: string }[] = [
		{ label: 'User', kind: 'user-prompt', icon: '\u{1F464}' },
		{ label: 'Assistant', kind: 'assistant', icon: '\u{1F916}' },
		{ label: 'Tool', kind: 'tool-result', icon: '\u{1F527}' },
		{ label: 'Subagent', kind: 'subagent', icon: '\u{1F9E9}' },
		{ label: 'System', kind: 'system', icon: '\u{2699}' },
		{ label: 'Meta', kind: 'meta', icon: '\u{1F4CB}' },
	];

	// --- Tree index (recomputes when tree changes) ---
	// untrack: buildTreeIndex walks every node in the tree. Without untrack,
	// Svelte creates fine-grained reactive dependencies on every node property,
	// causing massive overhead on each re-derivation. We only need to track
	// the tree prop itself (re-derive when a new tree is provided).
	const index: TreeIndex = $derived.by(() => {
		const roots = tree.roots; // track tree prop dependency
		return untrack(() => buildTreeIndex(roots));
	});

	// --- View mode ---
	let viewMode = $state<'tree' | 'filter'>('tree');

	// --- Filter state ---
	let activeKinds = $state<Set<string>>(new Set());
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

	const filterState: FilterState = $derived({
		activeKinds,
		toolNameFilter,
		errorOnlyFilter,
		subagentTypeFilter,
		subagentIdFilter,
		modelFilter,
		systemSubtypeFilter,
		compactionOnlyFilter,
		hasThinkingFilter,
		hasToolCallsFilter,
		searchText,
	});

	const activeFiltersExist = $derived(checkActiveFilters(filterState));

	// --- Tree state ---
	// Initialized to empty; the tree-change $effect below sets the real default.
	let collapsedNodes = $state<Set<string>>(new Set());
	let selectedNodeId = $state<string | null>(null);

	// Selected node from full index (persists across mode transitions)
	const selectedNode = $derived.by(() => {
		const id = selectedNodeId;
		const idx = index;
		return id ? untrack(() => idx.nodeById.get(id) ?? null) : null;
	});

	// Ancestry of selected node (for breadcrumb + context controls)
	const selectedAncestry = $derived.by(() => {
		const id = selectedNodeId;
		const idx = index;
		return id ? untrack(() => getAncestry(id, idx)) : [];
	});

	// --- Tree-change reset ---
	$effect(() => {
		tree; // track dependency
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

	// --- Selection reconciliation on filter changes ---
	// When in filter mode, clear selection if the selected node no longer matches.
	// This covers secondary filter changes (tool name, error-only, etc.) that
	// narrow the results without a mode switch.
	//
	// selectedNodeId and selectedNode are read via untrack() to prevent a
	// reactive cycle: this effect writes selectedNodeId, which would otherwise
	// re-trigger the effect (since it reads it), causing repeated re-runs.
	// We only need re-runs when viewMode or filterState change — not when
	// selection changes.
	$effect(() => {
		if (viewMode === 'filter') {
			// Reading filterState triggers re-run on any filter change
			const fs = filterState;
			const nodeId = untrack(() => selectedNodeId);
			const node = nodeId ? untrack(() => index.nodeById.get(nodeId) ?? null) : null;
			if (nodeId && node) {
				if (!matchesFilter(node, fs, nodeLabel(node))) {
					selectedNodeId = null;
				}
			}
		}
	});

	// --- Visible nodes for tree mode ---
	// untrack: the tree walk reads every node's id and children through
	// potentially reactive proxies. We only need to re-derive when
	// collapsedNodes changes (new Set) or the tree changes.
	const visibleNodes = $derived.by(() => {
		const collapsed = collapsedNodes; // track: re-derive when collapse state changes
		const roots = tree.roots; // track: re-derive when tree changes
		return untrack(() => {
			const result: ConversationNode[] = [];
			function walk(nodes: ConversationNode[]) {
				for (const node of nodes) {
					result.push(node);
					if (!collapsed.has(node.id) && node.children.length > 0) {
						walk(node.children);
					}
				}
			}
			walk(roots);
			return result;
		});
	});

	// --- Filtered nodes for filter mode ---
	// untrack: filterNodes walks the entire tree calling matchesFilter and
	// nodeLabel on each node. Without untrack, this creates reactive deps on
	// every node property AND on the activeKinds Set's internals (via .has()),
	// causing massive cascading re-derivations.
	const filteredNodes = $derived.by(() => {
		const fs = filterState; // track: re-derive when any filter changes
		tree.roots; // track: re-derive when tree changes
		return untrack(() => filterNodes(tree.roots, fs, nodeLabel));
	});

	// --- Filter actions ---
	function toggleKind(kind: string) {
		const next = new Set(activeKinds);
		if (next.has(kind)) {
			next.delete(kind);
			clearSecondaryFilters(kind);
		} else {
			next.add(kind);
		}
		activeKinds = next;
		if (next.size > 0 || searchText.trim() !== '') {
			viewMode = 'filter';
			
		} else {
			viewMode = 'tree';
		}
	}

	function clearSecondaryFilters(kind: string) {
		switch (kind) {
			case 'tool-result':
				toolNameFilter = null;
				errorOnlyFilter = false;
				break;
			case 'subagent':
				subagentTypeFilter = null;
				subagentIdFilter = null;
				break;
			case 'assistant':
				modelFilter = null;
				hasThinkingFilter = false;
				hasToolCallsFilter = false;
				break;
			case 'system':
				systemSubtypeFilter = null;
				break;
			case 'user-prompt':
				compactionOnlyFilter = false;
				break;
		}
	}

	function clearAllFilters() {
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
		viewMode = 'tree';
	}

	function onSearchInput(e: Event) {
		searchText = (e.target as HTMLInputElement).value;
		if (searchText.trim() !== '' || activeKinds.size > 0) {
			viewMode = 'filter';
			
		} else {
			viewMode = 'tree';
		}
	}

	// --- Collapse/expand actions ---
	function toggleCollapse(id: string) {
		const next = new Set(collapsedNodes);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsedNodes = next;
	}

	function expandAll() {
		collapsedNodes = new Set();
	}

	function collapseAll() {
		collapsedNodes = collectAllParentIds(tree.roots);
	}

	function setDepth(d: number) {
		collapsedNodes = collapseToDepth(tree.roots, d);
	}

	// --- Selection ---
	function selectNode(id: string) {
		selectedNodeId = selectedNodeId === id ? null : id;
	}

	// Shared helper: scroll a node into view after Svelte renders
	function scrollToNode(id: string | null, center = false) {
		requestAnimationFrame(() => {
			if (!id) return;
			const el = document.querySelector(`[data-node-id="${id}"]`);
			el?.scrollIntoView({ block: center ? 'center' : 'nearest' });
		});
	}

	// Navigate to a node in tree mode (used by breadcrumb clicks and context expansion)
	function navigateToNode(id: string) {
		selectedNodeId = id;
		viewMode = 'tree';
		collapsedNodes = expandAncestors(id, collapsedNodes, index);
		scrollToNode(id, true);
	}

	// Switch to tree mode centered on the selected node
	function switchToTreeAtSelected() {
		if (!selectedNodeId) return;
		viewMode = 'tree';
		collapsedNodes = expandAncestors(selectedNodeId, collapsedNodes, index);
		scrollToNode(selectedNodeId, true);
	}


	// --- Context expansion controls ---
	function expandUp1() {
		if (!selectedNodeId) return;
		if (viewMode === 'filter') switchToTreeAtSelected();
		collapsedNodes = expandOneAncestor(selectedNodeId, collapsedNodes, index);
	}

	function expandUpAll() {
		if (!selectedNodeId) return;
		if (viewMode === 'filter') {
			switchToTreeAtSelected();
		} else {
			collapsedNodes = expandAncestors(selectedNodeId, collapsedNodes, index);
			scrollToNode(selectedNodeId, true);
		}
	}

	function expandDown1() {
		if (!selectedNodeId) return;
		if (viewMode === 'filter') switchToTreeAtSelected();
		collapsedNodes = expandOneLevel(selectedNodeId, collapsedNodes);
	}

	function expandDownAll() {
		if (!selectedNodeId || !selectedNode) return;
		if (viewMode === 'filter') switchToTreeAtSelected();
		collapsedNodes = expandSubtree(selectedNode, collapsedNodes);
	}

	// --- Keyboard navigation ---
	let treePanelEl = $state<HTMLElement | null>(null);

	function handleTreeKeydown(e: KeyboardEvent) {
		// Focus guard: only handle when tree panel (not search/dropdowns) is focused
		if (treePanelEl && !treePanelEl.contains(e.target as Node)) return;
		if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;

		const nodes = viewMode === 'filter' ? filteredNodes : visibleNodes;
		const idx = nodes.findIndex((n) => n.id === selectedNodeId);

		if (e.key === 'ArrowDown' || e.key === 'j') {
			e.preventDefault();
			const next = idx < 0 ? 0 : Math.min(idx + 1, nodes.length - 1);
			selectedNodeId = nodes[next]?.id ?? null;
			scrollToNode(selectedNodeId);
		} else if (e.key === 'ArrowUp' || e.key === 'k') {
			e.preventDefault();
			const prev = idx <= 0 ? 0 : idx - 1;
			selectedNodeId = nodes[prev]?.id ?? null;
			scrollToNode(selectedNodeId);
		} else if (e.key === 'ArrowRight' || e.key === 'l') {
			e.preventDefault();
			if (selectedNodeId && collapsedNodes.has(selectedNodeId)) {
				toggleCollapse(selectedNodeId);
			}
		} else if (e.key === 'ArrowLeft' || e.key === 'h') {
			e.preventDefault();
			if (selectedNodeId) {
				const node = index.nodeById.get(selectedNodeId);
				if (node && node.children.length > 0 && !collapsedNodes.has(node.id)) {
					toggleCollapse(node.id);
				} else {
					// Select parent
					const parentId = index.parentById.get(selectedNodeId);
					if (parentId != null) {
						selectedNodeId = parentId;
						scrollToNode(selectedNodeId);
					}
				}
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (selectedNodeId) {
				selectNode(selectedNodeId);
			}
		}
	}

	// --- Display helpers ---

	function nodeIcon(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt': return node.isCompactSummary ? '\u{1F4E6}' : '\u{1F464}';
			case 'tool-result': return node.isError ? '\u{274C}' : '\u{1F527}';
			case 'assistant': return node.isSynthetic ? '\u{26A0}' : '\u{1F916}';
			case 'system': {
				if (node.subtype === 'compact_boundary') return '\u{1F5DC}';
				if (node.subtype === 'api_error') return '\u{26A0}';
				if (node.subtype === 'turn_duration') return '\u{23F1}';
				return '\u{2699}';
			}
			case 'subagent': return '\u{1F9E9}';
			case 'meta': return '\u{1F4CB}';
		}
	}

	function nodeLabel(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt':
				if (node.isCompactSummary) return 'Compaction Summary';
				return truncate(node.content, 80);
			case 'tool-result':
				return `${node.toolName} ${node.isError ? '(error)' : 'result'}`;
			case 'assistant': {
				if (node.textBlocks.length > 0) {
					return truncate(node.textBlocks.map((b) => b.text).join(' '), 80);
				}
				if (node.toolUseBlocks.length > 0) {
					const names = node.toolUseBlocks.map((b) => b.name);
					return `Tool calls: ${names.join(', ')}`;
				}
				if (node.thinkingBlocks.length > 0) return 'Thinking...';
				return 'Assistant response';
			}
			case 'system': {
				if (node.subtype === 'compact_boundary' && node.preTokens !== null) {
					return `Compaction (${formatTokens(node.preTokens)} tokens)`;
				}
				if (node.subtype === 'turn_duration' && node.durationMs !== null) {
					return `Turn duration: ${formatDuration(node.durationMs)}`;
				}
				if (node.subtype === 'api_error' && node.errorMessage) {
					return `API error: ${node.errorMessage}`;
				}
				return `System: ${node.subtype}`;
			}
			case 'subagent':
				return `Subagent: ${node.agentType} (${node.agentId})`;
			case 'meta':
				return node.label;
		}
	}

	function nodeBadge(node: ConversationNode): string | null {
		if (node.kind === 'assistant') {
			const input = (node.usage.input_tokens ?? 0)
				+ (node.usage.cache_read_input_tokens ?? 0)
				+ (node.usage.cache_creation_input_tokens ?? 0);
			const output = node.usage.output_tokens ?? 0;
			if (input + output > 0) {
				return `${formatTokens(input)} in / ${formatTokens(output)} out`;
			}
		}
		return null;
	}

	function nodeColorClass(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt': return 'border-l-blue-500';
			case 'tool-result': return node.isError ? 'border-l-red-500' : 'border-l-emerald-500';
			case 'assistant': return 'border-l-purple-500';
			case 'system': {
				if (node.subtype === 'compact_boundary') return 'border-l-yellow-500';
				if (node.subtype === 'api_error') return 'border-l-red-500';
				return 'border-l-gray-500';
			}
			case 'subagent': return 'border-l-cyan-500';
			case 'meta': return 'border-l-gray-500';
		}
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(Math.round(n));
	}

	function formatDuration(ms: number): string {
		if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
		if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
		if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
		return `${Math.round(ms)}ms`;
	}

	function formatTime(ts: string): string {
		try {
			const d = new Date(ts);
			return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
		} catch {
			return ts;
		}
	}

	function truncate(s: string, max: number): string {
		const clean = s.replace(/\n/g, ' ').trim();
		return clean.length > max ? clean.slice(0, max) + '…' : clean;
	}

	function breadcrumbLabel(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt': return node.isCompactSummary ? 'Compaction' : truncate(node.content, 20);
			case 'tool-result': return node.toolName;
			case 'assistant': return 'Assistant';
			case 'system': return node.subtype;
			case 'subagent': return node.agentType;
			case 'meta': return node.recordType;
		}
	}

	/**
	 * Truncate a breadcrumb segment list from the middle when it's too long.
	 * Returns a subset of the ancestry with a null entry marking the ellipsis.
	 */
	function truncateBreadcrumb(
		ancestry: ConversationNode[],
		maxSegments: number,
	): (ConversationNode | null)[] {
		if (ancestry.length <= maxSegments) return ancestry;
		// Keep first, last (maxSegments - 2), and ellipsis in the middle
		const keep = Math.max(Math.floor((maxSegments - 1) / 2), 1);
		const start = ancestry.slice(0, keep);
		const end = ancestry.slice(-(maxSegments - 1 - keep));
		return [...start, null, ...end];
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex h-[calc(100vh-14rem)] gap-4" onkeydown={handleTreeKeydown}>
	<!-- Tree panel -->
	<div class="flex-1 min-w-0 flex flex-col overflow-hidden rounded-lg border border-border bg-card">
		<!-- Toolbar -->
		<div class="flex flex-col gap-1.5 border-b border-border p-2">
			<!-- Row 1: Expand/Collapse + Depth + Search -->
			<div class="flex items-center gap-1.5 flex-wrap">
				<button onclick={expandAll} class="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Expand All</button>
				<button onclick={collapseAll} class="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Collapse All</button>
				<span class="text-[9px] text-muted-foreground/50">|</span>
				<span class="text-[10px] text-muted-foreground">Depth:</span>
				{#each [1, 2, 3] as d}
					<button onclick={() => setDepth(d)} class="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">{d}</button>
				{/each}
				<button onclick={expandAll} class="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">All</button>

				<span class="text-[9px] text-muted-foreground/50">|</span>

				<input
					type="text"
					placeholder="Search..."
					value={searchText}
					oninput={onSearchInput}
					class="rounded border border-border bg-background px-2 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 w-32"
				/>

				{#if activeFiltersExist && viewMode === 'tree'}
					<button
						onclick={() => { viewMode = 'filter'; }}
						class="rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20 transition-colors"
					>Back to results</button>
				{/if}
				{#if activeFiltersExist}
					<button
						onclick={clearAllFilters}
						class="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/10 transition-colors"
					>Clear filters</button>
				{/if}
			</div>

			<!-- Row 2: Kind filter chips -->
			<div class="flex items-center gap-1 flex-wrap">
				{#each KIND_CHIPS as chip}
					{@const isActive = activeKinds.has(chip.kind)}
					<button
						onclick={() => toggleKind(chip.kind)}
						class="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors
							{isActive ? 'bg-primary/20 text-primary ring-1 ring-primary/30' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						<span class="text-[9px]">{chip.icon}</span>
						{chip.label}
					</button>
				{/each}
			</div>

			<!-- Row 3: Secondary filters (conditional) -->
			{#if activeKinds.has('tool-result')}
				<div class="flex items-center gap-2 text-[10px]">
					<select
						value={toolNameFilter ?? ''}
						onchange={(e) => { toolNameFilter = (e.currentTarget as HTMLSelectElement).value || null; }}
						class="rounded border border-border bg-background px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/30"
					>
						<option value="">All tools</option>
						{#each index.availableToolNames as name}
							<option value={name}>{name}</option>
						{/each}
					</select>
					<label class="flex items-center gap-1 text-muted-foreground cursor-pointer">
						<input type="checkbox" bind:checked={errorOnlyFilter} class="rounded border-border" />
						Errors only
					</label>
				</div>
			{/if}
			{#if activeKinds.has('subagent')}
				<div class="flex items-center gap-2 text-[10px]">
					<select
						value={subagentTypeFilter ?? ''}
						onchange={(e) => { subagentTypeFilter = (e.currentTarget as HTMLSelectElement).value || null; }}
						class="rounded border border-border bg-background px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/30"
					>
						<option value="">All types</option>
						{#each index.availableSubagentTypes as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
					<select
						value={subagentIdFilter ?? ''}
						onchange={(e) => { subagentIdFilter = (e.currentTarget as HTMLSelectElement).value || null; }}
						class="rounded border border-border bg-background px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/30"
					>
						<option value="">All IDs</option>
						{#each index.availableSubagentIds as id}
							<option value={id}>{id}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if activeKinds.has('assistant')}
				<div class="flex items-center gap-2 text-[10px]">
					<select
						value={modelFilter ?? ''}
						onchange={(e) => { modelFilter = (e.currentTarget as HTMLSelectElement).value || null; }}
						class="rounded border border-border bg-background px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/30"
					>
						<option value="">All models</option>
						{#each index.availableModels as m}
							<option value={m}>{m}</option>
						{/each}
					</select>
					<label class="flex items-center gap-1 text-muted-foreground cursor-pointer">
						<input type="checkbox" bind:checked={hasThinkingFilter} class="rounded border-border" />
						Has thinking
					</label>
					<label class="flex items-center gap-1 text-muted-foreground cursor-pointer">
						<input type="checkbox" bind:checked={hasToolCallsFilter} class="rounded border-border" />
						Has tool calls
					</label>
				</div>
			{/if}
			{#if activeKinds.has('system')}
				<div class="flex items-center gap-2 text-[10px]">
					{#each index.availableSystemSubtypes as st}
						{@const isActive = systemSubtypeFilter === st}
						<button
							onclick={() => { systemSubtypeFilter = isActive ? null : st; }}
							class="rounded px-1.5 py-0.5 transition-colors {isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}"
						>{st}</button>
					{/each}
				</div>
			{/if}
			{#if activeKinds.has('user-prompt')}
				<div class="flex items-center gap-2 text-[10px]">
					<label class="flex items-center gap-1 text-muted-foreground cursor-pointer">
						<input type="checkbox" bind:checked={compactionOnlyFilter} class="rounded border-border" />
						Compaction summaries only
					</label>
				</div>
			{/if}
		</div>

		<!-- Node list -->
		<div class="flex-1 overflow-auto p-2" bind:this={treePanelEl} tabindex="-1">
			{#if tree.roots.length === 0}
				<div class="p-8 text-center text-muted-foreground">
					No conversation records in this session.
				</div>
			{:else if viewMode === 'filter'}
				<!-- Filtered flat list -->
				{#if filteredNodes.length === 0}
					<div class="p-4 text-center text-xs text-muted-foreground">
						No nodes match the current filters.
					</div>
				{:else}
					{#each filteredNodes as node}
						{@const isSelected = node.id === selectedNodeId}
						{@const ancestry = getAncestry(node.id, index)}
						{@const stats = index.statsMap.get(node.id)}

						<div
							data-node-id={node.id}
							role="button"
							tabindex="0"
							onclick={() => selectNode(node.id)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node.id); } }}
							class="rounded px-2 py-1.5 mb-0.5 cursor-pointer transition-colors
								hover:bg-muted/30
								{isSelected ? 'bg-muted/50 ring-1 ring-primary/30' : ''}"
						>
							<!-- Breadcrumb (middle-truncated) -->
							{#if ancestry.length > 1}
								{@const segments = truncateBreadcrumb(ancestry.slice(0, -1), 5)}
								<div class="flex items-center gap-0.5 text-[9px] text-muted-foreground/50 mb-0.5 overflow-hidden">
									{#each segments as segment, i}
										{#if i > 0}<span>›</span>{/if}
										{#if segment === null}
											<span>…</span>
										{:else}
											<button
												onclick={(e) => { e.stopPropagation(); navigateToNode(segment.id); }}
												class="truncate max-w-[120px] hover:text-foreground/70 transition-colors"
											>{nodeIcon(segment)} {breadcrumbLabel(segment)}</button>
										{/if}
									{/each}
								</div>
							{/if}

							<!-- Node row -->
							<div class="flex items-start gap-1.5 text-xs">
								<span class="mt-0.5 flex-shrink-0 text-[11px]">{nodeIcon(node)}</span>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="truncate font-mono text-foreground/80">{nodeLabel(node)}</span>
										{#if nodeBadge(node)}
											<span class="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
												{nodeBadge(node)}
											</span>
										{/if}
									</div>
								</div>
								<!-- Counts -->
								<span class="flex-shrink-0 text-[9px] text-muted-foreground/40 whitespace-nowrap">
									{node.depth} ancestors{#if stats} · {stats.descendantCount} desc{/if}
								</span>
							</div>

							<!-- Inline context controls (when selected) -->
							{#if isSelected}
								<div class="flex items-center gap-2 mt-1 text-[9px]">
									{#if node.depth > 0}
										<button onclick={(e) => { e.stopPropagation(); expandUp1(); }} class="text-muted-foreground hover:text-foreground transition-colors">↑ 1</button>
										<button onclick={(e) => { e.stopPropagation(); expandUpAll(); }} class="text-muted-foreground hover:text-foreground transition-colors">↑ {node.depth}</button>
									{/if}
									{#if stats && stats.childCount > 0}
										<button onclick={(e) => { e.stopPropagation(); expandDown1(); }} class="text-muted-foreground hover:text-foreground transition-colors">↓ {stats.childCount}</button>
									{/if}
									{#if stats && stats.descendantCount > 0}
										<button onclick={(e) => { e.stopPropagation(); expandDownAll(); }} class="text-muted-foreground hover:text-foreground transition-colors">↓ all ({stats.descendantCount})</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			{:else}
				<!-- Tree view -->
				{#each visibleNodes as node}
					{@const isCollapsed = collapsedNodes.has(node.id)}
					{@const hasChildren = node.children.length > 0}
					{@const isSelected = node.id === selectedNodeId}
					{@const stats = index.statsMap.get(node.id)}

					<!-- Context expand controls above selected node -->
					{#if isSelected && node.depth > 0}
						<div
							class="flex items-center gap-2 text-[9px] pl-2"
							style="padding-left: {Math.min(node.depth, MAX_INDENT_DEPTH) * 16 + 24}px"
						>
							<button onclick={expandUp1} class="text-muted-foreground/50 hover:text-foreground transition-colors">↑ 1 parent</button>
							{#if node.depth > 1}
								<button onclick={expandUpAll} class="text-muted-foreground/50 hover:text-foreground transition-colors">↑ all {node.depth} ancestors</button>
							{/if}
						</div>
					{/if}

					<div
						data-node-id={node.id}
						role="button"
						tabindex="0"
						onclick={() => selectNode(node.id)}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node.id); } }}
						class="flex w-full items-start gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors cursor-pointer
							hover:bg-muted/30
							{isSelected ? 'bg-muted/50 ring-1 ring-primary/30' : ''}"
						style="padding-left: {Math.min(node.depth, MAX_INDENT_DEPTH) * 16 + 8}px"
					>
						<!-- Collapse toggle -->
						{#if hasChildren}
							<button
								onclick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
								class="mt-0.5 flex-shrink-0 text-[10px] text-muted-foreground hover:text-foreground transition-transform {isCollapsed ? '' : 'rotate-90'}"
							>
								{'\u25B6'}
							</button>
						{:else}
							<span class="mt-0.5 w-3 flex-shrink-0"></span>
						{/if}

						<!-- Icon -->
						<span class="mt-0.5 flex-shrink-0 text-[11px]">{nodeIcon(node)}</span>

						<!-- Content -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate font-mono text-foreground/80">{nodeLabel(node)}</span>
								{#if nodeBadge(node)}
									<span class="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
										{nodeBadge(node)}
									</span>
								{/if}
							</div>
							<div class="text-[9px] text-muted-foreground/60">{formatTime(node.timestamp)}</div>
						</div>

						<!-- Collapsed node counts -->
						{#if isCollapsed && stats && stats.descendantCount > 0}
							<span class="flex-shrink-0 text-[9px] text-muted-foreground/40 whitespace-nowrap mt-0.5">
								{stats.childCount} children · {stats.descendantCount} total
							</span>
						{/if}
					</div>

					<!-- Context expand controls below selected node -->
					{#if isSelected && stats && stats.childCount > 0}
						<div
							class="flex items-center gap-2 text-[9px] pl-2"
							style="padding-left: {Math.min(node.depth, MAX_INDENT_DEPTH) * 16 + 24}px"
						>
							<button onclick={expandDown1} class="text-muted-foreground/50 hover:text-foreground transition-colors">↓ {stats.childCount} children</button>
							{#if stats.descendantCount > stats.childCount}
								<button onclick={expandDownAll} class="text-muted-foreground/50 hover:text-foreground transition-colors">↓ all {stats.descendantCount} descendants</button>
							{/if}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>

	<!-- Detail panel -->
	<div class="w-[45%] flex-shrink-0 overflow-auto rounded-lg border border-border bg-card">
		{#if selectedNode}
			<div class="p-4 space-y-4">
				<!-- Breadcrumb (for deep nodes) -->
				{#if selectedAncestry.length > 2}
					<div class="flex items-center gap-1 text-[9px] text-muted-foreground/60 flex-wrap">
						{#each selectedAncestry as ancestor, i}
							{#if i > 0}<span class="text-muted-foreground/30">›</span>{/if}
							{#if ancestor.id === selectedNodeId}
								<span class="text-foreground/60">{nodeIcon(ancestor)} {breadcrumbLabel(ancestor)}</span>
							{:else}
								<button
									onclick={() => navigateToNode(ancestor.id)}
									class="hover:text-foreground/80 transition-colors"
								>{nodeIcon(ancestor)} {breadcrumbLabel(ancestor)}</button>
							{/if}
						{/each}
					</div>
				{/if}

				<!-- Header -->
				<div class="flex items-center gap-2 border-b border-border/30 pb-3">
					<span class="text-base">{nodeIcon(selectedNode)}</span>
					<div>
						<h3 class="text-sm font-medium">{nodeKindLabel(selectedNode)}</h3>
						<div class="text-[10px] text-muted-foreground">{formatTime(selectedNode.timestamp)}</div>
					</div>
				</div>

				<!-- Node-specific detail -->
				{#if selectedNode.kind === 'user-prompt'}
					{@const node = selectedNode as UserPromptNode}
					{#if node.isCompactSummary}
						<div class="rounded bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 text-xs text-yellow-300">
							Compaction summary — injected by the framework after context compaction.
						</div>
					{/if}
					<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
						<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/90">{node.content}</pre>
					</div>

				{:else if selectedNode.kind === 'tool-result'}
					{@const node = selectedNode as ToolResultNode}
					<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
						<div><span class="text-muted-foreground">Tool</span><div class="font-mono">{node.toolName}</div></div>
						<div><span class="text-muted-foreground">tool_use_id</span><div class="font-mono text-[10px]">{node.toolUseId}</div></div>
						<div><span class="text-muted-foreground">Status</span><div class="font-mono {node.isError ? 'text-red-400' : 'text-green-400'}">{node.isError ? 'Error' : 'Success'}</div></div>
						{#if node.sourceFile}
							<div class="col-span-2"><span class="text-muted-foreground">Source</span><div class="font-mono text-[10px]">{node.sourceFile.filePath} (lines {node.sourceFile.startLine}–{node.sourceFile.startLine + node.sourceFile.numLines - 1} of {node.sourceFile.totalLines})</div></div>
						{/if}
					</div>
					<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
						<pre class="max-h-96 overflow-auto whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">{node.content}</pre>
					</div>

				{:else if selectedNode.kind === 'assistant'}
					{@const node = selectedNode as AssistantResponseNode}
					<!-- Metadata -->
					<div class="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
						<div><span class="text-muted-foreground">Model</span><div class="font-mono">{node.model}</div></div>
						<div><span class="text-muted-foreground">Stop reason</span><div class="font-mono">{node.stopReason ?? '\u2014'}</div></div>
						{#if node.messageId}
							<div><span class="text-muted-foreground">Message ID</span><div class="font-mono text-[10px] truncate" title={node.messageId}>{node.messageId}</div></div>
						{/if}
					</div>

					<!-- Token usage -->
					{@const input = (node.usage.input_tokens ?? 0) + (node.usage.cache_read_input_tokens ?? 0) + (node.usage.cache_creation_input_tokens ?? 0)}
					{@const cacheRead = node.usage.cache_read_input_tokens ?? 0}
					{@const cacheCreate = node.usage.cache_creation_input_tokens ?? 0}
					{@const output = node.usage.output_tokens ?? 0}
					<div class="rounded bg-muted/20 border border-border/30 p-2 text-xs">
						<div class="grid grid-cols-4 gap-2">
							<div><span class="text-muted-foreground">Input</span><div class="font-mono">{formatTokens(input)}</div></div>
							<div><span class="text-muted-foreground">Output</span><div class="font-mono">{formatTokens(output)}</div></div>
							<div><span class="text-muted-foreground">Cache read</span><div class="font-mono">{formatTokens(cacheRead)}</div></div>
							<div><span class="text-muted-foreground">Cache create</span><div class="font-mono">{formatTokens(cacheCreate)}</div></div>
						</div>
					</div>

					<!-- Content blocks -->
					{#if node.thinkingBlocks.length > 0}
						<div>
							<h4 class="mb-1 text-xs font-medium text-muted-foreground">Thinking</h4>
							{#each node.thinkingBlocks as block}
								<div class="border-l-2 border-l-amber-500/50 pl-3 mb-2">
									<pre class="max-h-64 overflow-auto whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/60 italic">{block.thinking}</pre>
								</div>
							{/each}
						</div>
					{/if}

					{#if node.textBlocks.length > 0}
						<div>
							<h4 class="mb-1 text-xs font-medium text-muted-foreground">Text</h4>
							{#each node.textBlocks as block}
								<div class="border-l-2 border-l-purple-500/50 pl-3 mb-2">
									<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/90">{block.text}</pre>
								</div>
							{/each}
						</div>
					{/if}

					{#if node.toolUseBlocks.length > 0}
						<div>
							<h4 class="mb-1 text-xs font-medium text-muted-foreground">Tool Calls</h4>
							{#each node.toolUseBlocks as block}
								<div class="rounded border border-border/30 bg-muted/10 p-2 mb-2">
									<div class="flex items-center gap-2 mb-1">
										<span class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">{block.name}</span>
										<span class="text-[9px] font-mono text-muted-foreground">{block.id}</span>
									</div>
									<pre class="max-h-48 overflow-auto whitespace-pre-wrap text-[10px] font-mono leading-relaxed text-foreground/70">{JSON.stringify(block.input, null, 2)}</pre>
								</div>
							{/each}
						</div>
					{/if}

				{:else if selectedNode.kind === 'system'}
					{@const node = selectedNode as SystemEventNode}
					<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
						<div><span class="text-muted-foreground">Subtype</span><div class="font-mono">{node.subtype}</div></div>
						{#if node.preTokens !== null}
							<div><span class="text-muted-foreground">Pre-compaction tokens</span><div class="font-mono">{formatTokens(node.preTokens)}</div></div>
						{/if}
						{#if node.durationMs !== null}
							<div><span class="text-muted-foreground">Duration</span><div class="font-mono">{formatDuration(node.durationMs)}</div></div>
						{/if}
						{#if node.errorMessage}
							<div><span class="text-muted-foreground">Error</span><div class="font-mono text-red-400">{node.errorMessage}</div></div>
						{/if}
					</div>
					{#if node.content}
						<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
							<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">{node.content}</pre>
						</div>
					{/if}

				{:else if selectedNode.kind === 'subagent'}
					{@const node = selectedNode as SubagentNode}
					<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
						<div><span class="text-muted-foreground">Agent ID</span><div class="font-mono">{node.agentId}</div></div>
						<div><span class="text-muted-foreground">Type</span><div class="font-mono">{node.agentType}</div></div>
					</div>
					{#if node.description}
						<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
							<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">{node.description}</pre>
						</div>
					{/if}
					{@const subStats = index.statsMap.get(node.id)}
					<div class="rounded bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300">
						{node.children.length} inner node{node.children.length !== 1 ? 's' : ''}{#if subStats} ({subStats.descendantCount} total descendants){/if} — expand in the tree to browse.
					</div>

				{:else if selectedNode.kind === 'meta'}
					{@const node = selectedNode as MetaNode}
					<div class="text-xs">
						<span class="text-muted-foreground">Type: </span>
						<span class="font-mono">{node.recordType}</span>
					</div>
					<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
						<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">{node.label}</pre>
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				Select a node to view details
			</div>
		{/if}
	</div>
</div>

<!-- Summary bar -->
<div class="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
	<span>{tree.nodeCount} nodes</span>
	{#if tree.orphanCount > 0}
		<span class="text-yellow-400">{tree.orphanCount} orphaned</span>
	{/if}
	{#if viewMode === 'filter'}
		<span class="text-primary">{filteredNodes.length} match{filteredNodes.length !== 1 ? 'es' : ''}</span>
	{/if}
	<span class="flex items-center gap-1"><span class="text-blue-400">{'\u{1F464}'}</span> User</span>
	<span class="flex items-center gap-1"><span class="text-purple-400">{'\u{1F916}'}</span> Assistant</span>
	<span class="flex items-center gap-1"><span class="text-emerald-400">{'\u{1F527}'}</span> Tool result</span>
	<span class="flex items-center gap-1"><span class="text-cyan-400">{'\u{1F9E9}'}</span> Subagent</span>
	<span class="flex items-center gap-1"><span class="text-yellow-400">{'\u{1F5DC}'}</span> Compaction</span>
	<span class="flex items-center gap-1"><span>{'\u{2699}'}</span> System</span>
</div>

<script lang="ts" module>
	function nodeKindLabel(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt': return node.isCompactSummary ? 'Compaction Summary' : 'User Prompt';
			case 'tool-result': return `Tool Result: ${node.toolName}`;
			case 'assistant': return 'Assistant Response';
			case 'system': return `System Event (${node.subtype})`;
			case 'subagent': return `Subagent: ${node.agentType}`;
			case 'meta': return `Metadata (${node.recordType})`;
		}
	}
</script>
