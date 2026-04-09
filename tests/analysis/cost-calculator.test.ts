import { describe, it, expect } from 'vitest';
import { computeApiCallCost, computeSessionCost } from '$lib/analysis/cost-calculator.js';
import { normalizeModel, lookupPricing } from '$lib/pricing.js';
import type { ApiCallGroup, Usage } from '$lib/types.js';

function makeGroup(overrides: Partial<ApiCallGroup> & { usage: Usage; model: string }): ApiCallGroup {
	return {
		messageId: 'msg-1',
		requestId: 'req-1',
		timestamp: '2026-04-03T17:44:34Z',
		contentBlocks: [],
		stopReason: 'end_turn',
		isSynthetic: false,
		...overrides,
	};
}

describe('normalizeModel', () => {
	it('strips [1m] context window annotation', () => {
		expect(normalizeModel('claude-opus-4-6[1m]')).toBe('claude-opus-4-6');
	});

	it('strips ANSI escape codes', () => {
		expect(normalizeModel('\x1b[1mclaude-opus-4-6\x1b[0m')).toBe('claude-opus-4-6');
	});

	it('trims whitespace', () => {
		expect(normalizeModel('  claude-opus-4-6  ')).toBe('claude-opus-4-6');
	});

	it('leaves clean model names unchanged', () => {
		expect(normalizeModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
	});

	it('handles combined ANSI codes + bracket annotation', () => {
		expect(normalizeModel('\x1b[1mclaude-opus-4-6[1m]\x1b[0m')).toBe('claude-opus-4-6');
	});
});

describe('lookupPricing', () => {
	it('finds exact match for known model', () => {
		const pricing = lookupPricing('claude-opus-4-6');
		expect(pricing).not.toBeNull();
		expect(pricing!.input).toBe(5.0);
		expect(pricing!.output).toBe(25.0);
	});

	it('normalizes before lookup', () => {
		const pricing = lookupPricing('claude-opus-4-6[1m]');
		expect(pricing).not.toBeNull();
		expect(pricing!.input).toBe(5.0);
	});

	it('prefix-matches dated model variants', () => {
		// claude-opus-4-6-20260501 should match claude-opus-4-6
		const pricing = lookupPricing('claude-opus-4-6-20260501');
		expect(pricing).not.toBeNull();
		expect(pricing!.input).toBe(5.0);
	});

	it('does not prefix-match across non-delimiter boundaries', () => {
		// "claude-opus-4-61" should NOT match "claude-opus-4-6"
		expect(lookupPricing('claude-opus-4-61')).toBeNull();
	});

	it('returns null for unrecognizable model', () => {
		expect(lookupPricing('gpt-4o')).toBeNull();
	});

	it('finds sonnet pricing', () => {
		const pricing = lookupPricing('claude-sonnet-4-6');
		expect(pricing).not.toBeNull();
		expect(pricing!.input).toBe(3.0);
		expect(pricing!.output).toBe(15.0);
	});

	it('finds haiku pricing', () => {
		const pricing = lookupPricing('claude-haiku-4-5-20251001');
		expect(pricing).not.toBeNull();
		expect(pricing!.input).toBe(1.0);
		expect(pricing!.output).toBe(5.0);
	});

	it('finds canonical legacy model IDs', () => {
		// Sonnet 3.7
		const s37 = lookupPricing('claude-3-7-sonnet-20250219');
		expect(s37).not.toBeNull();
		expect(s37!.input).toBe(3.0);

		// Haiku 3.5
		const h35 = lookupPricing('claude-3-5-haiku-20241022');
		expect(h35).not.toBeNull();
		expect(h35!.input).toBe(0.8);

		// Opus 3
		const o3 = lookupPricing('claude-3-opus-20240229');
		expect(o3).not.toBeNull();
		expect(o3!.input).toBe(15.0);
	});
});

describe('computeApiCallCost', () => {
	it('computes correct cost for a known model', () => {
		const group = makeGroup({
			model: 'claude-opus-4-6',
			usage: {
				input_tokens: 1000,
				output_tokens: 500,
				cache_read_input_tokens: 2000,
				cache_creation_input_tokens: 500,
			},
		});

		const result = computeApiCallCost(group);
		expect(result.cost).not.toBeNull();
		expect(result.pricing).not.toBeNull();
		expect(result.model).toBe('claude-opus-4-6');

		// Manual calculation: (1000*5 + 500*25 + 2000*0.5 + 500*6.25) / 1_000_000
		// = (5000 + 12500 + 1000 + 3125) / 1_000_000 = 21625 / 1_000_000 = 0.021625
		expect(result.cost).toBeCloseTo(0.021625, 6);
	});

	it('computes correct cost for sonnet', () => {
		const group = makeGroup({
			model: 'claude-sonnet-4-6',
			usage: {
				input_tokens: 10000,
				output_tokens: 2000,
				cache_read_input_tokens: 50000,
				cache_creation_input_tokens: 10000,
			},
		});

		const result = computeApiCallCost(group);
		// (10000*3 + 2000*15 + 50000*0.3 + 10000*3.75) / 1_000_000
		// = (30000 + 30000 + 15000 + 37500) / 1_000_000 = 112500 / 1_000_000 = 0.1125
		expect(result.cost).toBeCloseTo(0.1125, 6);
	});

	it('returns zero cost for synthetic records', () => {
		const group = makeGroup({
			model: '<synthetic>',
			usage: { input_tokens: 0, output_tokens: 0 },
			isSynthetic: true,
		});

		const result = computeApiCallCost(group);
		expect(result.cost).toBe(0);
	});

	it('returns null cost for unknown model', () => {
		const group = makeGroup({
			model: 'gpt-4o',
			usage: { input_tokens: 1000, output_tokens: 500 },
		});

		const result = computeApiCallCost(group);
		expect(result.cost).toBeNull();
		expect(result.pricing).toBeNull();
	});

	it('handles missing usage fields gracefully', () => {
		const group = makeGroup({
			model: 'claude-opus-4-6',
			usage: { output_tokens: 100 },
		});

		const result = computeApiCallCost(group);
		// Only output: (100 * 25) / 1_000_000 = 0.0025
		expect(result.cost).toBeCloseTo(0.0025, 6);
	});

	it('handles model with context window annotation', () => {
		const group = makeGroup({
			model: 'claude-opus-4-6[1m]',
			usage: { input_tokens: 1_000_000, output_tokens: 0 },
		});

		const result = computeApiCallCost(group);
		// 1M tokens * $5/MTok = $5.00
		expect(result.cost).toBeCloseTo(5.0, 6);
	});
});

describe('computeSessionCost', () => {
	it('sums costs across multiple API calls', () => {
		const groups = [
			makeGroup({
				model: 'claude-opus-4-6',
				usage: { input_tokens: 1_000_000, output_tokens: 0 },
			}),
			makeGroup({
				model: 'claude-opus-4-6',
				usage: { input_tokens: 0, output_tokens: 1_000_000 },
			}),
		];

		const result = computeSessionCost(groups);
		// $5 input + $25 output = $30
		expect(result.totalCost).toBeCloseTo(30.0, 6);
		expect(result.costIsLowerBound).toBe(false);
		expect(result.perCall).toHaveLength(2);
	});

	it('handles mixed known and unknown models', () => {
		const groups = [
			makeGroup({
				model: 'claude-opus-4-6',
				usage: { input_tokens: 1_000_000, output_tokens: 0 },
			}),
			makeGroup({
				model: 'unknown-model-xyz',
				usage: { input_tokens: 1000, output_tokens: 500 },
			}),
		];

		const result = computeSessionCost(groups);
		expect(result.totalCost).toBeCloseTo(5.0, 6);
		expect(result.costIsLowerBound).toBe(true);
	});

	it('returns null totalCost when ALL models are unknown', () => {
		const groups = [
			makeGroup({
				model: 'unknown-model',
				usage: { input_tokens: 1000, output_tokens: 500 },
			}),
		];

		const result = computeSessionCost(groups);
		expect(result.totalCost).toBeNull();
		expect(result.costIsLowerBound).toBe(true);
	});

	it('returns zero cost for empty groups', () => {
		const result = computeSessionCost([]);
		expect(result.totalCost).toBe(0);
		expect(result.costIsLowerBound).toBe(false);
		expect(result.perCall).toHaveLength(0);
	});

	it('skips synthetic records in totals', () => {
		const groups = [
			makeGroup({
				model: 'claude-opus-4-6',
				usage: { input_tokens: 1_000_000, output_tokens: 0 },
			}),
			makeGroup({
				model: '<synthetic>',
				usage: { input_tokens: 0, output_tokens: 0 },
				isSynthetic: true,
			}),
		];

		const result = computeSessionCost(groups);
		expect(result.totalCost).toBeCloseTo(5.0, 6);
		expect(result.costIsLowerBound).toBe(false);
	});

	it('handles multi-model sessions (main + subagents)', () => {
		const groups = [
			// Main session uses Opus
			makeGroup({
				model: 'claude-opus-4-6',
				usage: { input_tokens: 100_000, output_tokens: 10_000 },
			}),
			// Subagent uses Haiku
			makeGroup({
				model: 'claude-haiku-4-5-20251001',
				usage: { input_tokens: 50_000, output_tokens: 5_000 },
			}),
		];

		const result = computeSessionCost(groups);
		// Opus: (100000*5 + 10000*25) / 1M = (500000 + 250000) / 1M = 0.75
		// Haiku: (50000*1 + 5000*5) / 1M = (50000 + 25000) / 1M = 0.075
		// Total: 0.825
		expect(result.totalCost).toBeCloseTo(0.825, 6);
		expect(result.costIsLowerBound).toBe(false);
	});
});
