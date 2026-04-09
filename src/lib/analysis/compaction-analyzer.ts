import type {
	TranscriptRecord,
	ApiCallGroup,
	EventLogRecord,
	SystemRecord,
	CompactionEvent,
} from '$lib/types.js';
import { computeApiCallCost } from './cost-calculator.js';

/** Aggregate compaction metrics for the session. */
export interface CompactionAnalysis {
	compactions: CompactionEvent[];
	/** Context size at each API call — for the sparkline timeline. */
	contextSizePoints: Array<{ timestamp: string; totalTokens: number }>;
	/** Session start time (for chart domain). */
	sessionStartTime: string;
	/** Session end time (for chart domain). */
	sessionEndTime: string;
	/** Average pre-compaction context size (null if no compactions). */
	avgPreTokens: number | null;
	/** Average post-compaction context size (null if no compactions or all unresolved). */
	avgPostTokens: number | null;
	/** Average tokens freed per compaction (null if none resolved). */
	avgTokensFreed: number | null;
	/** Average recovery turns across compactions (null if none tracked). */
	avgRecoveryTurns: number | null;
}

/** Compute cache hit rate for a single API call group. */
function cacheRate(group: ApiCallGroup): number {
	const input = group.usage.input_tokens ?? 0;
	const cacheRead = group.usage.cache_read_input_tokens ?? 0;
	const cacheCreate = group.usage.cache_creation_input_tokens ?? 0;
	const total = input + cacheRead + cacheCreate;
	return total > 0 ? cacheRead / total : 0;
}

/** Total input tokens for an API call (input + cache_read + cache_create). */
function totalInput(group: ApiCallGroup): number {
	return (group.usage.input_tokens ?? 0) +
		(group.usage.cache_read_input_tokens ?? 0) +
		(group.usage.cache_creation_input_tokens ?? 0);
}

/**
 * Validate that a compact_boundary record has the expected fields.
 * Tolerates schema drift by skipping records with missing/invalid data.
 */
function isValidCompactBoundary(rec: SystemRecord): boolean {
	return rec.compactMetadata != null &&
		typeof rec.compactMetadata.preTokens === 'number' &&
		typeof rec.compactMetadata.trigger === 'string';
}

/**
 * Compute compaction analysis from transcript records, API call groups, and event log.
 *
 * Uses compact_boundary system records (authoritative preTokens), then correlates
 * with surrounding API calls for post-compaction size, cache rates, and recovery.
 */
