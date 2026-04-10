import type {
	ConversationNode,
	ConversationTree,
	ToolResultNode,
	AssistantResponseNode,
	SubagentNode,
	SystemEventNode,
	UserPromptNode,
} from './conversation-builder.js';

// =============================================================================
// Node statistics
// =============================================================================

export interface NodeStats {
	childCount: number;
	descendantCount: number;
}

// =============================================================================
// Tree index — built once per tree, provides O(1) lookups
// =============================================================================

export interface TreeIndex {
	nodeById: Map<string, ConversationNode>;
	parentById: Map<string, string | null>;
	statsMap: Map<string, NodeStats>;
	availableToolNames: string[];
	availableSubagentTypes: string[];
	availableSubagentIds: string[];
	availableModels: string[];
	availableSystemSubtypes: string[];
}

export function buildTreeIndex(roots: ConversationNode[]): TreeIndex {
	const nodeById = new Map<string, ConversationNode>();
	const parentById = new Map<string, string | null>();
	const statsMap = new Map<string, NodeStats>();
	const toolNames = new Set<string>();
	const subagentTypes = new Set<string>();
	const subagentIds = new Set<string>();
	const models = new Set<string>();
	const systemSubtypes = new Set<string>();

	function walk(nodes: ConversationNode[], parentId: string | null): number {
		let totalDescendants = 0;
		for (const node of nodes) {
			nodeById.set(node.id, node);
			parentById.set(node.id, parentId);

			// Collect filter options
			switch (node.kind) {
				case 'tool-result':
					toolNames.add(node.toolName);
					break;
				case 'subagent':
					subagentTypes.add(node.agentType);
					subagentIds.add(node.agentId);
					break;
				case 'assistant':
					models.add(node.model);
					break;
				case 'system':
					systemSubtypes.add(node.subtype);
					break;
			}

			const childCount = node.children.length;
			const descendantCount = walk(node.children, node.id);
			statsMap.set(node.id, { childCount, descendantCount });
			totalDescendants += 1 + descendantCount;
		}
		return totalDescendants;
	}

	walk(roots, null);

	return {
		nodeById,
		parentById,
		statsMap,
		availableToolNames: [...toolNames].sort(),
		availableSubagentTypes: [...subagentTypes].sort(),
		availableSubagentIds: [...subagentIds].sort(),
		availableModels: [...models].sort(),
		availableSystemSubtypes: [...systemSubtypes].sort(),
	};
}

// =============================================================================
// Ancestry
// =============================================================================

export function getAncestry(
	nodeId: string,
	index: TreeIndex,
): ConversationNode[] {
	const path: ConversationNode[] = [];
	const visited = new Set<string>();
	let current: string | null = nodeId;
	while (current != null) {
		if (visited.has(current)) break;
		visited.add(current);
		const node = index.nodeById.get(current);
		if (!node) break;
		path.unshift(node);
		current = index.parentById.get(current) ?? null;
	}
	return path;
}

// =============================================================================
// Collapse helpers
// =============================================================================

export function collectSubagentIds(roots: ConversationNode[]): Set<string> {
	const ids = new Set<string>();
	function walk(nodes: ConversationNode[]) {
		for (const node of nodes) {
			if (node.kind === 'subagent') ids.add(node.id);
			walk(node.children);
		}
	}
	walk(roots);
	return ids;
}

export function collectAllParentIds(roots: ConversationNode[]): Set<string> {
	const ids = new Set<string>();
	function walk(nodes: ConversationNode[]) {
		for (const node of nodes) {
			if (node.children.length > 0) ids.add(node.id);
			walk(node.children);
		}
	}
	walk(roots);
	return ids;
}

export function collapseToDepth(
	roots: ConversationNode[],
	maxDepth: number,
): Set<string> {
	const ids = new Set<string>();
	function walk(nodes: ConversationNode[]) {
		for (const node of nodes) {
			if (node.children.length > 0 && node.depth >= maxDepth) {
				ids.add(node.id);
			}
			walk(node.children);
		}
	}
	walk(roots);
	return ids;
}

/**
 * Uncollapse all ancestors of a node so it becomes visible in the tree.
 * Returns a new Set with those ancestors removed.
 */
export function expandAncestors(
	nodeId: string,
	collapsed: Set<string>,
	index: TreeIndex,
): Set<string> {
	const next = new Set(collapsed);
	const ancestry = getAncestry(nodeId, index);
	for (const node of ancestry) {
		next.delete(node.id);
	}
	return next;
}

/**
 * Uncollapse a node and all its descendants recursively.
 */
