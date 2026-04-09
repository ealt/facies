import type {
	TranscriptRecord,
	ApiCallGroup,
	ContextCategory,
	ContextSnapshot,
	ContextTimelineEntry,
	UserRecord,
	SystemRecord,
} from '$lib/types.js';

// Category stacking order: system at base, compacted summary above it, then content
const CATEGORIES: ContextCategory[] = [
	'system', 'compacted_summary', 'user', 'assistant_text',
	'assistant_thinking', 'tool_results', 'subagent_overhead',
];

/** Floor categories stay fixed; only incremental categories are proportionally scaled. */
const FLOOR_CATEGORIES: ContextCategory[] = ['system', 'compacted_summary'];
const INCREMENTAL_CATEGORIES: ContextCategory[] = [
	'user', 'assistant_text', 'assistant_thinking', 'tool_results', 'subagent_overhead',
];

/** Rough chars-to-tokens ratio (per plan spec). */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

function truncate(text: string, maxLen: number): string {
	const clean = text.replace(/\n/g, ' ').trim();
	if (clean.length <= maxLen) return clean;
	return clean.slice(0, maxLen - 1) + '\u2026';
}

/** Marker for a compaction event visible on the chart. */
export interface CompactionMarker {
	/** Index into the snapshots array — the first post-compaction snapshot. */
	snapshotIndex: number;
	timestamp: string;
	preTokens: number;
	/** Inferred from the first post-compaction API call. Null if session ended before next call. */
	postTokens: number | null;
	tokensFreed: number | null;
}

/** Full result of context decomposition. */
export interface ContextDecomposition {
	snapshots: ContextSnapshot[];
	timeline: ContextTimelineEntry[];
	compactions: CompactionMarker[];
}

type RawCategories = Record<ContextCategory, number>;

function zeroRaw(): RawCategories {
	return {
		system: 0, user: 0, assistant_text: 0, assistant_thinking: 0,
		tool_results: 0, subagent_overhead: 0, compacted_summary: 0,
	};
}

/**
 * Scale raw category estimates to match an authoritative total.
 *
 * Floor categories (system, compacted_summary) are kept at their raw values.
 * Incremental categories (user, assistant_text, etc.) are proportionally scaled
 * to fill the remainder. This prevents the system baseline from growing over
 * time and ensures compacted_summary stays stable post-compaction.
 *
 * Exported for testing.
 */
export function scaleToAuthoritative(
	raw: RawCategories,
	authoritativeTotal: number,
): Record<ContextCategory, number> {
	const categories = {} as Record<ContextCategory, number>;

	if (authoritativeTotal === 0) {
		for (const cat of CATEGORIES) categories[cat] = 0;
		return categories;
	}

	const floor = FLOOR_CATEGORIES.reduce((sum, cat) => sum + raw[cat], 0);
	const incrementalRaw = INCREMENTAL_CATEGORIES.reduce((sum, cat) => sum + raw[cat], 0);

	// No incremental content — system stays fixed, compacted_summary absorbs remainder
	if (incrementalRaw === 0) {
		if (raw.compacted_summary > 0) {
			categories.system = Math.min(raw.system, authoritativeTotal);
			categories.compacted_summary = Math.max(0, authoritativeTotal - categories.system);
		} else {
			categories.system = authoritativeTotal;
			categories.compacted_summary = 0;
		}
		for (const cat of INCREMENTAL_CATEGORIES) categories[cat] = 0;
		return categories;
	}

	// Floor exceeds total — scale floor down, no room for incremental
	if (floor >= authoritativeTotal) {
		if (floor > 0) {
			const floorScale = authoritativeTotal / floor;
			let assigned = 0;
			for (let i = 0; i < FLOOR_CATEGORIES.length; i++) {
				const cat = FLOOR_CATEGORIES[i];
				if (i === FLOOR_CATEGORIES.length - 1) {
					categories[cat] = authoritativeTotal - assigned;
				} else {
					categories[cat] = Math.round(raw[cat] * floorScale);
					assigned += categories[cat];
				}
			}
		} else {
			categories.system = authoritativeTotal;
			categories.compacted_summary = 0;
		}
		for (const cat of INCREMENTAL_CATEGORIES) categories[cat] = 0;
		return categories;
	}

	// Fixed floors, proportionally scale incremental to fill remainder
	for (const cat of FLOOR_CATEGORIES) categories[cat] = raw[cat];
	const remainder = authoritativeTotal - floor;
	const incrementalScale = remainder / incrementalRaw;
	let assigned = floor;

	for (let i = 0; i < INCREMENTAL_CATEGORIES.length; i++) {
		const cat = INCREMENTAL_CATEGORIES[i];
		if (i === INCREMENTAL_CATEGORIES.length - 1) {
			categories[cat] = Math.max(0, authoritativeTotal - assigned);
		} else {
			const val = Math.round(raw[cat] * incrementalScale);
			categories[cat] = val;
			assigned += val;
		}
	}

	return categories;
}

