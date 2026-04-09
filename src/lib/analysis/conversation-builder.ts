import type {
	TranscriptRecord,
	AssistantRecord,
	UserRecord,
	SystemRecord,
	ApiCallGroup,
	NormalizedToolResult,
	AssistantContentBlock,
	ThinkingBlock,
	TextBlock,
	ToolUseBlock,
	UserContentBlock,
	Usage,
} from '$lib/types.js';

// =============================================================================
// Node types — the conversation tree the UI renders
// =============================================================================

interface BaseNode {
	id: string;
	timestamp: string;
	children: ConversationNode[];
	depth: number;
}

export interface UserPromptNode extends BaseNode {
	kind: 'user-prompt';
	content: string;
	/** True for compaction summary records */
	isCompactSummary: boolean;
}

export interface ToolResultNode extends BaseNode {
	kind: 'tool-result';
	toolUseId: string;
	toolName: string;
	content: string;
	isError: boolean;
	/** Present when tool result is a structured file read */
	sourceFile?: {
		filePath: string;
		numLines: number;
		startLine: number;
		totalLines: number;
	};
}

export interface AssistantResponseNode extends BaseNode {
	kind: 'assistant';
	model: string;
	messageId: string | null;
	requestId: string | null;
	thinkingBlocks: ThinkingBlock[];
	textBlocks: TextBlock[];
	toolUseBlocks: ToolUseBlock[];
	usage: Usage;
	stopReason: string | null;
	isSynthetic: boolean;
}

export interface SystemEventNode extends BaseNode {
	kind: 'system';
	subtype: string;
	content: string | null;
	/** For compact_boundary: preTokens */
	preTokens: number | null;
	/** For turn_duration: durationMs */
	durationMs: number | null;
	/** For api_error: the error message */
	errorMessage: string | null;
}

export interface SubagentNode extends BaseNode {
	kind: 'subagent';
	agentId: string;
	agentType: string;
	description: string;
}

export interface MetaNode extends BaseNode {
	kind: 'meta';
	/** Type of the original record (progress, attachment, permission-mode, etc.) */
	recordType: string;
	label: string;
}

export type ConversationNode =
	| UserPromptNode
	| ToolResultNode
	| AssistantResponseNode
	| SystemEventNode
	| SubagentNode
	| MetaNode;

// =============================================================================
// Conversation tree — the top-level result
// =============================================================================

export interface ConversationTree {
	/** Root nodes (typically one user prompt + its chain) */
	roots: ConversationNode[];
	/** Total node count (for tab badge) */
	nodeCount: number;
	/** Nodes that referenced a parentUuid not found in the record set */
	orphanCount: number;
}

// =============================================================================
// Subagent input — matches SubagentData from subagent-reader
// =============================================================================

export interface SubagentInput {
	agentId: string;
	meta: { agentType: string; description: string };
	records: TranscriptRecord[];
	apiCallGroups: ApiCallGroup[];
	toolResults: NormalizedToolResult[];
}

// =============================================================================
// Builder
// =============================================================================

/** Check if a user record is a tool result (content is an array with tool_result blocks). */
function isToolResult(record: UserRecord): boolean {
	const msg = record.message;
	if (!msg || typeof msg.content === 'string') return false;
	const blocks = msg.content as UserContentBlock[];
	return blocks.some((b) => b.type === 'tool_result');
}

/** Normalize tool_result content which can be a string or array of content blocks. */
function normalizeToolResultContent(content: string | unknown[]): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return (content as Array<{ type: string; text?: string }>)
			.filter((b) => b.type === 'text' && b.text)
			.map((b) => b.text)
			.join('\n');
	}
	return JSON.stringify(content);
}

