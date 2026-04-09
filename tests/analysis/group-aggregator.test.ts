import { describe, it, expect } from 'vitest';
import type { SessionSummary } from '$lib/types.js';
import {
	aggregateSessions,
	groupSessions,
	ALL_COLUMNS,
	getColumn,
	type ColumnDef,
} from '$lib/analysis/group-aggregator.js';

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
		eventLogPath: '/tmp/events.jsonl',
		eventLogMtime: 0,
		transcriptPath: '/tmp/transcript.jsonl',
		transcriptMtime: 0,
		subagentMtimes: {},
		...overrides,
	};
}

function cols(...keys: string[]): ColumnDef[] {
	return keys.map((k) => getColumn(k)!).filter(Boolean);
}

describe('aggregateSessions', () => {
	it('returns dashes for empty session list', () => {
		const result = aggregateSessions([], cols('title', 'total_tokens'));
		expect(result).toHaveLength(2);
		expect(result[0].display).toBe('—');
		expect(result[1].display).toBe('—');
	});

	it('counts sessions for title column', () => {
		const sessions = [makeSummary(), makeSummary({ sessionId: 's2' })];
		const result = aggregateSessions(sessions, cols('title'));
		expect(result[0].display).toBe('2 sessions');
		expect(result[0].raw).toBe(2);
	});

	it('sums numeric columns', () => {
		const sessions = [
			makeSummary({ totalInputTokens: 100, totalOutputTokens: 50 }),
			makeSummary({ totalInputTokens: 200, totalOutputTokens: 100 }),
		];
		const result = aggregateSessions(sessions, cols('total_tokens'));
		expect(result[0].raw).toBe(450);
	});

	it('uses max for started column', () => {
		const sessions = [
			makeSummary({ startTime: '2026-04-01T10:00:00Z' }),
			makeSummary({ startTime: '2026-04-05T10:00:00Z' }),
		];
		const result = aggregateSessions(sessions, cols('started'));
		expect(result[0].display).toBe('2026-04-05T10:00:00Z');
	});

	it('shows single project name when all same', () => {
		const sessions = [
			makeSummary({ project: 'my-app' }),
			makeSummary({ project: 'my-app' }),
		];
		const result = aggregateSessions(sessions, cols('project'));
		expect(result[0].display).toBe('my-app');
	});

	it('shows count when multiple projects', () => {
		const sessions = [
			makeSummary({ project: 'app-a' }),
			makeSummary({ project: 'app-b' }),
		];
		const result = aggregateSessions(sessions, cols('project'));
		expect(result[0].display).toBe('2 projects');
	});

	it('shows single model when all same', () => {
		const sessions = [
			makeSummary({ model: 'claude-opus-4-6' }),
			makeSummary({ model: 'claude-opus-4-6' }),
		];
		const result = aggregateSessions(sessions, cols('model'));
		expect(result[0].display).toBe('claude-opus-4-6');
	});

	it('shows count when multiple models', () => {
		const sessions = [
			makeSummary({ model: 'claude-opus-4-6' }),
			makeSummary({ model: 'claude-sonnet-4-6' }),
		];
		const result = aggregateSessions(sessions, cols('model'));
		expect(result[0].display).toBe('2 models');
	});

	describe('cost aggregation', () => {
		it('sums costs', () => {
			const sessions = [
				makeSummary({ totalCost: 1.5 }),
				makeSummary({ totalCost: 2.5 }),
			];
			const result = aggregateSessions(sessions, cols('cost'));
			expect(result[0].raw).toBe(4);
			expect(result[0].display).toBe('$4.00');
		});

		it('propagates lower bound indicator', () => {
			const sessions = [
				makeSummary({ totalCost: 1.5, costIsLowerBound: true }),
				makeSummary({ totalCost: 2.5 }),
			];
			const result = aggregateSessions(sessions, cols('cost'));
			expect(result[0].display).toContain('+');
		});

		it('handles null cost sessions', () => {
			const sessions = [
				makeSummary({ totalCost: null }),
				makeSummary({ totalCost: 1.5 }),
			];
			const result = aggregateSessions(sessions, cols('cost'));
			expect(result[0].raw).toBe(1.5);
			expect(result[0].display).toContain('+'); // lower bound due to null
		});

		it('shows N/A when all costs are null', () => {
			const sessions = [
				makeSummary({ totalCost: null }),
				makeSummary({ totalCost: null }),
			];
			const result = aggregateSessions(sessions, cols('cost'));
			expect(result[0].display).toBe('N/A');
		});
	});
});

describe('groupSessions', () => {
	it('groups by project', () => {
		const sessions = [
			makeSummary({ project: 'app-a', totalInputTokens: 100, totalOutputTokens: 50 }),
			makeSummary({ project: 'app-b', totalInputTokens: 200, totalOutputTokens: 100 }),
			makeSummary({ project: 'app-a', totalInputTokens: 300, totalOutputTokens: 150 }),
		];
		const groups = groupSessions(sessions, 'project', cols('title', 'total_tokens'));
		expect(groups).toHaveLength(2);
		const appA = groups.find((g) => g.key === 'app-a');
		expect(appA).toBeDefined();
		expect(appA!.sessions).toHaveLength(2);
	});

	it('groups by model', () => {
		const sessions = [
			makeSummary({ model: 'opus' }),
			makeSummary({ model: 'sonnet' }),
			makeSummary({ model: 'opus' }),
		];
		const groups = groupSessions(sessions, 'model', cols('title'));
		expect(groups).toHaveLength(2);
	});

	it('returns empty for unknown groupBy key', () => {
		const groups = groupSessions([makeSummary()], 'nonexistent', cols('title'));
		expect(groups).toHaveLength(0);
	});

	it('computes aggregates per group', () => {
		const sessions = [
			makeSummary({ project: 'app-a', turns: 5 }),
			makeSummary({ project: 'app-a', turns: 10 }),
		];
		const groups = groupSessions(sessions, 'project', cols('turns'));
		expect(groups[0].aggregates[0].raw).toBe(15);
	});
});