export function computeCompactionAnalysis(
	records: TranscriptRecord[],
	apiCallGroups: ApiCallGroup[],
	events: EventLogRecord[],
): CompactionAnalysis {
	// Sort API call groups chronologically, skip synthetic
	const sortedGroups = [...apiCallGroups]
		.filter((g) => !g.isSynthetic)
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	// Build context size points for sparkline
	const contextSizePoints = sortedGroups.map((g) => ({
		timestamp: g.timestamp,
		totalTokens: totalInput(g),
	}));

	// Session start/end for chart domain
	const sessionStartEvent = events.find((e) => e.event === 'SessionStart');
	const sessionEndEvent = [...events].reverse().find(
		(e) => e.event === 'SessionEnd' || e.event === 'Stop',
	);
	const sessionStartTime = sessionStartEvent?.timestamp
		?? sortedGroups[0]?.timestamp
		?? '';
	// For interrupted sessions (no SessionEnd/Stop), use the last event timestamp
	// before falling back to the last API call — events may extend beyond the
	// last API call (e.g., SubagentStop, PostToolUse).
	const lastEventTimestamp = events.length > 0
		? events.reduce((latest, e) =>
			new Date(e.timestamp).getTime() > new Date(latest).getTime() ? e.timestamp : latest,
			events[0].timestamp)
		: undefined;
	const sessionEndTime = sessionEndEvent?.timestamp
		?? lastEventTimestamp
		?? sortedGroups[sortedGroups.length - 1]?.timestamp
		?? sessionStartTime;

	// Find valid compact_boundary system records
	const compactBoundaries = records
		.filter((r): r is SystemRecord =>
			r.type === 'system' &&
			r.subtype === 'compact_boundary' &&
			isValidCompactBoundary(r as SystemRecord),
		)
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	if (compactBoundaries.length === 0) {
		return {
			compactions: [],
			contextSizePoints,
			sessionStartTime,
			sessionEndTime,
			avgPreTokens: null,
			avgPostTokens: null,
			avgTokensFreed: null,
			avgRecoveryTurns: null,
		};
	}

	// Count user prompt submit events for turnsBefore calculation
	const userPrompts = events
		.filter((e) => e.event === 'UserPromptSubmit')
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	const sessionStartMs = new Date(sessionStartTime).getTime();
	const compactions: CompactionEvent[] = [];

	for (let i = 0; i < compactBoundaries.length; i++) {
		const boundary = compactBoundaries[i];
		const boundaryTime = new Date(boundary.timestamp).getTime();
		const preTokens = boundary.compactMetadata!.preTokens;
		const trigger = boundary.compactMetadata!.trigger;

		// Find the API call immediately before compaction (last one with timestamp <= boundary)
		let preCallIdx = -1;
		for (let j = sortedGroups.length - 1; j >= 0; j--) {
			if (new Date(sortedGroups[j].timestamp).getTime() <= boundaryTime) {
				preCallIdx = j;
				break;
			}
		}

		// Find the first API call after compaction
		let postCallIdx = -1;
		for (let j = 0; j < sortedGroups.length; j++) {
			if (new Date(sortedGroups[j].timestamp).getTime() > boundaryTime) {
				postCallIdx = j;
				break;
			}
		}

		// Post-compaction tokens (inferred from first post-compaction API call)
		const postTokens = postCallIdx >= 0 ? totalInput(sortedGroups[postCallIdx]) : null;
		const tokensFreed = postTokens !== null ? preTokens - postTokens : null;

		// Cache rate before (from last pre-compaction API call)
		const cacheRateBefore = preCallIdx >= 0 ? cacheRate(sortedGroups[preCallIdx]) : null;

		// Cache rate after (from first post-compaction API call)
		const cacheRateAfter = postCallIdx >= 0 ? cacheRate(sortedGroups[postCallIdx]) : null;

		// Turns before compaction: count UserPromptSubmit events in this segment
		const prevBoundaryTime = i > 0
			? new Date(compactBoundaries[i - 1].timestamp).getTime()
			: sessionStartMs;
		const turnsBefore = userPrompts.filter((e) => {
			const t = new Date(e.timestamp).getTime();
			return t > prevBoundaryTime && t <= boundaryTime;
		}).length;

		// Recovery turns: count turns after compaction until cache rate > 80%
		let recoveryTurns: number | null = null;
		if (postCallIdx >= 0) {
			const nextBoundaryTime = i < compactBoundaries.length - 1
				? new Date(compactBoundaries[i + 1].timestamp).getTime()
				: Infinity;

			const postPrompts = userPrompts.filter((e) => {
				const t = new Date(e.timestamp).getTime();
				return t > boundaryTime && t < nextBoundaryTime;
			});

			let turnCount = 0;
			let promptIdx = 0;
			let recovered = false;

			for (let j = postCallIdx; j < sortedGroups.length; j++) {
				const gTime = new Date(sortedGroups[j].timestamp).getTime();
				if (gTime >= nextBoundaryTime) break;

				while (promptIdx < postPrompts.length &&
					new Date(postPrompts[promptIdx].timestamp).getTime() <= gTime) {
					promptIdx++;
					turnCount++;
				}

				if (cacheRate(sortedGroups[j]) > 0.8) {
					recoveryTurns = turnCount;
					recovered = true;
					break;
				}
			}

			if (!recovered) {
				recoveryTurns = null;
			}
		}

		// Elapsed time from session start
		const elapsedMs = sessionStartTime
			? boundaryTime - sessionStartMs
			: null;

		// Per-compaction cost: first post-compaction API call cost
		let firstPostCompactionCost: number | null = null;
		if (postCallIdx >= 0) {
			const costResult = computeApiCallCost(sortedGroups[postCallIdx]);
			firstPostCompactionCost = costResult.cost;
		}

		// Per-compaction cost: average of pre-compaction API calls in this segment
		let avgPreCompactionCost: number | null = null;
		const prevTime = i > 0
			? new Date(compactBoundaries[i - 1].timestamp).getTime()
			: 0;
		const preCalls = sortedGroups.filter((g) => {
			const t = new Date(g.timestamp).getTime();
			return t > prevTime && t <= boundaryTime;
		});
		if (preCalls.length > 0) {
			let total = 0;
			let count = 0;
			for (const call of preCalls) {
				const costResult = computeApiCallCost(call);
				if (costResult.cost !== null) {
					total += costResult.cost;
					count++;
				}
			}
			if (count > 0) avgPreCompactionCost = total / count;
		}

		compactions.push({
			timestamp: boundary.timestamp,
			trigger,
			preTokens,
			postTokens,
			tokensFreed,
			turnsBefore,
			cacheRateBefore,
			cacheRateAfter,
			recoveryTurns,
			elapsedMs,
			firstPostCompactionCost,
			avgPreCompactionCost,
		});
	}

	// Aggregate metrics
	const resolvedCompactions = compactions.filter((c) => c.postTokens !== null);

	return {
		compactions,
		contextSizePoints,
		sessionStartTime,
		sessionEndTime,
		avgPreTokens: compactions.length > 0
			? compactions.reduce((sum, c) => sum + c.preTokens, 0) / compactions.length
			: null,
		avgPostTokens: resolvedCompactions.length > 0
			? resolvedCompactions.reduce((sum, c) => sum + c.postTokens!, 0) / resolvedCompactions.length
			: null,
		avgTokensFreed: resolvedCompactions.length > 0
			? resolvedCompactions.reduce((sum, c) => sum + c.tokensFreed!, 0) / resolvedCompactions.length
			: null,
		avgRecoveryTurns: (() => {
			const withRecovery = compactions.filter((c) => c.recoveryTurns !== null);
			return withRecovery.length > 0
				? withRecovery.reduce((sum, c) => sum + c.recoveryTurns!, 0) / withRecovery.length
				: null;
		})(),
	};
}
