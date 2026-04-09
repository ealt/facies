import { describe, it, expect } from 'vitest';
import type { SessionSummary } from '$lib/types.js';
import {
	computeAggregateMetrics,
	computeDailyUsage,
	computeProjectBreakdown,
	computeToolBreakdown,
	computeCompactionPoints,
	collectCompactionThresholds,
} from '$lib/analysis/session-aggregator.js';

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
	return {
		sessionId: 'test-session-1',
		project: 'test-project',
		title: 'Test Session',
		model: 'claude-opus-4-6',
		startTime: '2026-04-01T10:00:00Z',
		endTime: '2026-04-01T10:30:00Z',
		durationMs: 1_800_000,
		turns: 5,
		totalInputTokens: 50_000,
		totalOutputTokens: 5_000,
		totalCost: 1.5,
		costIsLowerBound: false,
		compactionCount: 1,
		toolCallCount: 10,
		toolCounts: { Read: 5, Bash: 3, Write: 2 },
		subagentCount: 0,
		compactionPreTokens: [180_000],
		hasTranscript: true,
		skippedLines: 0,
		eventLogPath: '/logs/test.jsonl',
		eventLogMtime: 1000,
		transcriptPath: '/projects/test/test.jsonl',
		transcriptMtime: 1000,
		subagentMtimes: {},
		...overrides,
	};
}

describe('computeAggregateMetrics', () => {
	it('returns zeros for empty input', () => {
		const m = computeAggregateMetrics([]);
		expect(m.totalSessions).toBe(0);
		expect(m.totalInputTokens).toBe(0);
		expect(m.totalOutputTokens).toBe(0);
		expect(m.totalCost).toBe(0);
		expect(m.uniqueProjects).toBe(0);
		expect(m.mostUsedModel).toBeNull();
	});

	it('aggregates multiple sessions', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', totalInputTokens: 100, totalOutputTokens: 50, totalCost: 1.0 }),
			makeSummary({ sessionId: 's2', totalInputTokens: 200, totalOutputTokens: 100, totalCost: 2.0 }),
		];
		const m = computeAggregateMetrics(sessions);
		expect(m.totalSessions).toBe(2);
		expect(m.totalInputTokens).toBe(300);
		expect(m.totalOutputTokens).toBe(150);
		expect(m.totalCost).toBe(3.0);
		expect(m.uniqueProjects).toBe(1);
	});

	it('counts unique projects', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', project: 'alpha' }),
			makeSummary({ sessionId: 's2', project: 'beta' }),
			makeSummary({ sessionId: 's3', project: 'alpha' }),
		];
		const m = computeAggregateMetrics(sessions);
		expect(m.uniqueProjects).toBe(2);
	});

	it('finds the most used model', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', model: 'opus' }),
			makeSummary({ sessionId: 's2', model: 'haiku' }),
			makeSummary({ sessionId: 's3', model: 'opus' }),
		];
		const m = computeAggregateMetrics(sessions);
		expect(m.mostUsedModel).toBe('opus');
	});

	it('handles null cost as lower bound', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', totalCost: 1.0 }),
			makeSummary({ sessionId: 's2', totalCost: null }),
		];
		const m = computeAggregateMetrics(sessions);
		expect(m.costIsLowerBound).toBe(true);
	});

	it('returns null cost when all sessions have null cost', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', totalCost: null }),
			makeSummary({ sessionId: 's2', totalCost: null }),
		];
		const m = computeAggregateMetrics(sessions);
		expect(m.totalCost).toBeNull();
	});

	it('counts sessions without transcript and flags as lower bound', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', totalCost: 1.0, hasTranscript: true }),
			makeSummary({ sessionId: 's2', totalCost: null, hasTranscript: false }),
		];
		const m = computeAggregateMetrics(sessions);
		expect(m.sessionsWithoutTranscript).toBe(1);
		expect(m.costIsLowerBound).toBe(true);
	});

	it('sums compactions, tool calls, and subagents', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', compactionCount: 2, toolCallCount: 15, subagentCount: 1 }),
			makeSummary({ sessionId: 's2', compactionCount: 3, toolCallCount: 20, subagentCount: 2 }),
		];
		const m = computeAggregateMetrics(sessions);
		expect(m.totalCompactions).toBe(5);
		expect(m.totalToolCalls).toBe(35);
		expect(m.totalSubagents).toBe(3);
	});
});

