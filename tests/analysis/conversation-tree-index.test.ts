import { describe, it, expect } from 'vitest';
import type {
	ConversationNode,
	UserPromptNode,
	AssistantResponseNode,
	ToolResultNode,
	SubagentNode,
	SystemEventNode,
} from '$lib/analysis/conversation-builder.js';
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
	hasActiveFilters,
	emptyFilterState,
	type FilterState,
} from '$lib/analysis/conversation-tree-index.js';

// =============================================================================
// Test fixtures
// =============================================================================

function makeUser(id: string, depth: number, children: ConversationNode[] = [], overrides: Partial<UserPromptNode> = {}): UserPromptNode {
	return {
		kind: 'user-prompt',
		id,
		timestamp: '2026-04-01T10:00:00Z',
		depth,
		children,
		content: `User message ${id}`,
		isCompactSummary: false,
		...overrides,
	};
}

function makeAssistant(id: string, depth: number, children: ConversationNode[] = [], overrides: Partial<AssistantResponseNode> = {}): AssistantResponseNode {
	return {
		kind: 'assistant',
		id,
		timestamp: '2026-04-01T10:01:00Z',
		depth,
		children,
		model: 'claude-opus-4-6',
		messageId: null,
		requestId: null,
		thinkingBlocks: [],
		textBlocks: [{ type: 'text', text: `Response ${id}` }],
		toolUseBlocks: [],
		usage: { input_tokens: 1000, output_tokens: 500 },
		stopReason: 'end_turn',
		isSynthetic: false,
		...overrides,
	};
}

function makeTool(id: string, depth: number, toolName: string, isError = false): ToolResultNode {
	return {
		kind: 'tool-result',
		id,
		timestamp: '2026-04-01T10:02:00Z',
		depth,
		children: [],
		toolUseId: `use-${id}`,
		toolName,
		content: isError ? 'Error: file not found' : 'Success',
		isError,
	};
}

function makeSubagent(id: string, depth: number, children: ConversationNode[] = [], overrides: Partial<SubagentNode> = {}): SubagentNode {
	return {
		kind: 'subagent',
		id,
		timestamp: '2026-04-01T10:03:00Z',
		depth,
		children,
		agentId: `agent-${id}`,
		agentType: 'Explore',
		description: `Subagent ${id}`,
		...overrides,
	};
}

function makeSystem(id: string, depth: number, subtype: string): SystemEventNode {
	return {
		kind: 'system',
		id,
		timestamp: '2026-04-01T10:04:00Z',
		depth,
		children: [],
		subtype,
		content: null,
		preTokens: subtype === 'compact_boundary' ? 100000 : null,
		durationMs: subtype === 'turn_duration' ? 5000 : null,
		errorMessage: subtype === 'api_error' ? 'rate limited' : null,
	};
}

/**
 * Build a representative tree:
 *
 * user-0 (depth 0)
 *   assistant-1 (depth 1)
 *     tool-read (depth 2)
 *     tool-write-err (depth 2, error)
 *     subagent-explore (depth 2)
 *       user-sub (depth 3)
 *         assistant-sub (depth 4)
 *           tool-sub-read (depth 5)
 *   system-compact (depth 1)
 */
function buildTestTree(): ConversationNode[] {
	const toolSubRead = makeTool('tool-sub-read', 5, 'Read');
	const assistantSub = makeAssistant('assistant-sub', 4, [toolSubRead], { model: 'claude-sonnet-4-6' });
	const userSub = makeUser('user-sub', 3, [assistantSub]);
	const subagent = makeSubagent('subagent-explore', 2, [userSub]);
	const toolRead = makeTool('tool-read', 2, 'Read');
	const toolWriteErr = makeTool('tool-write-err', 2, 'Write', true);
	const assistant1 = makeAssistant('assistant-1', 1, [toolRead, toolWriteErr, subagent], {
		thinkingBlocks: [{ type: 'thinking', thinking: 'hmm', signature: 'sig' }],
		toolUseBlocks: [{ type: 'tool_use', id: 'use-1', name: 'Read', input: {} }],
	});
	const systemCompact = makeSystem('system-compact', 1, 'compact_boundary');
	const user0 = makeUser('user-0', 0, [assistant1, systemCompact]);
	return [user0];
}

