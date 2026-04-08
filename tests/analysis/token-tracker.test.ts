import { describe, it, expect } from 'vitest';
import { computeTokenEconomics } from '$lib/analysis/token-tracker.js';
import type { ApiCallGroup, Usage } from '$lib/types.js';

function makeGroup(model: string, usage: Usage, timestamp = '2026-04-03T17:44:34Z'): ApiCallGroup {
	return {
		messageId: 'msg-1',
		requestId: 'req-1',
		model,
		timestamp,
		usage,
		contentBlocks: [],
		stopReason: 'end_turn',
		isSynthetic: false,
	};
}

describe('computeTokenEconomics', () => {
	it('computes cumulative totals across API calls', () => {
		const groups = [
			makeGroup('claude-opus-4-6', {
				input_tokens: 1000, output_tokens: 200,
				cache_read_input_tokens: 5000, cache_creation_input_tokens: 500,
			}, '2026-04-03T17:44:34Z'),
			makeGroup('claude-opus-4-6', {
				input_tokens: 500, output_tokens: 300,
				cache_read_input_tokens: 6000, cache_creation_input_tokens: 0,
			}, '2026-04-03T17:45:00Z'),
		];

		const result = computeTokenEconomics(groups, 2);

		expect(result.snapshots).toHaveLength(2);
		expect(result.totalInputTokens).toBe(1500);
		expect(result.totalOutputTokens).toBe(500);
		expect(result.totalCacheReadTokens).toBe(11000);
		expect(result.totalCacheCreateTokens).toBe(500);

		// Cumulative values on second snapshot
		const s2 = result.snapshots[1];
		expect(s2.cumulativeInputTokens).toBe(1500);
		expect(s2.cumulativeOutputTokens).toBe(500);
		expect(s2.cumulativeCacheReadTokens).toBe(11000);
	});

	it('computes overall cache hit rate', () => {
		const groups = [
			makeGroup('claude-opus-4-6', {
				input_tokens: 100, output_tokens: 50,
				cache_read_input_tokens: 900, cache_creation_input_tokens: 0,
			}),
		];

		const result = computeTokenEconomics(groups, 1);
		// cache rate = 900 / (100 + 900 + 0) = 0.9
		expect(result.overallCacheRate).toBeCloseTo(0.9, 6);
	});

	it('computes per-call cache rate', () => {
		const groups = [
			makeGroup('claude-opus-4-6', {
				input_tokens: 200, output_tokens: 50,
				cache_read_input_tokens: 800, cache_creation_input_tokens: 0,
			}),
		];

		const result = computeTokenEconomics(groups, 1);
		// 800 / (200 + 800 + 0) = 0.8
		expect(result.snapshots[0].cacheRate).toBeCloseTo(0.8, 6);
	});

	it('computes cost saved by caching (pure cache read)', () => {
		const groups = [
			makeGroup('claude-opus-4-6', {
				input_tokens: 0, output_tokens: 0,
				cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0,
			}),
		];

		const result = computeTokenEconomics(groups, 1);
		// No-cache baseline: 1M * $5/M = $5.00
		// Actual: 1M * $0.50/M = $0.50
		// Saved: $4.50
		expect(result.costSavedByCaching).toBeCloseTo(4.50, 2);
	});

	it('accounts for cache_creation premium in savings calculation', () => {
		// With cache_creation tokens billed at 1.25x input rate ($6.25/M for Opus),
		// the savings are reduced compared to pure cache reads.
		const groups = [
			makeGroup('claude-opus-4-6', {
				input_tokens: 0, output_tokens: 0,
				cache_read_input_tokens: 500_000,
				cache_creation_input_tokens: 500_000,
			}),
		];

		const result = computeTokenEconomics(groups, 1);
		// No-cache baseline: 1M * $5/M = $5.00
		// Actual: (500K * $0.50/M) + (500K * $6.25/M) = $0.25 + $3.125 = $3.375
		// Saved: $5.00 - $3.375 = $1.625
		expect(result.costSavedByCaching).toBeCloseTo(1.625, 2);
	});

	it('computes avg cost per turn', () => {
		const groups = [
			makeGroup('claude-opus-4-6', {
				input_tokens: 1_000_000, output_tokens: 0,
			}),
			makeGroup('claude-opus-4-6', {
				input_tokens: 1_000_000, output_tokens: 0,
			}),
		];

		const result = computeTokenEconomics(groups, 4);
		// total cost = $10, 4 turns → $2.50/turn
		expect(result.avgCostPerTurn).toBeCloseTo(2.5, 6);
	});

	it('computes per-model breakdown', () => {
		const groups = [
			makeGroup('claude-opus-4-6', {
				input_tokens: 10000, output_tokens: 1000,
				cache_read_input_tokens: 50000, cache_creation_input_tokens: 5000,
			}),
			makeGroup('claude-haiku-4-5-20251001', {
				input_tokens: 5000, output_tokens: 500,
				cache_read_input_tokens: 20000, cache_creation_input_tokens: 2000,
			}),
			makeGroup('claude-opus-4-6', {
				input_tokens: 8000, output_tokens: 800,
				cache_read_input_tokens: 40000, cache_creation_input_tokens: 3000,
			}),
		];

		const result = computeTokenEconomics(groups, 3);
		expect(result.models).toContain('claude-opus-4-6');
		expect(result.models).toContain('claude-haiku-4-5-20251001');
		expect(result.perModel).toHaveLength(2);

		const opus = result.perModel.find((m) => m.model === 'claude-opus-4-6')!;
		expect(opus.apiCalls).toBe(2);
		expect(opus.inputTokens).toBe(18000);
		expect(opus.outputTokens).toBe(1800);
	});

	it('skips synthetic records', () => {
		const groups: ApiCallGroup[] = [
			makeGroup('claude-opus-4-6', { input_tokens: 1000, output_tokens: 200 }),
			{
				...makeGroup('<synthetic>', { input_tokens: 0, output_tokens: 0 }),
				isSynthetic: true,
			},
		];

		const result = computeTokenEconomics(groups, 1);
		expect(result.snapshots).toHaveLength(1);
		expect(result.totalInputTokens).toBe(1000);
	});

	it('handles unknown model with costIsLowerBound', () => {
		const groups = [
			makeGroup('claude-opus-4-6', { input_tokens: 1_000_000, output_tokens: 0 }),
			makeGroup('unknown-model', { input_tokens: 1000, output_tokens: 500 }),
		];

		const result = computeTokenEconomics(groups, 1);
		expect(result.costIsLowerBound).toBe(true);
		expect(result.totalCost).toBeCloseTo(5.0, 6); // only the opus call
	});

	it('handles empty groups', () => {
		const result = computeTokenEconomics([], 0);
		expect(result.snapshots).toHaveLength(0);
		expect(result.totalCost).toBe(0);
		expect(result.overallCacheRate).toBe(0);
		expect(result.avgCostPerTurn).toBeNull();
		expect(result.perModel).toHaveLength(0);
	});

	it('computes cumulative cost correctly', () => {
		const groups = [
			makeGroup('claude-opus-4-6', {
				input_tokens: 1_000_000, output_tokens: 0,
			}, '2026-04-03T17:44:34Z'),
			makeGroup('claude-opus-4-6', {
				input_tokens: 0, output_tokens: 1_000_000,
			}, '2026-04-03T17:45:00Z'),
		];

		const result = computeTokenEconomics(groups, 2);
		expect(result.snapshots[0].cumulativeCost).toBeCloseTo(5.0, 6);
		expect(result.snapshots[1].cumulativeCost).toBeCloseTo(30.0, 6);
	});

	it('sorts interleaved main/subagent groups by timestamp', () => {
		// Simulate main + subagent groups passed in array order (not chronological)
		const groups = [
			makeGroup('claude-opus-4-6', { input_tokens: 100, output_tokens: 0 }, '2026-04-03T17:44:00Z'),
			makeGroup('claude-opus-4-6', { input_tokens: 300, output_tokens: 0 }, '2026-04-03T17:46:00Z'),
			// Subagent happened between the two main calls
			makeGroup('claude-haiku-4-5-20251001', { input_tokens: 200, output_tokens: 0 }, '2026-04-03T17:45:00Z'),
		];

		const result = computeTokenEconomics(groups, 2);
		expect(result.snapshots).toHaveLength(3);
		// Should be sorted by timestamp, not input order
		expect(result.snapshots[0].timestamp).toBe('2026-04-03T17:44:00Z');
		expect(result.snapshots[1].timestamp).toBe('2026-04-03T17:45:00Z');
		expect(result.snapshots[2].timestamp).toBe('2026-04-03T17:46:00Z');
		// Cumulative input should reflect sorted order
		expect(result.snapshots[0].cumulativeInputTokens).toBe(100);
		expect(result.snapshots[1].cumulativeInputTokens).toBe(300);
		expect(result.snapshots[2].cumulativeInputTokens).toBe(600);
	});
});