/** Get the first tool_result block's tool_use_id and content from a user record. */
function extractToolResult(record: UserRecord): { toolUseId: string; content: string; isError: boolean } | null {
	const msg = record.message;
	if (!msg || typeof msg.content === 'string') return null;
	const blocks = msg.content as UserContentBlock[];
	const tr = blocks.find((b) => b.type === 'tool_result');
	if (!tr || tr.type !== 'tool_result') return null;
	return { toolUseId: tr.tool_use_id, content: normalizeToolResultContent(tr.content), isError: tr.is_error ?? false };
}

/** Get the user-visible content string from a user record. */
function getUserContent(record: UserRecord): string {
	const msg = record.message;
	if (!msg) return '';
	if (typeof msg.content === 'string') return msg.content;
	const blocks = msg.content as UserContentBlock[];
	return blocks
		.map((b) => b.type === 'text' ? b.text : b.type === 'tool_result' ? normalizeToolResultContent(b.content) : '')
		.filter(Boolean)
		.join('\n');
}

/** True if the assistant record is a synthetic/placeholder. */
function isSyntheticAssistant(record: AssistantRecord): boolean {
	return record.message?.model === '<synthetic>';
}

/**
 * Determine the grouping key for an assistant record.
 * Mirrors transcript-reader.ts groupKey logic: prefer message.id,
 * fall back to requestId, then standalone.
 */
function assistantGroupKey(record: AssistantRecord): { key: string; fallback: 'none' | 'requestId' | 'standalone' } {
	const messageId = record.message?.id;
	if (messageId) return { key: messageId, fallback: 'none' };

	const requestId = 'requestId' in record && typeof record.requestId === 'string'
		? record.requestId : undefined;
	if (requestId) return { key: requestId, fallback: 'requestId' };

	return { key: `standalone:${record.uuid}`, fallback: 'standalone' };
}

/**
 * Build a conversation tree from transcript records.
 *
 * Groups streaming assistant chunks by message.id into single nodes,
 * classifies user records as prompts vs tool results, and builds
 * the tree via uuid -> parentUuid links. Subagent data is woven in
 * as collapsible sub-trees at the Agent tool-result positions.
 *
 * @param records - Transcript records from the session
 * @param apiCallGroups - Pre-computed API call groups (for tool name resolution)
 * @param toolResults - Normalized tool results (for enrichment)
 * @param subagents - Subagent data (records + API call groups per subagent)
 */