// =============================================================================
// buildTreeIndex
// =============================================================================

describe('buildTreeIndex', () => {
	it('indexes all nodes by id', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		expect(index.nodeById.size).toBe(9);
		expect(index.nodeById.get('user-0')?.kind).toBe('user-prompt');
		expect(index.nodeById.get('tool-sub-read')?.kind).toBe('tool-result');
	});

	it('maps parent ids correctly', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		expect(index.parentById.get('user-0')).toBeNull();
		expect(index.parentById.get('assistant-1')).toBe('user-0');
		expect(index.parentById.get('tool-read')).toBe('assistant-1');
		expect(index.parentById.get('subagent-explore')).toBe('assistant-1');
		expect(index.parentById.get('user-sub')).toBe('subagent-explore');
		expect(index.parentById.get('tool-sub-read')).toBe('assistant-sub');
	});

	it('computes descendant counts', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);

		const rootStats = index.statsMap.get('user-0')!;
		expect(rootStats.childCount).toBe(2); // assistant-1, system-compact
		expect(rootStats.descendantCount).toBe(8); // all other nodes

		const assistantStats = index.statsMap.get('assistant-1')!;
		expect(assistantStats.childCount).toBe(3); // tool-read, tool-write-err, subagent
		expect(assistantStats.descendantCount).toBe(6);

		const leafStats = index.statsMap.get('tool-read')!;
		expect(leafStats.childCount).toBe(0);
		expect(leafStats.descendantCount).toBe(0);
	});

	it('collects available filter options', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		expect(index.availableToolNames).toEqual(['Read', 'Write']);
		expect(index.availableSubagentTypes).toEqual(['Explore']);
		expect(index.availableSubagentIds).toEqual(['agent-subagent-explore']);
		expect(index.availableModels).toEqual(['claude-opus-4-6', 'claude-sonnet-4-6']);
		expect(index.availableSystemSubtypes).toEqual(['compact_boundary']);
	});
});

// =============================================================================
// getAncestry
// =============================================================================

describe('getAncestry', () => {
	it('returns just the root for a root node', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		const ancestry = getAncestry('user-0', index);
		expect(ancestry.map((n) => n.id)).toEqual(['user-0']);
	});

	it('returns the full path for a deep node', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		const ancestry = getAncestry('tool-sub-read', index);
		expect(ancestry.map((n) => n.id)).toEqual([
			'user-0',
			'assistant-1',
			'subagent-explore',
			'user-sub',
			'assistant-sub',
			'tool-sub-read',
		]);
	});

	it('returns empty array for unknown node', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		expect(getAncestry('nonexistent', index)).toEqual([]);
	});

	it('stops if parent links contain a cycle', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		index.parentById.set('assistant-1', 'tool-sub-read');
		index.parentById.set('tool-sub-read', 'assistant-1');

		expect(getAncestry('assistant-1', index).map((n) => n.id)).toEqual([
			'tool-sub-read',
			'assistant-1',
		]);
	});
});

// =============================================================================
// Collapse helpers
// =============================================================================

describe('collectSubagentIds', () => {
	it('finds all subagent nodes', () => {
		const roots = buildTestTree();
		const ids = collectSubagentIds(roots);
		expect(ids).toEqual(new Set(['subagent-explore']));
	});

	it('returns empty set for tree with no subagents', () => {
		const roots = [makeUser('u', 0, [makeAssistant('a', 1)])];
		expect(collectSubagentIds(roots).size).toBe(0);
	});
});

describe('collectAllParentIds', () => {
	it('finds all nodes with children', () => {
		const roots = buildTestTree();
		const ids = collectAllParentIds(roots);
		// user-0, assistant-1, subagent-explore, user-sub, assistant-sub all have children
		expect(ids).toEqual(new Set([
			'user-0', 'assistant-1', 'subagent-explore', 'user-sub', 'assistant-sub',
		]));
	});
});

