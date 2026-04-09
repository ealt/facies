import { describe, it, expect } from 'vitest';
import { computeCompactionAnalysis } from '$lib/analysis/compaction-analyzer.js';
import type {
	TranscriptRecord,
	ApiCallGroup,
	EventLogRecord,
	SystemRecord,
	Usage,
	UserPromptSubmitEvent,
	SessionStartEvent,
	SessionEndEvent,
} from '$lib/types.js';

// =============================================================================
// Helpers
// =============================================================================

const BASE_EVENT = {
	session_id: 'test',
	cwd: '/test',
	transcript_path: '/test/transcript.jsonl',
};

function makeUsage(input: number, output: number, cacheRead = 0, cacheCreate = 0): Usage {
	return {
		input_tokens: input,
		output_tokens: output,
		cache_read_input_tokens: cacheRead,
		cache_creation_input_tokens: cacheCreate,
	};
}

function makeApiGroup(ts: string, usage: Usage, model = 'claude-opus-4-6'): ApiCallGroup {
	return {
		messageId: `msg-${ts}`,
		requestId: null,
		model,
		timestamp: ts,
		usage,
		contentBlocks: [],
		stopReason: 'end_turn',
		isSynthetic: false,
	};
}

function makeSyntheticGroup(ts: string): ApiCallGroup {
	return {
		messageId: null,
		requestId: null,
		model: '<synthetic>',
		timestamp: ts,
		usage: makeUsage(0, 0),
		contentBlocks: [],
		stopReason: null,
		isSynthetic: true,
	};
}

function makeCompactBoundary(ts: string, preTokens: number, trigger = 'auto'): SystemRecord {
	return {
		type: 'system',
		subtype: 'compact_boundary',
		parentUuid: null,
		isSidechain: false,
		uuid: `sys-${ts}`,
		timestamp: ts,
		compactMetadata: { trigger, preTokens },
	};
}

function makeUserPrompt(ts: string): UserPromptSubmitEvent {
	return {
		...BASE_EVENT,
		event: 'UserPromptSubmit',
		timestamp: ts,
		prompt_length: 100,
	};
}

function makeSessionStart(ts: string): SessionStartEvent {
	return {
		...BASE_EVENT,
		event: 'SessionStart',
		timestamp: ts,
		source: 'cli',
		model: 'claude-opus-4-6',
	};
}

function makeSessionEnd(ts: string): SessionEndEvent {
	return {
		...BASE_EVENT,
		event: 'SessionEnd',
		timestamp: ts,
		reason: 'user',
	};
}

// =============================================================================
// Tests
// =============================================================================

