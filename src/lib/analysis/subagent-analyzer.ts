import type {
	EventLogRecord,
	SubagentStartEvent,
	SubagentStopEvent,
	SubagentSummary,
	TextBlock,
} from '$lib/types.js';
import type { SubagentData } from '$lib/server/subagent-reader.js';
import { computeSessionCost } from '$lib/analysis/cost-calculator.js';

// =============================================================================
// Subagent summary computation
// =============================================================================

interface SubagentEventPair {
	start: SubagentStartEvent;
	stop: SubagentStopEvent | null;
}

/**
 * Extract SubagentStart/SubagentStop event pairs from the main event log,
 * keyed by agent_id.
 */
function extractSubagentEvents(events: EventLogRecord[]): Map<string, SubagentEventPair> {
	const pairs = new Map<string, SubagentEventPair>();

	for (const event of events) {
		if (event.event === 'SubagentStart') {
			const e = event as SubagentStartEvent;
			pairs.set(e.agent_id, { start: e, stop: null });
		} else if (event.event === 'SubagentStop') {
			const e = event as SubagentStopEvent;
			const pair = pairs.get(e.agent_id);
			if (pair) {
				pair.stop = e;
			}
		}
	}

	return pairs;
}

/**
 * Extract the last assistant text from a subagent's API call groups.
 * Uses ApiCallGroup (which consolidates streamed content) rather than raw
 * transcript records, to avoid issues with multi-record streaming.
 * Only considers the final API call group — returns null if it has no text.
 */
function extractLastAssistantMessage(apiCallGroups: SubagentData['apiCallGroups']): string | null {
	for (let i = apiCallGroups.length - 1; i >= 0; i--) {
		const group = apiCallGroups[i];
		if (group.isSynthetic) continue;
		const textBlocks = group.contentBlocks.filter(
			(b): b is TextBlock => b.type === 'text',
		);
		// Only extract from the final non-synthetic group.
		return textBlocks.length > 0 ? textBlocks.map((b) => b.text).join('\n') : null;
	}
	return null;
}

/**
 * Estimate context overhead — tokens the subagent's result adds to the main
 * session's context. Uses the last assistant message text length / 4 as a
 * heuristic (same convention as context-decomposer).
 */
function estimateContextOverhead(lastMessage: string | null): number | null {
	if (!lastMessage) return null;
	return Math.ceil(lastMessage.length / 4);
}

/**
 * Compute aggregated summaries for all subagents in a session.
 *
 * @param subagents - Parsed subagent data (transcripts, API calls, tool results)
 * @param events - Main session event log (for SubagentStart/SubagentStop timing)
 */
export function computeSubagentSummaries(
	subagents: SubagentData[],
	events: EventLogRecord[],
): SubagentSummary[] {
	if (subagents.length === 0) return [];

	const eventPairs = extractSubagentEvents(events);
	const summaries: SubagentSummary[] = [];

	for (const sub of subagents) {
		const pair = eventPairs.get(sub.agentId);

		// Timing: prefer event log timestamps, fall back to API call timestamps
		const startTime = pair?.start.timestamp
			?? sub.apiCallGroups[0]?.timestamp
			?? '';
		const endTime = pair?.stop?.timestamp
			?? sub.apiCallGroups[sub.apiCallGroups.length - 1]?.timestamp
			?? null;

		let durationMs: number | null = null;
		if (startTime && endTime) {
			durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
		}

		// Token totals from API calls
		let totalInputTokens = 0;
		let totalOutputTokens = 0;
		for (const g of sub.apiCallGroups) {
			if (g.isSynthetic) continue;
			totalInputTokens += g.usage.input_tokens ?? 0;
			totalOutputTokens += g.usage.output_tokens ?? 0;
		}

		// Cost
		const costResult = computeSessionCost(sub.apiCallGroups);
		const totalCost = costResult.totalCost;
		const costIsLowerBound = costResult.costIsLowerBound;

		// Last assistant message (from final API call group, not raw records)
		const lastAssistantMessage = extractLastAssistantMessage(sub.apiCallGroups);

		// Context overhead
		const contextOverheadTokens = estimateContextOverhead(lastAssistantMessage);

		summaries.push({
			agentId: sub.agentId,
			agentType: sub.meta.agentType,
			description: sub.meta.description,
			startTime,
			endTime,
			durationMs,
			internalToolCalls: sub.toolResults.length,
			totalInputTokens,
			totalOutputTokens,
			totalCost,
			costIsLowerBound,
			lastAssistantMessage,
			contextOverheadTokens,
		});
	}

	// Sort by start time
	summaries.sort((a, b) => {
		if (!a.startTime || !b.startTime) return 0;
		return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
	});

	return summaries;
}