describe('collapseToDepth', () => {
	it('collapses nodes at depth >= maxDepth', () => {
		const roots = buildTestTree();
		const collapsed = collapseToDepth(roots, 2);
		// Nodes with children at depth >= 2: subagent-explore (2), user-sub (3), assistant-sub (4)
		expect(collapsed).toEqual(new Set([
			'subagent-explore', 'user-sub', 'assistant-sub',
		]));
	});

	it('collapses everything at depth 0', () => {
		const roots = buildTestTree();
		const collapsed = collapseToDepth(roots, 0);
		expect(collapsed).toEqual(new Set([
			'user-0', 'assistant-1', 'subagent-explore', 'user-sub', 'assistant-sub',
		]));
	});

	it('collapses nothing at very high depth', () => {
		const roots = buildTestTree();
		const collapsed = collapseToDepth(roots, 100);
		expect(collapsed.size).toBe(0);
	});
});

describe('expandAncestors', () => {
	it('removes ancestor ids from collapsed set', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		const collapsed = new Set(['user-0', 'assistant-1', 'subagent-explore', 'user-sub']);
		const result = expandAncestors('tool-sub-read', collapsed, index);
		// All ancestors of tool-sub-read should be uncollapsed
		expect(result.has('user-0')).toBe(false);
		expect(result.has('assistant-1')).toBe(false);
		expect(result.has('subagent-explore')).toBe(false);
		expect(result.has('user-sub')).toBe(false);
	});
});

describe('expandSubtree', () => {
	it('uncollapses node and all descendants', () => {
		const roots = buildTestTree();
		const collapsed = new Set([
			'user-0', 'assistant-1', 'subagent-explore', 'user-sub', 'assistant-sub',
		]);
		const subagent = roots[0].children[0].children[2]; // subagent-explore
		const result = expandSubtree(subagent, collapsed);
		// subagent-explore, user-sub, assistant-sub should be removed
		expect(result.has('subagent-explore')).toBe(false);
		expect(result.has('user-sub')).toBe(false);
		expect(result.has('assistant-sub')).toBe(false);
		// Others should remain
		expect(result.has('user-0')).toBe(true);
		expect(result.has('assistant-1')).toBe(true);
	});
});

describe('expandOneLevel', () => {
	it('only removes the target node from collapsed', () => {
		const collapsed = new Set(['assistant-1', 'subagent-explore']);
		const result = expandOneLevel('assistant-1', collapsed);
		expect(result.has('assistant-1')).toBe(false);
		expect(result.has('subagent-explore')).toBe(true);
	});
});

describe('expandOneAncestor', () => {
	it('uncollapses the parent of the target node', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		const collapsed = new Set(['assistant-1', 'subagent-explore']);
		const result = expandOneAncestor('subagent-explore', collapsed, index);
		expect(result.has('assistant-1')).toBe(false); // parent uncollapsed
		expect(result.has('subagent-explore')).toBe(true); // target unchanged
	});

	it('returns same set for root node (no parent)', () => {
		const roots = buildTestTree();
		const index = buildTreeIndex(roots);
		const collapsed = new Set(['user-0']);
		const result = expandOneAncestor('user-0', collapsed, index);
		expect(result).toEqual(collapsed);
	});
});

// =============================================================================
// Filter predicates
// =============================================================================

describe('hasActiveFilters', () => {
	it('returns false for empty state', () => {
		expect(hasActiveFilters(emptyFilterState())).toBe(false);
	});

	it('returns true when kinds are set', () => {
		const state = { ...emptyFilterState(), activeKinds: new Set(['tool-result']) };
		expect(hasActiveFilters(state)).toBe(true);
	});

	it('returns true when searchText is set', () => {
		const state = { ...emptyFilterState(), searchText: 'read' };
		expect(hasActiveFilters(state)).toBe(true);
	});
});