/** Process a single user record into raw category estimates + timeline entries. */
function processUserRecord(
	record: UserRecord,
	raw: RawCategories,
	timeline: ContextTimelineEntry[],
	toolNameById: Map<string, string>,
	apiCallIndex: number,
): void {
	const message = record.message;

	// Compacted summaries go to their own category
	if (record.isCompactSummary) {
		const content = typeof message.content === 'string'
			? message.content
			: JSON.stringify(message.content);
		if (content.length > 0) {
			const est = estimateTokens(content);
			raw.compacted_summary += est;
			timeline.push({
				timestamp: record.timestamp,
				type: 'compacted_summary',
				description: 'Compacted context summary',
				estimatedTokens: est,
				cumulativeTokens: 0,
				apiCallIndex,
			});
		}
		return;
	}

	if (typeof message.content === 'string') {
		if (message.content.length > 0) {
			const est = estimateTokens(message.content);
			raw.user += est;
			timeline.push({
				timestamp: record.timestamp,
				type: 'user',
				description: truncate(message.content, 80),
				estimatedTokens: est,
				cumulativeTokens: 0,
				apiCallIndex,
			});
		}
	} else if (Array.isArray(message.content)) {
		for (const block of message.content) {
			if (block.type === 'text' && block.text.length > 0) {
				const est = estimateTokens(block.text);
				raw.user += est;
				timeline.push({
					timestamp: record.timestamp,
					type: 'user',
					description: truncate(block.text, 80),
					estimatedTokens: est,
					cumulativeTokens: 0,
					apiCallIndex,
				});
			} else if (block.type === 'tool_result') {
				// content can be a string or an array of content blocks in real transcripts
				const contentStr = typeof block.content === 'string'
					? block.content
					: Array.isArray(block.content)
						? (block.content as Array<{ type: string; text?: string }>)
							.filter((b) => b.type === 'text' && b.text)
							.map((b) => b.text)
							.join('\n')
						: JSON.stringify(block.content);
				if (contentStr.length > 0) {
					const est = estimateTokens(contentStr);
					const toolName = toolNameById.get(block.tool_use_id) ?? 'unknown';
					const isSubagent = toolName === 'Agent';
					const category: ContextCategory = isSubagent ? 'subagent_overhead' : 'tool_results';
					raw[category] += est;
					timeline.push({
						timestamp: record.timestamp,
						type: category,
						description: `${toolName}: ${truncate(contentStr, 60)}`,
						estimatedTokens: est,
						cumulativeTokens: 0,
						apiCallIndex,
					});
				}
			}
		}
	}
}

/**
 * Compute context decomposition: snapshots for the stacked area chart,
 * timeline entries for the "Network tab" table, and compaction markers.
 *
 * The algorithm walks through API calls chronologically. At each call:
 * 1. The previous call's assistant output (text, thinking, tool_use) is added
 *    as context (it becomes input for this call).
 * 2. User records between calls are processed (new messages, tool results).
 * 3. Compaction boundaries reset non-system categories.
 * 4. Floor categories (system, compacted_summary) stay fixed; incremental
 *    categories are scaled proportionally to fill the remainder up to the
 *    authoritative total.
 */