describe('computeCompactionAnalysis', () => {
	it('returns empty compactions for sessions without compaction', () => {
		const groups = [
			makeApiGroup('2026-04-03T17:00:00Z', makeUsage(1000, 200, 8000, 1000)),
			makeApiGroup('2026-04-03T17:01:00Z', makeUsage(500, 100, 9500, 0)),
		];

		const result = computeCompactionAnalysis([], groups, []);

		expect(result.compactions).toEqual([]);
		expect(result.contextSizePoints).toHaveLength(2);
		expect(result.avgPreTokens).toBeNull();
		expect(result.avgPostTokens).toBeNull();
		expect(result.avgTokensFreed).toBeNull();
		expect(result.avgRecoveryTurns).toBeNull();
	});

	it('computes context size points from API call groups', () => {
		const groups = [
			makeApiGroup('2026-04-03T17:00:00Z', makeUsage(1000, 200, 8000, 1000)),
			makeApiGroup('2026-04-03T17:01:00Z', makeUsage(500, 100, 15000, 0)),
		];

		const result = computeCompactionAnalysis([], groups, []);

		expect(result.contextSizePoints).toEqual([
			{ timestamp: '2026-04-03T17:00:00Z', totalTokens: 10000 },
			{ timestamp: '2026-04-03T17:01:00Z', totalTokens: 15500 },
		]);
	});

	it('skips synthetic groups in context size points', () => {
		const groups = [
			makeSyntheticGroup('2026-04-03T16:59:00Z'),
			makeApiGroup('2026-04-03T17:00:00Z', makeUsage(1000, 200, 8000, 1000)),
		];

		const result = computeCompactionAnalysis([], groups, []);

		expect(result.contextSizePoints).toHaveLength(1);
		expect(result.contextSizePoints[0].timestamp).toBe('2026-04-03T17:00:00Z');
	});

	it('computes basic compaction metrics', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 182000),
		];

		// Pre-compaction call: high cache rate
		const preCall = makeApiGroup(
			'2026-04-03T17:29:50Z',
			makeUsage(100, 500, 170000, 0), // cache rate = 170000/170100 ≈ 99.9%
		);
		// Post-compaction call: low cache rate (cache miss after compaction)
		const postCall = makeApiGroup(
			'2026-04-03T17:30:10Z',
			makeUsage(5000, 300, 5000, 20000), // cache rate = 5000/30000 ≈ 16.7%
		);

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
			makeUserPrompt('2026-04-03T17:05:00Z'),
			makeUserPrompt('2026-04-03T17:15:00Z'),
			makeUserPrompt('2026-04-03T17:25:00Z'),
		];

		const result = computeCompactionAnalysis(records, [preCall, postCall], events);

		expect(result.compactions).toHaveLength(1);

		const c = result.compactions[0];
		expect(c.timestamp).toBe('2026-04-03T17:30:00Z');
		expect(c.trigger).toBe('auto');
		expect(c.preTokens).toBe(182000);
		expect(c.postTokens).toBe(30000); // 5000 + 5000 + 20000
		expect(c.tokensFreed).toBe(152000);
		expect(c.turnsBefore).toBe(3);
		expect(c.cacheRateBefore).toBeCloseTo(170000 / 170100, 4);
		expect(c.cacheRateAfter).toBeCloseTo(5000 / 30000, 4);
	});

	it('computes recovery turns when cache rate recovers above 80%', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 180000),
		];

		const groups = [
			// Pre-compaction
			makeApiGroup('2026-04-03T17:29:50Z', makeUsage(100, 200, 170000, 0)),
			// Post-compaction: low cache rate
			makeApiGroup('2026-04-03T17:30:10Z', makeUsage(5000, 300, 5000, 20000)),
			// Turn 1: still low
			makeApiGroup('2026-04-03T17:31:00Z', makeUsage(3000, 200, 15000, 5000)),
			// Turn 2: recovered (cache rate > 80%)
			makeApiGroup('2026-04-03T17:32:00Z', makeUsage(500, 150, 25000, 500)),
		];

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
			// Turns after compaction
			makeUserPrompt('2026-04-03T17:30:05Z'),
			makeUserPrompt('2026-04-03T17:30:55Z'),
			makeUserPrompt('2026-04-03T17:31:55Z'),
		];

		const result = computeCompactionAnalysis(records, groups, events);

		expect(result.compactions[0].recoveryTurns).toBe(3);
	});

	it('returns null recoveryTurns when cache rate never recovers', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 180000),
		];

		const groups = [
			makeApiGroup('2026-04-03T17:29:50Z', makeUsage(100, 200, 170000, 0)),
			// Post-compaction: all calls stay below 80% cache rate
			makeApiGroup('2026-04-03T17:30:10Z', makeUsage(5000, 300, 5000, 20000)),
			makeApiGroup('2026-04-03T17:31:00Z', makeUsage(3000, 200, 10000, 5000)),
		];

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
			makeUserPrompt('2026-04-03T17:30:05Z'),
			makeUserPrompt('2026-04-03T17:30:55Z'),
		];

		const result = computeCompactionAnalysis(records, groups, events);

		expect(result.compactions[0].recoveryTurns).toBeNull();
		// postTokens is non-null, so this is "did not recover" not "unresolved"
		expect(result.compactions[0].postTokens).not.toBeNull();
	});

	it('handles multiple compactions', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 180000),
			makeCompactBoundary('2026-04-03T18:30:00Z', 175000),
		];

		const groups = [
			// Before first compaction
			makeApiGroup('2026-04-03T17:29:50Z', makeUsage(100, 200, 170000, 0)),
			// After first compaction
			makeApiGroup('2026-04-03T17:30:10Z', makeUsage(3000, 300, 5000, 18000)),
			// High cache rate recovery
			makeApiGroup('2026-04-03T17:35:00Z', makeUsage(200, 150, 24000, 200)),
			// Before second compaction
			makeApiGroup('2026-04-03T18:29:50Z', makeUsage(100, 200, 165000, 0)),
			// After second compaction
			makeApiGroup('2026-04-03T18:30:10Z', makeUsage(4000, 250, 3000, 19000)),
		];

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
			makeUserPrompt('2026-04-03T17:10:00Z'),
			makeUserPrompt('2026-04-03T17:20:00Z'),
			// Between compactions
			makeUserPrompt('2026-04-03T17:40:00Z'),
			makeUserPrompt('2026-04-03T18:00:00Z'),
			makeUserPrompt('2026-04-03T18:20:00Z'),
		];

		const result = computeCompactionAnalysis(records, groups, events);

		expect(result.compactions).toHaveLength(2);
		expect(result.compactions[0].preTokens).toBe(180000);
		expect(result.compactions[1].preTokens).toBe(175000);

		// First compaction: 2 turns between session start and first compaction
		expect(result.compactions[0].turnsBefore).toBe(2);
		// Second compaction: 3 turns between first and second compaction
		expect(result.compactions[1].turnsBefore).toBe(3);

		// Aggregates
		expect(result.avgPreTokens).toBe(177500);
	});

	it('handles trailing compaction (session ended before next API call)', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 180000),
		];

		const groups = [
			makeApiGroup('2026-04-03T17:29:50Z', makeUsage(100, 200, 170000, 0)),
			// No API call after compaction — session ended
		];

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
		];

		const result = computeCompactionAnalysis(records, groups, events);

		expect(result.compactions).toHaveLength(1);
		expect(result.compactions[0].postTokens).toBeNull();
		expect(result.compactions[0].tokensFreed).toBeNull();
		expect(result.compactions[0].cacheRateAfter).toBeNull();
		expect(result.compactions[0].recoveryTurns).toBeNull();
		expect(result.compactions[0].firstPostCompactionCost).toBeNull();
		expect(result.avgPostTokens).toBeNull();
		expect(result.avgTokensFreed).toBeNull();
	});

	it('computes turnsBefore from UserPromptSubmit events', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 100000),
		];

		const groups = [
			makeApiGroup('2026-04-03T17:29:50Z', makeUsage(1000, 200, 90000, 0)),
			makeApiGroup('2026-04-03T17:30:10Z', makeUsage(2000, 100, 8000, 15000)),
		];

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
			makeUserPrompt('2026-04-03T17:05:00Z'),
			makeUserPrompt('2026-04-03T17:10:00Z'),
			makeUserPrompt('2026-04-03T17:15:00Z'),
			makeUserPrompt('2026-04-03T17:20:00Z'),
			makeUserPrompt('2026-04-03T17:25:00Z'),
			// This one is after compaction — should not count
			makeUserPrompt('2026-04-03T17:35:00Z'),
		];

		const result = computeCompactionAnalysis(records, groups, events);

		expect(result.compactions[0].turnsBefore).toBe(5);
	});

	it('returns null cacheRateBefore when no API call precedes compaction', () => {
		const records: TranscriptRecord[] = [
			// Compaction before any API call (unusual but possible)
			makeCompactBoundary('2026-04-03T16:59:00Z', 50000),
		];

		const groups = [
			makeApiGroup('2026-04-03T17:00:00Z', makeUsage(2000, 100, 5000, 10000)),
		];

		const result = computeCompactionAnalysis(records, groups, []);

		expect(result.compactions[0].cacheRateBefore).toBeNull();
		expect(result.compactions[0].cacheRateAfter).toBeCloseTo(5000 / 17000, 4);
	});

	it('computes per-compaction cost metrics', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 180000),
		];

		const groups = [
			// Pre-compaction calls
			makeApiGroup('2026-04-03T17:25:00Z', makeUsage(100, 500, 150000, 0)),
			makeApiGroup('2026-04-03T17:28:00Z', makeUsage(100, 300, 170000, 0)),
			// Post-compaction call
			makeApiGroup('2026-04-03T17:30:10Z', makeUsage(5000, 400, 3000, 18000)),
		];

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
		];

		const result = computeCompactionAnalysis(records, groups, events);

		const c = result.compactions[0];
		expect(c.firstPostCompactionCost).not.toBeNull();
		expect(c.firstPostCompactionCost).toBeGreaterThan(0);
		expect(c.avgPreCompactionCost).not.toBeNull();
		expect(c.avgPreCompactionCost).toBeGreaterThan(0);
		// Post-compaction cost should be higher (more uncached input)
		expect(c.firstPostCompactionCost!).toBeGreaterThan(c.avgPreCompactionCost!);
	});

	it('handles empty inputs gracefully', () => {
		const result = computeCompactionAnalysis([], [], []);

		expect(result.compactions).toEqual([]);
		expect(result.contextSizePoints).toEqual([]);
		expect(result.avgPreTokens).toBeNull();
		expect(result.avgPostTokens).toBeNull();
		expect(result.avgTokensFreed).toBeNull();
		expect(result.avgRecoveryTurns).toBeNull();
	});

	it('uses trigger from compactMetadata', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 100000, 'manual'),
		];

		const groups = [
			makeApiGroup('2026-04-03T17:30:10Z', makeUsage(2000, 100, 5000, 15000)),
		];

		const result = computeCompactionAnalysis(records, groups, []);

		expect(result.compactions[0].trigger).toBe('manual');
	});

	it('computes correct freed percentage for resolved compactions', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 200000),
		];

		const groups = [
			makeApiGroup('2026-04-03T17:29:50Z', makeUsage(100, 200, 190000, 0)),
			makeApiGroup('2026-04-03T17:30:10Z', makeUsage(1000, 100, 5000, 20000)),
		];

		const result = computeCompactionAnalysis(records, groups, []);

		const c = result.compactions[0];
		expect(c.preTokens).toBe(200000);
		expect(c.postTokens).toBe(26000);
		expect(c.tokensFreed).toBe(174000);

		// Freed percentage
		const freedPct = c.tokensFreed! / c.preTokens;
		expect(freedPct).toBeCloseTo(0.87, 2);
	});

	it('computes elapsedMs from session start', () => {
		const records: TranscriptRecord[] = [
			makeCompactBoundary('2026-04-03T17:30:00Z', 100000),
		];

		const groups = [
			makeApiGroup('2026-04-03T17:30:10Z', makeUsage(2000, 100, 5000, 15000)),
		];

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
		];

		const result = computeCompactionAnalysis(records, groups, events);

		// 30 minutes = 1,800,000 ms
		expect(result.compactions[0].elapsedMs).toBe(30 * 60 * 1000);
	});

	it('provides session start and end times for chart domain', () => {
		const groups = [
			makeApiGroup('2026-04-03T17:05:00Z', makeUsage(1000, 200, 8000, 1000)),
		];

		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
			makeSessionEnd('2026-04-03T18:00:00Z'),
		];

		const result = computeCompactionAnalysis([], groups, events);

		expect(result.sessionStartTime).toBe('2026-04-03T17:00:00Z');
		expect(result.sessionEndTime).toBe('2026-04-03T18:00:00Z');
	});

	it('uses last event timestamp for interrupted sessions (no SessionEnd)', () => {
		const groups = [
			makeApiGroup('2026-04-03T17:05:00Z', makeUsage(1000, 200, 8000, 1000)),
		];

		// No SessionEnd/Stop, but a later event exists
		const events: EventLogRecord[] = [
			makeSessionStart('2026-04-03T17:00:00Z'),
			makeUserPrompt('2026-04-03T17:04:00Z'),
			makeUserPrompt('2026-04-03T17:30:00Z'), // Latest event, after last API call
		];

		const result = computeCompactionAnalysis([], groups, events);

		expect(result.sessionStartTime).toBe('2026-04-03T17:00:00Z');
		// Should use the latest event timestamp, not the last API call
		expect(result.sessionEndTime).toBe('2026-04-03T17:30:00Z');
	});

	it('skips compact_boundary records with invalid compactMetadata', () => {
		// Record with missing preTokens
		const invalidBoundary: SystemRecord = {
			type: 'system',
			subtype: 'compact_boundary',
			parentUuid: null,
			isSidechain: false,
			uuid: 'sys-invalid',
			timestamp: '2026-04-03T17:30:00Z',
			compactMetadata: { trigger: 'auto' } as unknown as SystemRecord['compactMetadata'],
		};

		const validBoundary = makeCompactBoundary('2026-04-03T17:35:00Z', 100000);

		const groups = [
			makeApiGroup('2026-04-03T17:35:10Z', makeUsage(2000, 100, 5000, 15000)),
		];

		const result = computeCompactionAnalysis(
			[invalidBoundary, validBoundary],
			groups,
			[],
		);

		// Only the valid boundary should be processed
		expect(result.compactions).toHaveLength(1);
		expect(result.compactions[0].preTokens).toBe(100000);
	});
});