export function expandSubtree(
	node: ConversationNode,
	collapsed: Set<string>,
): Set<string> {
	const next = new Set(collapsed);
	function walk(n: ConversationNode) {
		next.delete(n.id);
		for (const child of n.children) {
			walk(child);
		}
	}
	walk(node);
	return next;
}

/**
 * Expand one level of children (uncollapse the node itself, but not its
 * grandchildren).
 */
export function expandOneLevel(
	nodeId: string,
	collapsed: Set<string>,
): Set<string> {
	const next = new Set(collapsed);
	next.delete(nodeId);
	return next;
}

/**
 * Expand one ancestor above (uncollapse the parent so the node becomes visible).
 */
export function expandOneAncestor(
	nodeId: string,
	collapsed: Set<string>,
	index: TreeIndex,
): Set<string> {
	const parentId = index.parentById.get(nodeId);
	if (parentId == null) return collapsed;
	const next = new Set(collapsed);
	next.delete(parentId);
	return next;
}

// =============================================================================
// Filter predicates
// =============================================================================

export interface FilterState {
	activeKinds: Set<string>;
	toolNameFilter: string | null;
	errorOnlyFilter: boolean;
	subagentTypeFilter: string | null;
	subagentIdFilter: string | null;
	modelFilter: string | null;
	systemSubtypeFilter: string | null;
	compactionOnlyFilter: boolean;
	hasThinkingFilter: boolean;
	hasToolCallsFilter: boolean;
	searchText: string;
}

export function hasActiveFilters(state: FilterState): boolean {
	return state.activeKinds.size > 0 || state.searchText.trim() !== '';
}

/**
 * Test whether a single node matches the current filter state.
 */
export function matchesFilter(
	node: ConversationNode,
	state: FilterState,
	nodeLabel: string,
): boolean {
	// Kind filter
	if (state.activeKinds.size > 0 && !state.activeKinds.has(node.kind)) {
		return false;
	}

	// Text search (AND with kind)
	if (state.searchText.trim() !== '') {
		if (!nodeLabel.toLowerCase().includes(state.searchText.trim().toLowerCase())) {
			return false;
		}
	}

	// Type-specific secondary filters
	if (state.activeKinds.has('tool-result') && node.kind === 'tool-result') {
		const tr = node as ToolResultNode;
		if (state.toolNameFilter && tr.toolName !== state.toolNameFilter) return false;
		if (state.errorOnlyFilter && !tr.isError) return false;
	}

	if (state.activeKinds.has('subagent') && node.kind === 'subagent') {
		const sa = node as SubagentNode;
		if (state.subagentTypeFilter && sa.agentType !== state.subagentTypeFilter) return false;
		if (state.subagentIdFilter && sa.agentId !== state.subagentIdFilter) return false;
	}

	if (state.activeKinds.has('assistant') && node.kind === 'assistant') {
		const ar = node as AssistantResponseNode;
		if (state.modelFilter && ar.model !== state.modelFilter) return false;
		if (state.hasThinkingFilter && ar.thinkingBlocks.length === 0) return false;
		if (state.hasToolCallsFilter && ar.toolUseBlocks.length === 0) return false;
	}

	if (state.activeKinds.has('system') && node.kind === 'system') {
		const se = node as SystemEventNode;
		if (state.systemSubtypeFilter && se.subtype !== state.systemSubtypeFilter) return false;
	}

	if (state.activeKinds.has('user-prompt') && node.kind === 'user-prompt') {
		const up = node as UserPromptNode;
		if (state.compactionOnlyFilter && !up.isCompactSummary) return false;
	}

	return true;
}

/**
 * Collect all nodes in tree order that match the filter.
 */
export function filterNodes(
	roots: ConversationNode[],
	state: FilterState,
	labelFn: (node: ConversationNode) => string,
): ConversationNode[] {
	const result: ConversationNode[] = [];
	function walk(nodes: ConversationNode[]) {
		for (const node of nodes) {
			if (matchesFilter(node, state, labelFn(node))) {
				result.push(node);
			}
			walk(node.children);
		}
	}
	walk(roots);
	return result;
}

/**
 * Create a default (empty) filter state.
 */
export function emptyFilterState(): FilterState {
	return {
		activeKinds: new Set(),
		toolNameFilter: null,
		errorOnlyFilter: false,
		subagentTypeFilter: null,
		subagentIdFilter: null,
		modelFilter: null,
		systemSubtypeFilter: null,
		compactionOnlyFilter: false,
		hasThinkingFilter: false,
		hasToolCallsFilter: false,
		searchText: '',
	};
}