describe('matchesFilter', () => {
	it('matches all nodes with empty filter', () => {
		const node = makeTool('t', 0, 'Read');
		expect(matchesFilter(node, emptyFilterState(), 'Read result')).toBe(true);
	});

	it('filters by kind', () => {
		const state: FilterState = { ...emptyFilterState(), activeKinds: new Set(['tool-result']) };
		expect(matchesFilter(makeTool('t', 0, 'Read'), state, 'Read result')).toBe(true);
		expect(matchesFilter(makeUser('u', 0), state, 'User message')).toBe(false);
	});

	it('filters by search text (case-insensitive)', () => {
		const state: FilterState = { ...emptyFilterState(), searchText: 'READ' };
		expect(matchesFilter(makeTool('t', 0, 'Read'), state, 'Read result')).toBe(true);
		expect(matchesFilter(makeTool('t', 0, 'Write'), state, 'Write result')).toBe(false);
	});

	it('combines kind and search (AND)', () => {
		const state: FilterState = {
			...emptyFilterState(),
			activeKinds: new Set(['tool-result']),
			searchText: 'write',
		};
		expect(matchesFilter(makeTool('t', 0, 'Write'), state, 'Write result')).toBe(true);
		expect(matchesFilter(makeTool('t', 0, 'Read'), state, 'Read result')).toBe(false);
		expect(matchesFilter(makeUser('u', 0), state, 'write something')).toBe(false);
	});

	it('applies tool-result secondary filters', () => {
		const state: FilterState = {
			...emptyFilterState(),
			activeKinds: new Set(['tool-result']),
			toolNameFilter: 'Read',
			errorOnlyFilter: true,
		};
		expect(matchesFilter(makeTool('t1', 0, 'Read', true), state, 'Read (error)')).toBe(true);
		expect(matchesFilter(makeTool('t2', 0, 'Read', false), state, 'Read result')).toBe(false);
		expect(matchesFilter(makeTool('t3', 0, 'Write', true), state, 'Write (error)')).toBe(false);
	});

	it('applies subagent secondary filters', () => {
		const state: FilterState = {
			...emptyFilterState(),
			activeKinds: new Set(['subagent']),
			subagentTypeFilter: 'Explore',
		};
		expect(matchesFilter(
			makeSubagent('s1', 0, [], { agentType: 'Explore' }),
			state,
			'Subagent: Explore',
		)).toBe(true);
		expect(matchesFilter(
			makeSubagent('s2', 0, [], { agentType: 'Plan' }),
			state,
			'Subagent: Plan',
		)).toBe(false);
	});

	it('applies assistant secondary filters', () => {
		const state: FilterState = {
			...emptyFilterState(),
			activeKinds: new Set(['assistant']),
			hasThinkingFilter: true,
		};
		const withThinking = makeAssistant('a1', 0, [], {
			thinkingBlocks: [{ type: 'thinking', thinking: 'hmm', signature: 'sig' }],
		});
		const withoutThinking = makeAssistant('a2', 0);
		expect(matchesFilter(withThinking, state, 'Response')).toBe(true);
		expect(matchesFilter(withoutThinking, state, 'Response')).toBe(false);
	});

	it('applies system subtype filter', () => {
		const state: FilterState = {
			...emptyFilterState(),
			activeKinds: new Set(['system']),
			systemSubtypeFilter: 'api_error',
		};
		expect(matchesFilter(makeSystem('s1', 0, 'api_error'), state, 'API error')).toBe(true);
		expect(matchesFilter(makeSystem('s2', 0, 'turn_duration'), state, 'Turn duration')).toBe(false);
	});

	it('applies user compaction filter', () => {
		const state: FilterState = {
			...emptyFilterState(),
			activeKinds: new Set(['user-prompt']),
			compactionOnlyFilter: true,
		};
		expect(matchesFilter(
			makeUser('u1', 0, [], { isCompactSummary: true }),
			state,
			'Compaction Summary',
		)).toBe(true);
		expect(matchesFilter(
			makeUser('u2', 0, [], { isCompactSummary: false }),
			state,
			'User message',
		)).toBe(false);
	});
});

describe('filterNodes', () => {
	it('returns all nodes matching kind filter in tree order', () => {
		const roots = buildTestTree();
		const state: FilterState = {
			...emptyFilterState(),
			activeKinds: new Set(['tool-result']),
		};
		const results = filterNodes(roots, state, (n) => n.kind === 'tool-result' ? (n as ToolResultNode).toolName : '');
		expect(results.map((n) => n.id)).toEqual(['tool-read', 'tool-write-err', 'tool-sub-read']);
	});

	it('returns empty array when no matches', () => {
		const roots = buildTestTree();
		const state: FilterState = { ...emptyFilterState(), activeKinds: new Set(['meta']) };
		expect(filterNodes(roots, state, () => '')).toEqual([]);
	});
});