export function buildConversationTree(
	records: TranscriptRecord[],
	apiCallGroups: ApiCallGroup[],
	toolResults: NormalizedToolResult[] = [],
	subagents: SubagentInput[] = [],
): ConversationTree {
	if (records.length === 0 && subagents.length === 0) {
		return { roots: [], nodeCount: 0, orphanCount: 0 };
	}

	// Build tool_use_id -> tool name map from API call groups
	const toolNameMap = new Map<string, string>();
	for (const group of apiCallGroups) {
		for (const block of group.contentBlocks) {
			if (block.type === 'tool_use') {
				toolNameMap.set(block.id, block.name);
			}
		}
	}

	// Build tool_use_id -> NormalizedToolResult map for enrichment
	const toolResultMap = new Map<string, NormalizedToolResult>();
	for (const tr of toolResults) {
		toolResultMap.set(tr.toolUseId, tr);
	}

	// Phase 1: Identify assistant record groups (by message.id / requestId / standalone)
	// Records with the same grouping key are streaming chunks of one API call
	const assistantGroups = new Map<string, AssistantRecord[]>();
	const nonAssistantRecords: TranscriptRecord[] = [];
	const assistantGroupLeader = new Map<string, string>(); // groupKey -> first chunk uuid

	for (const record of records) {
		if (record.type === 'assistant') {
			const ar = record as AssistantRecord;
			// Skip synthetic records entirely (per plan spec)
			if (isSyntheticAssistant(ar)) continue;

			const gk = assistantGroupKey(ar);

			const existing = assistantGroups.get(gk.key);
			if (existing) {
				existing.push(ar);
			} else {
				assistantGroups.set(gk.key, [ar]);
				assistantGroupLeader.set(gk.key, ar.uuid);
			}
		} else {
			nonAssistantRecords.push(record);
		}
	}

	// Phase 2: Build merged assistant nodes
	// Map from any chunk uuid -> leader uuid (so parentUuid references resolve)
	const chunkToLeader = new Map<string, string>();
	const mergedAssistantNodes = new Map<string, AssistantResponseNode>();

	for (const [groupKey, chunks] of assistantGroups) {
		chunks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
		const leader = chunks[0];
		const leaderUuid = leader.uuid;

		// Map all chunk uuids to the leader
		for (const chunk of chunks) {
			chunkToLeader.set(chunk.uuid, leaderUuid);
		}

		// Merge content blocks
		const allBlocks: AssistantContentBlock[] = [];
		for (const chunk of chunks) {
			if (chunk.message?.content) {
				allBlocks.push(...chunk.message.content);
			}
		}

		// Deduplicate content blocks — streaming chunks repeat earlier blocks
		// Use full content for keying to avoid prefix collisions
		const seen = new Set<string>();
		const dedupedBlocks: AssistantContentBlock[] = [];
		for (const block of allBlocks) {
			const key = blockKey(block);
			if (!seen.has(key)) {
				seen.add(key);
				dedupedBlocks.push(block);
			}
		}

		const messageId = leader.message?.id ?? null;
		const requestId = 'requestId' in leader && typeof leader.requestId === 'string'
			? leader.requestId : null;

		let stopReason: string | null = null;
		for (const chunk of chunks) {
			if (chunk.message?.stop_reason) stopReason = chunk.message.stop_reason;
		}

		mergedAssistantNodes.set(leaderUuid, {
			kind: 'assistant',
			id: leaderUuid,
			timestamp: leader.timestamp,
			children: [],
			depth: 0,
			model: leader.message?.model ?? 'unknown',
			messageId,
			requestId,
			thinkingBlocks: dedupedBlocks.filter((b): b is ThinkingBlock => b.type === 'thinking'),
			textBlocks: dedupedBlocks.filter((b): b is TextBlock => b.type === 'text'),
			toolUseBlocks: dedupedBlocks.filter((b): b is ToolUseBlock => b.type === 'tool_use'),
			usage: leader.message?.usage ?? {},
			stopReason,
			isSynthetic: false,
		});
	}

	// Phase 3: Build non-assistant nodes
	const otherNodes = new Map<string, ConversationNode>();

	for (const record of nonAssistantRecords) {
		// Skip records without uuid (file-history-snapshot, permission-mode, etc.)
		if (!('uuid' in record) || !record.uuid) continue;

		const uuid = record.uuid as string;

		if (record.type === 'user') {
			const ur = record as UserRecord;
			if (isToolResult(ur)) {
				const tr = extractToolResult(ur);
				if (tr) {
					// Enrich from NormalizedToolResult when available
					const normalized = toolResultMap.get(tr.toolUseId);
					otherNodes.set(uuid, {
						kind: 'tool-result',
						id: uuid,
						timestamp: record.timestamp,
						children: [],
						depth: 0,
						toolUseId: tr.toolUseId,
						toolName: normalized?.toolName ?? toolNameMap.get(tr.toolUseId) ?? 'unknown',
						content: tr.content,
						isError: tr.isError,
						sourceFile: normalized?.sourceFile,
					});
				}
			} else {
				otherNodes.set(uuid, {
					kind: 'user-prompt',
					id: uuid,
					timestamp: record.timestamp,
					children: [],
					depth: 0,
					content: getUserContent(ur),
					isCompactSummary: ur.isCompactSummary ?? false,
				});
			}
		} else if (record.type === 'system') {
			const sr = record as SystemRecord;
			otherNodes.set(uuid, {
				kind: 'system',
				id: uuid,
				timestamp: record.timestamp,
				children: [],
				depth: 0,
				subtype: sr.subtype,
				content: sr.content ?? null,
				preTokens: sr.compactMetadata?.preTokens ?? null,
				durationMs: sr.durationMs ?? null,
				errorMessage: sr.apiError?.message ?? null,
			});
		} else if (record.type === 'progress') {
			otherNodes.set(uuid, {
				kind: 'meta',
				id: uuid,
				timestamp: record.timestamp,
				children: [],
				depth: 0,
				recordType: 'progress',
				label: `Progress: ${(record as { data?: { type?: string } }).data?.type ?? 'update'}`,
			});
		} else {
			// attachment, agent-name, custom-title, etc. — skip from tree
			// (these are metadata, not conversation content)
		}
	}

	// Phase 4: Build the tree via parentUuid links
	const allNodes = new Map<string, ConversationNode>();
	for (const [id, node] of mergedAssistantNodes) allNodes.set(id, node);
	for (const [id, node] of otherNodes) allNodes.set(id, node);

	// Build uuid -> parentUuid map from original records
	const parentMap = new Map<string, string | null>();
	for (const record of records) {
		if (!('uuid' in record) || !record.uuid) continue;
		const uuid = record.uuid as string;
		const parentUuid = ('parentUuid' in record ? record.parentUuid : null) as string | null;
		parentMap.set(uuid, parentUuid);
	}

	const roots: ConversationNode[] = [];
	let orphanCount = 0;

	for (const [id, node] of allNodes) {
		const rawParent = parentMap.get(id) ?? null;

		if (rawParent === null) {
			roots.push(node);
			continue;
		}

		// Resolve: if parent is a non-leader chunk, redirect to leader
		const resolvedParent = chunkToLeader.get(rawParent) ?? rawParent;

		const parentNode = allNodes.get(resolvedParent);
		if (parentNode) {
			parentNode.children.push(node);
		} else {
			// Orphan — parent not in the node set (e.g., attachment, synthetic, or skipped record)
			// Walk ancestor chain to find a node
			let found = false;
			let ancestor = parentMap.get(rawParent);
			const visited = new Set<string>();
			while (ancestor && !visited.has(ancestor)) {
				visited.add(ancestor);
				const resolved = chunkToLeader.get(ancestor) ?? ancestor;
				const ancestorNode = allNodes.get(resolved);
				if (ancestorNode) {
					ancestorNode.children.push(node);
					found = true;
					break;
				}
				ancestor = parentMap.get(ancestor) ?? null;
			}
			if (!found) {
				roots.push(node);
				orphanCount++;
			}
		}
	}

	// Phase 5: Weave in subagent sub-trees
	// Find Agent tool-result nodes and attach subagent trees as children
	if (subagents.length > 0) {
		// Build agentId -> SubagentInput map
		const subagentMap = new Map<string, SubagentInput>();
		for (const sub of subagents) {
			subagentMap.set(sub.agentId, sub);
		}

		// Walk all tool-result nodes looking for Agent tool calls
		function attachSubagents(nodes: ConversationNode[]) {
			for (const node of nodes) {
				if (node.kind === 'tool-result' && node.toolName === 'Agent') {
					// Try to find the matching subagent by checking the tool result content
					// or by checking the agentId from the tool_use input
					for (const [agentId, sub] of subagentMap) {
						// Match by agentId appearing in the tool result content or tool_use_id
						// The most reliable match is agentId in the source record's toolUseResult
						if (node.content.includes(agentId) || matchSubagentToToolResult(node, sub, records)) {
							const subTree = buildSubagentSubTree(sub);
							node.children.push(subTree);
							subagentMap.delete(agentId);
							break;
						}
					}
				}
				attachSubagents(node.children);
			}
		}

		// If no reliable match, attach remaining subagents by timestamp order
		attachSubagents(roots);

		// Attach any unmatched subagents to the nearest Agent tool-result by timestamp
		if (subagentMap.size > 0) {
			const agentToolResults = collectAgentToolResults(roots);
			for (const [, sub] of subagentMap) {
				const subTree = buildSubagentSubTree(sub);
				// Find the closest Agent tool-result by timestamp
				let closest: ToolResultNode | null = null;
				let closestDist = Infinity;
				for (const tr of agentToolResults) {
					const dist = Math.abs(
						new Date(tr.timestamp).getTime() - new Date(subTree.timestamp).getTime(),
					);
					if (dist < closestDist) {
						closestDist = dist;
						closest = tr;
					}
				}
				if (closest) {
					closest.children.push(subTree);
				} else {
					// No Agent tool results — attach to roots
					roots.push(subTree);
				}
			}
		}
	}

	// Phase 6: Sort children by timestamp and assign depths
	function sortAndAssignDepth(nodes: ConversationNode[], depth: number) {
		nodes.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
		for (const node of nodes) {
			node.depth = depth;
			sortAndAssignDepth(node.children, depth + 1);
		}
	}
	sortAndAssignDepth(roots, 0);

	// Count all nodes in the final tree (main + subagent sub-trees)
	function countAllNodes(nodes: ConversationNode[]): number {
		let count = 0;
		for (const node of nodes) {
			count++;
			count += countAllNodes(node.children);
		}
		return count;
	}
	const totalNodeCount = countAllNodes(roots);

	return {
		roots,
		nodeCount: totalNodeCount,
		orphanCount,
	};
}