describe('computeDailyUsage', () => {
	it('groups sessions by date', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', startTime: '2026-04-01T10:00:00Z', totalInputTokens: 100, totalOutputTokens: 10, totalCost: 1.0 }),
			makeSummary({ sessionId: 's2', startTime: '2026-04-01T14:00:00Z', totalInputTokens: 200, totalOutputTokens: 20, totalCost: 2.0 }),
			makeSummary({ sessionId: 's3', startTime: '2026-04-02T10:00:00Z', totalInputTokens: 300, totalOutputTokens: 30, totalCost: 3.0 }),
		];
		const daily = computeDailyUsage(sessions);
		expect(daily).toHaveLength(2);
		expect(daily[0].date).toBe('2026-04-01');
		expect(daily[0].sessions).toBe(2);
		expect(daily[0].inputTokens).toBe(300);
		expect(daily[1].date).toBe('2026-04-02');
		expect(daily[1].sessions).toBe(1);
	});

	it('returns sorted by date ascending', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', startTime: '2026-04-03T10:00:00Z' }),
			makeSummary({ sessionId: 's2', startTime: '2026-04-01T10:00:00Z' }),
		];
		const daily = computeDailyUsage(sessions);
		expect(daily[0].date).toBe('2026-04-01');
		expect(daily[1].date).toBe('2026-04-03');
	});

	it('returns empty for no sessions', () => {
		expect(computeDailyUsage([])).toHaveLength(0);
	});

	it('excludes sessions without transcript from token totals', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', startTime: '2026-04-01T10:00:00Z', totalInputTokens: 100, totalOutputTokens: 10, hasTranscript: true }),
			makeSummary({ sessionId: 's2', startTime: '2026-04-01T14:00:00Z', totalInputTokens: 0, totalOutputTokens: 0, hasTranscript: false }),
		];
		const daily = computeDailyUsage(sessions);
		expect(daily).toHaveLength(1);
		expect(daily[0].sessions).toBe(1); // only the session with transcript
		expect(daily[0].inputTokens).toBe(100);
	});
});

describe('computeProjectBreakdown', () => {
	it('groups by project and sorts by session count descending', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', project: 'alpha', totalInputTokens: 100, totalOutputTokens: 10, totalCost: 1.0 }),
			makeSummary({ sessionId: 's2', project: 'beta', totalInputTokens: 200, totalOutputTokens: 20, totalCost: 2.0 }),
			makeSummary({ sessionId: 's3', project: 'alpha', totalInputTokens: 300, totalOutputTokens: 30, totalCost: 3.0 }),
		];
		const breakdown = computeProjectBreakdown(sessions);
		expect(breakdown).toHaveLength(2);
		expect(breakdown[0].project).toBe('alpha');
		expect(breakdown[0].sessions).toBe(2);
		expect(breakdown[0].totalTokens).toBe(440);
		expect(breakdown[0].totalCost).toBe(4.0);
		expect(breakdown[1].project).toBe('beta');
		expect(breakdown[1].sessions).toBe(1);
	});
});

describe('computeToolBreakdown', () => {
	it('aggregates tool counts across sessions', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', toolCounts: { Read: 5, Bash: 3 } }),
			makeSummary({ sessionId: 's2', toolCounts: { Read: 10, Write: 2 } }),
		];
		const breakdown = computeToolBreakdown(sessions);
		expect(breakdown[0].tool).toBe('Read');
		expect(breakdown[0].totalCalls).toBe(15);
		expect(breakdown[0].sessionCount).toBe(2);
		expect(breakdown.find((t) => t.tool === 'Bash')?.totalCalls).toBe(3);
		expect(breakdown.find((t) => t.tool === 'Bash')?.sessionCount).toBe(1);
	});

	it('handles missing toolCounts gracefully', () => {
		const session = makeSummary({ toolCounts: undefined as unknown as Record<string, number> });
		const breakdown = computeToolBreakdown([session]);
		expect(breakdown).toHaveLength(0);
	});

	it('returns sorted by total calls descending', () => {
		const sessions = [
			makeSummary({ toolCounts: { A: 1, B: 100, C: 50 } }),
		];
		const breakdown = computeToolBreakdown(sessions);
		expect(breakdown[0].tool).toBe('B');
		expect(breakdown[1].tool).toBe('C');
		expect(breakdown[2].tool).toBe('A');
	});
});

describe('computeCompactionPoints', () => {
	it('returns sessions with compactions or duration', () => {
		const sessions = [
			makeSummary({ sessionId: 's1', durationMs: 1000, compactionCount: 2 }),
			makeSummary({ sessionId: 's2', durationMs: 0, compactionCount: 0 }),
			makeSummary({ sessionId: 's3', durationMs: 5000, compactionCount: 0 }),
		];
		const points = computeCompactionPoints(sessions);
		expect(points).toHaveLength(2);
		expect(points[0].sessionId).toBe('s1');
		expect(points[1].sessionId).toBe('s3');
	});
});

describe('collectCompactionThresholds', () => {
	it('collects and sorts all preTokens values', () => {
		const sessions = [
			makeSummary({ compactionPreTokens: [180_000, 160_000] }),
			makeSummary({ compactionPreTokens: [190_000] }),
		];
		const thresholds = collectCompactionThresholds(sessions);
		expect(thresholds).toEqual([160_000, 180_000, 190_000]);
	});

	it('handles missing compactionPreTokens', () => {
		const session = makeSummary({ compactionPreTokens: undefined as unknown as number[] });
		const thresholds = collectCompactionThresholds([session]);
		expect(thresholds).toHaveLength(0);
	});

	it('returns empty for no sessions', () => {
		expect(collectCompactionThresholds([])).toHaveLength(0);
	});
});
