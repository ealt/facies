import type { SessionSummary } from '$lib/types.js';

// =============================================================================
// Cross-Session Aggregation
// =============================================================================

export interface AggregateMetrics {
	totalSessions: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number | null;
	costIsLowerBound: boolean;
	uniqueProjects: number;
	totalCompactions: number;
	totalToolCalls: number;
	totalSubagents: number;
	mostUsedModel: string | null;
	/** Number of sessions missing transcript data (token/cost totals are lower bounds) */
	sessionsWithoutTranscript: number;
}

export interface DailyUsage {
	date: string; // YYYY-MM-DD
	sessions: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
}

export interface ProjectBreakdown {
	project: string;
	sessions: number;
	totalTokens: number;
	totalCost: number;
}

export interface ToolBreakdown {
	tool: string;
	totalCalls: number;
	sessionCount: number;
}

export interface CompactionPoint {
	sessionId: string;
	title: string;
	durationMs: number;
	compactionCount: number;
	totalTokens: number;
}

export function computeAggregateMetrics(sessions: SessionSummary[]): AggregateMetrics {
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalCost: number | null = 0;
	let costIsLowerBound = false;
	let totalCompactions = 0;
	let totalToolCalls = 0;
	let totalSubagents = 0;
	let sessionsWithoutTranscript = 0;
	const projects = new Set<string>();
	const modelCounts = new Map<string, number>();

	for (const s of sessions) {
		if (s.hasTranscript === false) {
			sessionsWithoutTranscript++;
			costIsLowerBound = true;
		}
		totalInputTokens += s.totalInputTokens;
		totalOutputTokens += s.totalOutputTokens;
		totalCompactions += s.compactionCount;
		totalToolCalls += s.toolCallCount;
		totalSubagents += s.subagentCount;
		projects.add(s.project);

		if (s.totalCost !== null && totalCost !== null) {
			totalCost += s.totalCost;
		} else if (s.totalCost === null) {
			costIsLowerBound = true;
		}
		if (s.costIsLowerBound) costIsLowerBound = true;

		modelCounts.set(s.model, (modelCounts.get(s.model) ?? 0) + 1);
	}

	let mostUsedModel: string | null = null;
	let maxCount = 0;
	for (const [model, count] of modelCounts) {
		if (count > maxCount) {
			mostUsedModel = model;
			maxCount = count;
		}
	}

	return {
		totalSessions: sessions.length,
		totalInputTokens,
		totalOutputTokens,
		totalCost: totalCost === 0 && sessions.length > 0 && sessions.every((s) => s.totalCost === null) ? null : totalCost,
		costIsLowerBound,
		uniqueProjects: projects.size,
		totalCompactions,
		totalToolCalls,
		totalSubagents,
		mostUsedModel,
		sessionsWithoutTranscript,
	};
}

export function computeDailyUsage(sessions: SessionSummary[]): DailyUsage[] {
	const map = new Map<string, DailyUsage>();

	for (const s of sessions) {
		// Skip sessions without transcript — their token totals are not meaningful
		if (s.hasTranscript === false) continue;
		const date = s.startTime.slice(0, 10); // YYYY-MM-DD
		const existing = map.get(date);
		if (existing) {
			existing.sessions++;
			existing.inputTokens += s.totalInputTokens;
			existing.outputTokens += s.totalOutputTokens;
			existing.cost += s.totalCost ?? 0;
		} else {
			map.set(date, {
				date,
				sessions: 1,
				inputTokens: s.totalInputTokens,
				outputTokens: s.totalOutputTokens,
				cost: s.totalCost ?? 0,
			});
		}
	}

	return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function computeProjectBreakdown(sessions: SessionSummary[]): ProjectBreakdown[] {
	const map = new Map<string, ProjectBreakdown>();

	for (const s of sessions) {
		// Count all sessions per project; only include token/cost from sessions with transcripts
		const hasData = s.hasTranscript !== false;
		const existing = map.get(s.project);
		if (existing) {
			existing.sessions++;
			if (hasData) {
				existing.totalTokens += s.totalInputTokens + s.totalOutputTokens;
				existing.totalCost += s.totalCost ?? 0;
			}
		} else {
			map.set(s.project, {
				project: s.project,
				sessions: 1,
				totalTokens: hasData ? s.totalInputTokens + s.totalOutputTokens : 0,
				totalCost: s.totalCost ?? 0,
			});
		}
	}

	return [...map.values()].sort((a, b) => b.sessions - a.sessions);
}

export function computeToolBreakdown(sessions: SessionSummary[]): ToolBreakdown[] {
	const callMap = new Map<string, number>();
	const sessionMap = new Map<string, number>();

	for (const s of sessions) {
		const toolCounts = s.toolCounts ?? {};
		const seen = new Set<string>();
		for (const [tool, count] of Object.entries(toolCounts)) {
			callMap.set(tool, (callMap.get(tool) ?? 0) + count);
			if (!seen.has(tool)) {
				sessionMap.set(tool, (sessionMap.get(tool) ?? 0) + 1);
				seen.add(tool);
			}
		}
	}

	const result: ToolBreakdown[] = [];
	for (const [tool, totalCalls] of callMap) {
		result.push({
			tool,
			totalCalls,
			sessionCount: sessionMap.get(tool) ?? 0,
		});
	}
	return result.sort((a, b) => b.totalCalls - a.totalCalls);
}

export function computeCompactionPoints(sessions: SessionSummary[]): CompactionPoint[] {
	return sessions
		.filter((s) => (s.compactionCount > 0 || s.durationMs > 0) && s.hasTranscript !== false)
		.map((s) => ({
			sessionId: s.sessionId,
			title: s.title ?? s.sessionId,
			durationMs: s.durationMs,
			compactionCount: s.compactionCount,
			totalTokens: s.totalInputTokens + s.totalOutputTokens,
		}));
}

/** Collect all compaction preTokens values across sessions for histogram display. */
export function collectCompactionThresholds(sessions: SessionSummary[]): number[] {
	const thresholds: number[] = [];
	for (const s of sessions) {
		if (s.compactionPreTokens) {
			thresholds.push(...s.compactionPreTokens);
		}
	}
	return thresholds.sort((a, b) => a - b);
}
