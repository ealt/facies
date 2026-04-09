import { describe, it, expect } from 'vitest';
import type { SessionSummary } from '$lib/types.js';
import { parseQuery } from '$lib/query/parser.js';

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

describe('parseQuery', () => {
	describe('empty input', () => {
		it('returns a predicate that matches everything', () => {
			const result = parseQuery('');
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.predicate(makeSummary())).toBe(true);
			}
		});

		it('handles whitespace-only input', () => {
			const result = parseQuery('   ');
			expect(result.ok).toBe(true);
		});
	});

	describe('numeric comparisons', () => {
		it('filters by total_tokens >', () => {
			const result = parseQuery('total_tokens > 100000');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ totalInputTokens: 50_000, totalOutputTokens: 60_000 }))).toBe(true);
			expect(result.predicate(makeSummary({ totalInputTokens: 50_000, totalOutputTokens: 40_000 }))).toBe(false);
		});

		it('supports K shorthand', () => {
			const result = parseQuery('total_tokens > 100K');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ totalInputTokens: 50_000, totalOutputTokens: 60_000 }))).toBe(true);
			expect(result.predicate(makeSummary({ totalInputTokens: 10_000, totalOutputTokens: 5_000 }))).toBe(false);
		});

		it('supports M shorthand', () => {
			const result = parseQuery('total_tokens > 1M');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ totalInputTokens: 600_000, totalOutputTokens: 500_000 }))).toBe(true);
			expect(result.predicate(makeSummary({ totalInputTokens: 50_000, totalOutputTokens: 5_000 }))).toBe(false);
		});

		it('supports = operator', () => {
			const result = parseQuery('turns = 5');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ turns: 5 }))).toBe(true);
			expect(result.predicate(makeSummary({ turns: 3 }))).toBe(false);
		});

		it('supports != operator', () => {
			const result = parseQuery('compactions != 0');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ compactionCount: 2 }))).toBe(true);
			expect(result.predicate(makeSummary({ compactionCount: 0 }))).toBe(false);
		});

		it('supports duration with time units', () => {
			const result = parseQuery('duration > 5m');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ durationMs: 600_000 }))).toBe(true);
			expect(result.predicate(makeSummary({ durationMs: 60_000 }))).toBe(false);
		});

		it('supports duration with hour units', () => {
			const result = parseQuery('duration > 1h');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ durationMs: 7_200_000 }))).toBe(true);
			expect(result.predicate(makeSummary({ durationMs: 1_800_000 }))).toBe(false);
		});
	});

	describe('string comparisons', () => {
		it('filters by project =', () => {
			const result = parseQuery('project = "my-app"');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ project: 'my-app' }))).toBe(true);
			expect(result.predicate(makeSummary({ project: 'other' }))).toBe(false);
		});

		it('string comparisons are case-insensitive', () => {
			const result = parseQuery('project = "My-App"');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ project: 'my-app' }))).toBe(true);
		});

		it('CONTAINS operator', () => {
			const result = parseQuery('model CONTAINS "opus"');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ model: 'claude-opus-4-6' }))).toBe(true);
			expect(result.predicate(makeSummary({ model: 'claude-sonnet-4-6' }))).toBe(false);
		});
	});

	describe('null semantics', () => {
		it('cost > 0 excludes null cost', () => {
			const result = parseQuery('cost > 0');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ totalCost: 1.5 }))).toBe(true);
			expect(result.predicate(makeSummary({ totalCost: null }))).toBe(false);
		});

		it('cost = null matches null cost', () => {
			const result = parseQuery('cost = null');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ totalCost: null }))).toBe(true);
			expect(result.predicate(makeSummary({ totalCost: 1.5 }))).toBe(false);
		});

		it('cost != null matches non-null cost', () => {
			const result = parseQuery('cost != null');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ totalCost: 1.5 }))).toBe(true);
			expect(result.predicate(makeSummary({ totalCost: null }))).toBe(false);
		});
	});

	describe('combinators', () => {
		it('AND combines conditions', () => {
			const result = parseQuery('turns > 3 AND cost > 1');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ turns: 5, totalCost: 1.5 }))).toBe(true);
			expect(result.predicate(makeSummary({ turns: 5, totalCost: 0.5 }))).toBe(false);
			expect(result.predicate(makeSummary({ turns: 1, totalCost: 1.5 }))).toBe(false);
		});

		it('OR combines conditions', () => {
			const result = parseQuery('turns > 10 OR cost > 1');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ turns: 15, totalCost: 0.5 }))).toBe(true);
			expect(result.predicate(makeSummary({ turns: 2, totalCost: 1.5 }))).toBe(true);
			expect(result.predicate(makeSummary({ turns: 2, totalCost: 0.5 }))).toBe(false);
		});

		it('AND has higher precedence than OR', () => {
			// "a OR b AND c" means "a OR (b AND c)"
			const result = parseQuery('turns > 10 OR cost > 1 AND compactions > 0');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			// turns > 10 → true regardless
			expect(result.predicate(makeSummary({ turns: 15, totalCost: 0, compactionCount: 0 }))).toBe(true);
			// cost > 1 AND compactions > 0 → true
			expect(result.predicate(makeSummary({ turns: 1, totalCost: 2, compactionCount: 1 }))).toBe(true);
			// cost > 1 but compactions = 0 → false (AND fails), turns <= 10 → false
			expect(result.predicate(makeSummary({ turns: 1, totalCost: 2, compactionCount: 0 }))).toBe(false);
		});
	});

	describe('parentheses', () => {
		it('overrides precedence', () => {
			const result = parseQuery('(turns > 10 OR cost > 1) AND compactions > 0');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			// turns > 10 but compactions = 0 → false
			expect(result.predicate(makeSummary({ turns: 15, totalCost: 0, compactionCount: 0 }))).toBe(false);
			// turns > 10 and compactions > 0 → true
			expect(result.predicate(makeSummary({ turns: 15, totalCost: 0, compactionCount: 1 }))).toBe(true);
		});
	});

	describe('date filtering', () => {
		it('filters by started with ISO date', () => {
			const result = parseQuery('started > "2026-03-15"');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.predicate(makeSummary({ startTime: '2026-04-01T10:00:00Z' }))).toBe(true);
			expect(result.predicate(makeSummary({ startTime: '2026-03-01T10:00:00Z' }))).toBe(false);
		});

		it('filters by started with relative date', () => {
			const result = parseQuery('started > 7d');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			const recent = new Date();
			recent.setDate(recent.getDate() - 1);
			expect(result.predicate(makeSummary({ startTime: recent.toISOString() }))).toBe(true);
			const old = new Date();
			old.setDate(old.getDate() - 30);
			expect(result.predicate(makeSummary({ startTime: old.toISOString() }))).toBe(false);
		});
	});

	describe('parse errors', () => {
		it('reports unknown field', () => {
			const result = parseQuery('unknown_field > 5');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('Unknown field');
			expect(result.offset).toBe(0);
		});

		it('reports missing operator', () => {
			const result = parseQuery('turns');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('operator');
		});

		it('reports unterminated string', () => {
			const result = parseQuery('project = "unclosed');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('Unterminated string');
		});

		it('reports invalid number', () => {
			const result = parseQuery('turns > abc');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('Invalid number');
		});

		it('reports CONTAINS on non-string field', () => {
			const result = parseQuery('turns CONTAINS 5');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('CONTAINS only works with string fields');
		});

		it('reports invalid null usage', () => {
			const result = parseQuery('cost > null');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('Only = and != can be used with null');
		});
	});
});
