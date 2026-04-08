import type {
	EventLogRecord,
	PreToolUseEvent,
	PostToolUseEvent,
	PostToolUseFailureEvent,
	ToolCall,
	ApiCallGroup,
} from '$lib/types.js';
import { normalizeModel, lookupPricing } from '$lib/pricing.js';

// =============================================================================
// Pairing: PreToolUse → PostToolUse / PostToolUseFailure
// =============================================================================

/** Result of pairing tool events. */
export interface PairingResult {
	calls: ToolCall[];
	/** Number of PreToolUse events with no matching Post (interrupted/in-progress). */
	unmatchedPreCount: number;
}

/**
 * Pair PreToolUse events with the next PostToolUse or PostToolUseFailure
 * that shares the same tool_name (sequential pairing).
 *
 * PreToolUse lacks tool_use_id, so we match by tool_name order:
 * for each PreToolUse(tool_name=X), consume the next unmatched
 * Post*(tool_name=X) event chronologically.
 *
 * If multiple Pre events for the same tool are queued when a Post arrives,
 * pairing is ambiguous (e.g., concurrent subagents). The call is still
 * emitted but latency is marked null per plan spec.
 */
export function pairToolEvents(events: EventLogRecord[]): PairingResult {
	const sorted = [...events].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	const preQueue = new Map<string, PreToolUseEvent[]>();
	// Track per-tool ambiguity: once a queue grows >1, all drains from that
	// batch are ambiguous until the queue empties completely.
	const ambiguousTools = new Set<string>();
	const calls: ToolCall[] = [];

	for (const event of sorted) {
		if (event.event === 'PreToolUse') {
			const pre = event as PreToolUseEvent;
			const queue = preQueue.get(pre.tool_name) ?? [];
			queue.push(pre);
			preQueue.set(pre.tool_name, queue);
			if (queue.length > 1) {
				ambiguousTools.add(pre.tool_name);
			}
		} else if (event.event === 'PostToolUse') {
			const post = event as PostToolUseEvent;
			const queue = preQueue.get(post.tool_name);
			const ambiguous = ambiguousTools.has(post.tool_name);
			const pre = queue?.shift();
			if (queue && queue.length === 0) {
				ambiguousTools.delete(post.tool_name);
			}
			const preTime = pre ? new Date(pre.timestamp).getTime() : null;
			const postTime = new Date(post.timestamp).getTime();
			calls.push({
				toolUseId: post.tool_use_id,
				toolName: post.tool_name,
				timestamp: pre?.timestamp ?? post.timestamp,
				inputKeys: post.tool_input_keys,
				inputSize: post.tool_input_size,
				responseSize: post.tool_response_size,
				latencyMs: preTime !== null && !ambiguous ? postTime - preTime : null,
				failed: false,
			});
		} else if (event.event === 'PostToolUseFailure') {
			const post = event as PostToolUseFailureEvent;
			const queue = preQueue.get(post.tool_name);
			const ambiguous = ambiguousTools.has(post.tool_name);
			const pre = queue?.shift();
			if (queue && queue.length === 0) {
				ambiguousTools.delete(post.tool_name);
			}
			const preTime = pre ? new Date(pre.timestamp).getTime() : null;
			const postTime = new Date(post.timestamp).getTime();
			calls.push({
				toolUseId: post.tool_use_id,
				toolName: post.tool_name,
				timestamp: pre?.timestamp ?? post.timestamp,
				inputKeys: pre?.tool_input_keys ?? [],
				inputSize: 0,
				responseSize: 0,
				latencyMs: preTime !== null && !ambiguous ? postTime - preTime : null,
				failed: true,
				error: post.error,
			});
		}
	}

	// Count unmatched Pre events (interrupted/in-progress tool calls)
	let unmatchedPreCount = 0;
	for (const queue of preQueue.values()) {
		unmatchedPreCount += queue.length;
	}

	return { calls, unmatchedPreCount };
}

// =============================================================================
// Per-tool summary
// =============================================================================

/** Aggregated stats for a single tool. */
export interface ToolSummary {
	toolName: string;
	callCount: number;
	successCount: number;
	failureCount: number;
	successRate: number;
	/** Average latency in ms (successful calls only, null if none have latency). */
	avgLatencyMs: number | null;
	/** Median latency in ms (successful calls only). */
	medianLatencyMs: number | null;
	/** p95 latency in ms (successful calls only). */
	p95LatencyMs: number | null;
	totalInputSize: number;
	totalResponseSize: number;
	/** Average input size per call. */
	avgInputSize: number;
	/** Average response size per successful call. */
	avgResponseSize: number;
	/** Fraction of total session response bytes attributable to this tool. */
	responseSizeFraction: number;
	/** ~Estimated total context tokens this tool's responses added (response bytes / 4). Heuristic. */
	totalContextTokens: number;
	/** ~Estimated total cost of this tool's context contribution in USD. Null if pricing unavailable. */
	estimatedContextCost: number | null;
	/** ~Estimated cost per call in USD. Null if pricing unavailable. */
	costPerCall: number | null;
}