export function computeContextDecomposition(
	records: TranscriptRecord[],
	apiCallGroups: ApiCallGroup[],
): ContextDecomposition {
	const sortedGroups = [...apiCallGroups]
		.filter((g) => !g.isSynthetic)
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	if (sortedGroups.length === 0) {
		return { snapshots: [], timeline: [], compactions: [] };
	}

	// Build tool_use_id → tool_name map for subagent detection
	const toolNameById = new Map<string, string>();
	for (const g of sortedGroups) {
		for (const block of g.contentBlocks) {
			if (block.type === 'tool_use') {
				toolNameById.set(block.id, block.name);
			}
		}
	}

	// Filter to user + system records only (assistant records are handled via API call groups)
	const contentRecords = records
		.filter((r) => r.type === 'user' || r.type === 'system')
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	const cumRaw = zeroRaw();
	const timeline: ContextTimelineEntry[] = [];
	const snapshots: ContextSnapshot[] = [];
	const compactions: CompactionMarker[] = [];
	let contentIdx = 0;

	// System baseline from first API call's cache_creation_input_tokens
	const firstGroup = sortedGroups[0];
	const cacheCreate = firstGroup.usage.cache_creation_input_tokens ?? 0;
	cumRaw.system = cacheCreate > 0 ? cacheCreate : 500;

	timeline.push({
		timestamp: firstGroup.timestamp,
		type: 'system',
		description: '~System prompt + CLAUDE.md + tools',
		estimatedTokens: cumRaw.system,
		cumulativeTokens: 0,
		apiCallIndex: 0,
	});

	let pendingCompaction: { timestamp: string; preTokens: number } | null = null;

	for (let callIdx = 0; callIdx < sortedGroups.length; callIdx++) {
		const group = sortedGroups[callIdx];
		const groupTime = new Date(group.timestamp).getTime();
		const prevGroupTime = callIdx > 0
			? new Date(sortedGroups[callIdx - 1].timestamp).getTime()
			: -Infinity;

		// 1. Add previous call's assistant output to cumulative
		//    (the model's output from call N-1 becomes context for call N)
		if (callIdx > 0) {
			const prev = sortedGroups[callIdx - 1];
			for (const block of prev.contentBlocks) {
				if (block.type === 'text' && block.text.length > 0) {
					const est = estimateTokens(block.text);
					cumRaw.assistant_text += est;
					timeline.push({
						timestamp: prev.timestamp,
						type: 'assistant_text',
						description: truncate(block.text, 80),
						estimatedTokens: est,
						cumulativeTokens: 0,
						apiCallIndex: callIdx,
					});
				} else if (block.type === 'thinking' && block.thinking.length > 0) {
					const est = estimateTokens(block.thinking);
					cumRaw.assistant_thinking += est;
					timeline.push({
						timestamp: prev.timestamp,
						type: 'assistant_thinking',
						description: `Extended thinking (~${est} tokens)`,
						estimatedTokens: est,
						cumulativeTokens: 0,
						apiCallIndex: callIdx,
					});
				} else if (block.type === 'tool_use') {
					const inputStr = JSON.stringify(block.input);
					const est = estimateTokens(inputStr);
					cumRaw.assistant_text += est;
				}
			}
		}

		// 2. Process content records between previous and current API call
		while (contentIdx < contentRecords.length) {
			const record = contentRecords[contentIdx];
			const recordTime = new Date(record.timestamp).getTime();
			if (recordTime > groupTime) break;
			if (recordTime <= prevGroupTime) {
				contentIdx++;
				continue;
			}

			if (record.type === 'user') {
				processUserRecord(record as UserRecord, cumRaw, timeline, toolNameById, callIdx);
			} else if (record.type === 'system') {
				const sysRec = record as SystemRecord;
				if (sysRec.subtype === 'compact_boundary' && sysRec.compactMetadata) {
					pendingCompaction = {
						timestamp: sysRec.timestamp,
						preTokens: sysRec.compactMetadata.preTokens,
					};
					// Reset non-system categories — all prior content is compressed
					cumRaw.user = 0;
					cumRaw.assistant_text = 0;
					cumRaw.assistant_thinking = 0;
					cumRaw.tool_results = 0;
					cumRaw.subagent_overhead = 0;
					cumRaw.compacted_summary = 0;
				}
			}

			contentIdx++;
		}

		// 3. Resolve pending compaction
		const totalInput = (group.usage.input_tokens ?? 0) +
			(group.usage.cache_read_input_tokens ?? 0) +
			(group.usage.cache_creation_input_tokens ?? 0);

		if (pendingCompaction) {
			// Compute actual post-compaction summary size from authoritative total
			const newContent = INCREMENTAL_CATEGORIES.reduce((sum, cat) => sum + cumRaw[cat], 0);
			const actualSummaryTokens = Math.max(0, totalInput - cumRaw.system - newContent);

			if (cumRaw.compacted_summary === 0) {
				// No isCompactSummary record — emit synthetic timeline entry
				cumRaw.compacted_summary = actualSummaryTokens;
				timeline.push({
					timestamp: pendingCompaction.timestamp,
					type: 'compacted_summary',
					description: `~Compacted summary (~${actualSummaryTokens} tokens)`,
					estimatedTokens: actualSummaryTokens,
					cumulativeTokens: 0,
					apiCallIndex: callIdx,
				});
			} else {
				// isCompactSummary record exists but its text-based estimate is too low —
				// normalize to the actual post-compaction remainder
				cumRaw.compacted_summary = actualSummaryTokens;
				for (let i = timeline.length - 1; i >= 0; i--) {
					if (timeline[i].type === 'compacted_summary') {
						timeline[i].estimatedTokens = actualSummaryTokens;
						break;
					}
				}
			}

			compactions.push({
				snapshotIndex: callIdx,
				timestamp: pendingCompaction.timestamp,
				preTokens: pendingCompaction.preTokens,
				postTokens: totalInput,
				tokensFreed: pendingCompaction.preTokens - totalInput,
			});

			pendingCompaction = null;
		}

		// 4. Snapshot — floor categories fixed, incremental categories scaled
		snapshots.push({
			apiCallIndex: callIdx,
			timestamp: group.timestamp,
			totalTokens: totalInput,
			categories: scaleToAuthoritative(cumRaw, totalInput),
			isEstimated: true,
		});
	}

	// Process remaining content records after the last API call (e.g., trailing compaction)
	while (contentIdx < contentRecords.length) {
		const record = contentRecords[contentIdx];
		if (record.type === 'system') {
			const sysRec = record as SystemRecord;
			if (sysRec.subtype === 'compact_boundary' && sysRec.compactMetadata) {
				pendingCompaction = {
					timestamp: sysRec.timestamp,
					preTokens: sysRec.compactMetadata.preTokens,
				};
			}
		}
		contentIdx++;
	}

	// Flush any unresolved compaction (session ended before next API call)
	if (pendingCompaction) {
		compactions.push({
			snapshotIndex: snapshots.length - 1,
			timestamp: pendingCompaction.timestamp,
			preTokens: pendingCompaction.preTokens,
			postTokens: null,
			tokensFreed: null,
		});
	}

	// Post-pass: compute cumulative tokens on timeline entries.
	// Cumulative represents current context size — it resets at compaction.
	const systemTokens = timeline.find((e) => e.type === 'system')?.estimatedTokens ?? 0;
	let cumTokens = 0;
	for (const entry of timeline) {
		if (entry.type === 'compacted_summary') {
			// After compaction: context = system + compacted summary
			cumTokens = systemTokens + entry.estimatedTokens;
		} else {
			cumTokens += entry.estimatedTokens;
		}
		entry.cumulativeTokens = cumTokens;
	}

	return { snapshots, timeline, compactions };
}