// =============================================================================
// Subagent sub-tree builder
// =============================================================================

function buildSubagentSubTree(sub: SubagentInput): SubagentNode {
	// Build a mini conversation tree for the subagent's records
	const innerTree = buildConversationTree(sub.records, sub.apiCallGroups, sub.toolResults);

	const firstTimestamp = sub.records.length > 0
		? ('timestamp' in sub.records[0] ? (sub.records[0] as { timestamp: string }).timestamp : '')
		: '';

	return {
		kind: 'subagent',
		id: `subagent-${sub.agentId}`,
		timestamp: firstTimestamp,
		children: innerTree.roots,
		depth: 0,
		agentId: sub.agentId,
		agentType: sub.meta.agentType,
		description: sub.meta.description,
	};
}

/** Check if a subagent matches a tool-result node via the source records. */
function matchSubagentToToolResult(
	node: ToolResultNode,
	sub: SubagentInput,
	records: TranscriptRecord[],
): boolean {
	// Find the source user record for this tool result
	for (const record of records) {
		if (record.type !== 'user') continue;
		const ur = record as UserRecord;
		if (!('uuid' in ur) || ur.uuid !== node.id) continue;
		// Check if the toolUseResult references this subagent
		const tur = ur.toolUseResult;
		if (tur && typeof tur === 'object' && 'agentId' in tur) {
			return (tur as { agentId: string }).agentId === sub.agentId;
		}
	}
	return false;
}

/** Collect all Agent tool-result nodes from the tree. */
function collectAgentToolResults(roots: ConversationNode[]): ToolResultNode[] {
	const result: ToolResultNode[] = [];
	function walk(nodes: ConversationNode[]) {
		for (const node of nodes) {
			if (node.kind === 'tool-result' && node.toolName === 'Agent') {
				result.push(node);
			}
			walk(node.children);
		}
	}
	walk(roots);
	return result;
}

// =============================================================================
// Helpers
// =============================================================================

/** Generate a dedup key for a content block using full content. */
function blockKey(block: AssistantContentBlock): string {
	switch (block.type) {
		case 'thinking':
			return `thinking:${block.signature}:${block.thinking}`;
		case 'text':
			return `text:${block.text}`;
		case 'tool_use':
			return `tool_use:${block.id}`;
	}
}

/** Flatten a conversation tree into a depth-first ordered list. */
export function flattenTree(roots: ConversationNode[]): ConversationNode[] {
	const result: ConversationNode[] = [];
	function walk(nodes: ConversationNode[]) {
		for (const node of nodes) {
			result.push(node);
			walk(node.children);
		}
	}
	walk(roots);
	return result;
}