/** Session-level tool analysis result. */
export interface ToolAnalysis {
	calls: ToolCall[];
	summaries: ToolSummary[];
	totalCalls: number;
	totalSuccesses: number;
	totalFailures: number;
	overallSuccessRate: number;
	totalResponseBytes: number;
	/** Number of PreToolUse events with no matching Post (interrupted/in-progress). */
	unmatchedPreCount: number;
}

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = (p / 100) * (sorted.length - 1);
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sorted[lo];
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Compute per-tool summaries from paired tool calls.
 *
 * @param cacheReadRate - Cost per token for tool results in context.
 *   Tool results are typically served from cache on subsequent API calls,
 *   so cacheRead rate is the best proxy. Null if pricing is unavailable.
 */
export function summarizeTools(calls: ToolCall[], cacheReadRate: number | null): ToolSummary[] {
	const byTool = new Map<string, ToolCall[]>();
	for (const call of calls) {
		const list = byTool.get(call.toolName) ?? [];
		list.push(call);
		byTool.set(call.toolName, list);
	}

	const totalResponseBytes = calls.reduce((sum, c) => sum + c.responseSize, 0);

	const summaries: ToolSummary[] = [];
	for (const [toolName, toolCalls] of byTool) {
		const successCalls = toolCalls.filter((c) => !c.failed);
		const failureCalls = toolCalls.filter((c) => c.failed);

		const latencies = successCalls
			.map((c) => c.latencyMs)
			.filter((ms): ms is number => ms !== null)
			.sort((a, b) => a - b);

		const totalInput = toolCalls.reduce((sum, c) => sum + c.inputSize, 0);
		const totalResponse = toolCalls.reduce((sum, c) => sum + c.responseSize, 0);
		// Heuristic: ~4 chars per token (same convention as context-decomposer)
		const contextTokens = Math.ceil(totalResponse / 4);
		const contextCost = cacheReadRate !== null ? contextTokens * cacheReadRate / 1_000_000 : null;

		summaries.push({
			toolName,
			callCount: toolCalls.length,
			successCount: successCalls.length,
			failureCount: failureCalls.length,
			successRate: toolCalls.length > 0 ? successCalls.length / toolCalls.length : 0,
			avgLatencyMs: latencies.length > 0
				? latencies.reduce((a, b) => a + b, 0) / latencies.length
				: null,
			medianLatencyMs: latencies.length > 0 ? percentile(latencies, 50) : null,
			p95LatencyMs: latencies.length > 0 ? percentile(latencies, 95) : null,
			totalInputSize: totalInput,
			totalResponseSize: totalResponse,
			avgInputSize: toolCalls.length > 0 ? totalInput / toolCalls.length : 0,
			avgResponseSize: successCalls.length > 0 ? totalResponse / successCalls.length : 0,
			responseSizeFraction: totalResponseBytes > 0 ? totalResponse / totalResponseBytes : 0,
			totalContextTokens: contextTokens,
			estimatedContextCost: contextCost,
			costPerCall: contextCost !== null && toolCalls.length > 0
				? contextCost / toolCalls.length
				: null,
		});
	}

	// Sort by call count descending
	summaries.sort((a, b) => b.callCount - a.callCount);
	return summaries;
}

/**
 * Top-level entry point: pair events and compute analysis.
 *
 * @param apiCallGroups - Optional API call groups for determining the session
 *   model and looking up pricing for context cost estimation. If omitted or
 *   if pricing is unavailable, cost fields will be null.
 */
export function computeToolAnalysis(
	events: EventLogRecord[],
	apiCallGroups?: ApiCallGroup[],
): ToolAnalysis {
	const { calls, unmatchedPreCount } = pairToolEvents(events);

	// Determine cache read rate from the session's primary model
	let cacheReadRate: number | null = null;
	if (apiCallGroups && apiCallGroups.length > 0) {
		const model = normalizeModel(apiCallGroups[0].model);
		const pricing = lookupPricing(model);
		if (pricing) {
			cacheReadRate = pricing.cacheRead;
		}
	}

	const summaries = summarizeTools(calls, cacheReadRate);

	const totalCalls = calls.length;
	const totalSuccesses = calls.filter((c) => !c.failed).length;
	const totalFailures = totalCalls - totalSuccesses;

	return {
		calls,
		summaries,
		totalCalls,
		totalSuccesses,
		totalFailures,
		overallSuccessRate: totalCalls > 0 ? totalSuccesses / totalCalls : 0,
		totalResponseBytes: calls.reduce((sum, c) => sum + c.responseSize, 0),
		unmatchedPreCount,
	};
}
