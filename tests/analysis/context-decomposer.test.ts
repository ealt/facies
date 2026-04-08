import { describe, it, expect, beforeEach } from 'vitest';
import {
	computeContextDecomposition,
	scaleToAuthoritative,
} from '$lib/analysis/context-decomposer.js';
import type {
	ApiCallGroup,
	TranscriptRecord,
	UserRecord,
	AssistantRecord,
	SystemRecord,
	Usage,
	ContextCategory,
} from '$lib/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let msgCounter = 0;
let uuidCounter = 0;

function makeUsage(overrides: Partial<Usage> = {}): Usage {
	return {
		input_tokens: 0,
		output_tokens: 0,
		cache_read_input_tokens: 0,
		cache_creation_input_tokens: 0,
		...overrides,
	};
}

function makeGroup(
	timestamp: string,
	usage: Usage,
	contentBlocks: ApiCallGroup['contentBlocks'] = [],
): ApiCallGroup {
	msgCounter++;
	return {
		messageId: `msg-${msgCounter}`,
		requestId: `req-${msgCounter}`,
		model: 'claude-opus-4-6',
		timestamp,
		usage,
		contentBlocks,
		stopReason: 'end_turn',
		isSynthetic: false,
	};
}

function makeUserRecord(content: string, timestamp: string): UserRecord {
	uuidCounter++;
	return {
		type: 'user',
		message: { role: 'user', content },
		parentUuid: null,
		isSidechain: false,
		uuid: `uuid-${uuidCounter}`,
		timestamp,
	};
}

function makeUserToolResultRecord(
	toolUseId: string,
	resultContent: string,
	timestamp: string,
): UserRecord {
	uuidCounter++;
	return {
		type: 'user',
		message: {
			role: 'user',
			content: [{ type: 'tool_result', tool_use_id: toolUseId, content: resultContent }],
		},
		parentUuid: null,
		isSidechain: false,
		uuid: `uuid-${uuidCounter}`,
		timestamp,
	};
}

function makeCompactSummaryRecord(content: string, timestamp: string): UserRecord {
	uuidCounter++;
	return {
		type: 'user',
		message: { role: 'user', content },
		parentUuid: null,
		isSidechain: false,
		uuid: `uuid-${uuidCounter}`,
		timestamp,
		isCompactSummary: true,
	};
}

function makeCompactBoundary(
	timestamp: string,
	preTokens: number,
): SystemRecord {
	uuidCounter++;
	return {
		type: 'system',
		subtype: 'compact_boundary',
		parentUuid: null,
		isSidechain: false,
		uuid: `uuid-${uuidCounter}`,
		timestamp,
		compactMetadata: { trigger: 'auto', preTokens },
	};
}

const ALL_CATS: ContextCategory[] = [
	'system', 'compacted_summary', 'user', 'assistant_text',
	'assistant_thinking', 'tool_results', 'subagent_overhead',
];

const FLOOR_CATS: ContextCategory[] = ['system', 'compacted_summary'];
const INCR_CATS: ContextCategory[] = [
	'user', 'assistant_text', 'assistant_thinking', 'tool_results', 'subagent_overhead',
];

function categorySum(categories: Record<ContextCategory, number>): number {
	return ALL_CATS.reduce((sum, cat) => sum + categories[cat], 0);
}

// ---------------------------------------------------------------------------
// Tests: scaleToAuthoritative
// ---------------------------------------------------------------------------

describe('scaleToAuthoritative', () => {
	it('keeps floor categories fixed and scales incremental to fill remainder', () => {
		const raw = {
			system: 5000, user: 50, assistant_text: 50, assistant_thinking: 0,
			tool_results: 0, subagent_overhead: 0, compacted_summary: 0,
		};
		const result = scaleToAuthoritative(raw, 6000);
		// System (floor) stays at 5000; user + assistant_text split the 1000 remainder
		expect(result.system).toBe(5000);
		expect(result.compacted_summary).toBe(0);
		expect(result.user + result.assistant_text).toBe(1000);
		expect(categorySum(result)).toBe(6000);
	});

	it('preserves floor categories across growing totals', () => {
		const raw = {
			system: 5000, user: 100, assistant_text: 100, assistant_thinking: 0,
			tool_results: 0, subagent_overhead: 0, compacted_summary: 0,
		};
		// Total grows from 6000 to 10000 — system should stay 5000
		const at6000 = scaleToAuthoritative(raw, 6000);
		const at10000 = scaleToAuthoritative(raw, 10000);
		expect(at6000.system).toBe(5000);
		expect(at10000.system).toBe(5000);
	});

	it('attributes everything to system when raw is all zeros', () => {
		const raw = {
			system: 0, user: 0, assistant_text: 0, assistant_thinking: 0,
			tool_results: 0, subagent_overhead: 0, compacted_summary: 0,
		};
		const result = scaleToAuthoritative(raw, 5000);
		expect(result.system).toBe(5000);
		expect(categorySum(result)).toBe(5000);
	});

	it('returns all zeros when authoritative total is 0', () => {
		const raw = {
			system: 100, user: 50, assistant_text: 0, assistant_thinking: 0,
			tool_results: 0, subagent_overhead: 0, compacted_summary: 0,
		};
		const result = scaleToAuthoritative(raw, 0);
		expect(categorySum(result)).toBe(0);
	});

	it('handles rounding without losing tokens', () => {
		const raw = {
			system: 5000, user: 33, assistant_text: 33, assistant_thinking: 34,
			tool_results: 0, subagent_overhead: 0, compacted_summary: 0,
		};
		const result = scaleToAuthoritative(raw, 6000);
		// Must sum to exactly 6000 despite rounding
		expect(categorySum(result)).toBe(6000);
		expect(result.system).toBe(5000);
	});

	it('scales floor down when it exceeds authoritative total', () => {
		const raw = {
			system: 8000, user: 100, assistant_text: 0, assistant_thinking: 0,
			tool_results: 0, subagent_overhead: 0, compacted_summary: 2000,
		};
		const result = scaleToAuthoritative(raw, 5000);
		// Floor (8000+2000=10000) exceeds 5000 — must scale down
		expect(categorySum(result)).toBe(5000);
		for (const cat of INCR_CATS) expect(result[cat]).toBe(0);
	});

	it('keeps compacted_summary fixed after compaction', () => {
		const raw = {
			system: 5000, user: 200, assistant_text: 0, assistant_thinking: 0,
			tool_results: 0, subagent_overhead: 0, compacted_summary: 10000,
		};
		const result = scaleToAuthoritative(raw, 20000);
		expect(result.system).toBe(5000);
		expect(result.compacted_summary).toBe(10000);
		expect(result.user).toBe(5000); // fills remainder
		expect(categorySum(result)).toBe(20000);
	});
});

// ---------------------------------------------------------------------------
// Tests: computeContextDecomposition
// ---------------------------------------------------------------------------

describe('computeContextDecomposition', () => {
	beforeEach(() => {
		msgCounter = 0;
		uuidCounter = 0;
	});

	it('returns empty for no API call groups', () => {
		const result = computeContextDecomposition([], []);
		expect(result.snapshots).toHaveLength(0);
		expect(result.timeline).toHaveLength(0);
		expect(result.compactions).toHaveLength(0);
	});

	it('skips synthetic groups', () => {
		const groups: ApiCallGroup[] = [{
			messageId: 'msg-synth',
			requestId: null,
			model: '<synthetic>',
			timestamp: '2026-04-03T17:44:34Z',
			usage: makeUsage({ input_tokens: 100 }),
			contentBlocks: [],
			stopReason: null,
			isSynthetic: true,
		}];
		const result = computeContextDecomposition([], groups);
		expect(result.snapshots).toHaveLength(0);
	});

	it('computes a single API call with system baseline + user message', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello, I want to build something', '2026-04-03T17:44:33Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 200,
				cache_creation_input_tokens: 8000,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		expect(result.snapshots).toHaveLength(1);

		const snap = result.snapshots[0];
		expect(snap.totalTokens).toBe(8200); // 200 + 8000
		expect(categorySum(snap.categories)).toBe(8200);
		expect(snap.isEstimated).toBe(true);

		// System is fixed at cache_creation (8000), not scaled
		expect(snap.categories.system).toBe(8000);
		// User fills the 200 remainder
		expect(snap.categories.user).toBe(200);

		// Timeline should have system + user entries
		expect(result.timeline.length).toBeGreaterThanOrEqual(2);
		expect(result.timeline[0].type).toBe('system');
	});

	it('keeps system baseline fixed as context grows', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello', '2026-04-03T17:44:33Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 100,
				cache_creation_input_tokens: 5000,
			}), [
				{ type: 'text', text: 'A'.repeat(400) },
			]),
			makeGroup('2026-04-03T17:44:40Z', makeUsage({
				input_tokens: 200,
				cache_read_input_tokens: 5000,
				cache_creation_input_tokens: 100,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		// System should be 5000 in both snapshots (fixed floor)
		expect(result.snapshots[0].categories.system).toBe(5000);
		expect(result.snapshots[1].categories.system).toBe(5000);
	});

	it('accumulates assistant output as context for subsequent calls', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello', '2026-04-03T17:44:33Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 100,
				cache_creation_input_tokens: 5000,
			}), [
				{ type: 'text', text: 'A'.repeat(400) }, // ~100 tokens
			]),
			makeGroup('2026-04-03T17:44:40Z', makeUsage({
				input_tokens: 200,
				cache_read_input_tokens: 5000,
				cache_creation_input_tokens: 100,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		expect(result.snapshots).toHaveLength(2);

		// Second snapshot should include assistant_text from first call's output
		const snap2 = result.snapshots[1];
		expect(snap2.categories.assistant_text).toBeGreaterThan(0);
		expect(categorySum(snap2.categories)).toBe(5300); // 200 + 5000 + 100
	});

	it('classifies tool results into tool_results category', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Read my file', '2026-04-03T17:44:33Z'),
			makeUserToolResultRecord('tool-1', 'x'.repeat(2000), '2026-04-03T17:44:36Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 100,
				cache_creation_input_tokens: 5000,
			}), [
				{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } },
			]),
			makeGroup('2026-04-03T17:44:37Z', makeUsage({
				input_tokens: 500,
				cache_read_input_tokens: 5000,
				cache_creation_input_tokens: 600,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		const snap2 = result.snapshots[1];
		expect(snap2.categories.tool_results).toBeGreaterThan(0);

		const toolEntries = result.timeline.filter((e) => e.type === 'tool_results');
		expect(toolEntries.length).toBeGreaterThanOrEqual(1);
		expect(toolEntries[0].description).toContain('Read');
	});

	it('classifies Agent tool results as subagent_overhead', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Explore codebase', '2026-04-03T17:44:33Z'),
			makeUserToolResultRecord('tool-a', 'subagent output here', '2026-04-03T17:44:36Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 100,
				cache_creation_input_tokens: 5000,
			}), [
				{ type: 'tool_use', id: 'tool-a', name: 'Agent', input: { prompt: 'explore' } },
			]),
			makeGroup('2026-04-03T17:44:37Z', makeUsage({
				input_tokens: 200,
				cache_read_input_tokens: 5000,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		const snap2 = result.snapshots[1];
		expect(snap2.categories.subagent_overhead).toBeGreaterThan(0);

		const subEntries = result.timeline.filter((e) => e.type === 'subagent_overhead');
		expect(subEntries.length).toBeGreaterThanOrEqual(1);
	});

	it('handles compaction — resets categories and adds compacted_summary', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello', '2026-04-03T17:44:33Z'),
			makeCompactBoundary('2026-04-03T17:45:00Z', 50000),
			makeCompactSummaryRecord('Summary of prior context', '2026-04-03T17:45:01Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 200,
				cache_creation_input_tokens: 8000,
				cache_read_input_tokens: 40000,
			})),
			makeGroup('2026-04-03T17:45:02Z', makeUsage({
				input_tokens: 500,
				cache_creation_input_tokens: 8000,
				cache_read_input_tokens: 12000,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		expect(result.compactions).toHaveLength(1);
		expect(result.compactions[0].preTokens).toBe(50000);
		expect(result.compactions[0].postTokens).toBe(20500);

		// Post-compaction snapshot: system stays fixed, compacted_summary appears
		const snap2 = result.snapshots[1];
		expect(snap2.categories.system).toBe(8000);
		expect(snap2.categories.compacted_summary).toBeGreaterThan(0);
		expect(categorySum(snap2.categories)).toBe(20500);
	});

	it('infers compacted_summary when no isCompactSummary record exists', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello', '2026-04-03T17:44:33Z'),
			makeCompactBoundary('2026-04-03T17:45:00Z', 50000),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 200,
				cache_creation_input_tokens: 8000,
			})),
			makeGroup('2026-04-03T17:45:02Z', makeUsage({
				input_tokens: 500,
				cache_read_input_tokens: 15000,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		const snap2 = result.snapshots[1];
		// compacted_summary inferred: totalInput(15500) - system(8000) = 7500
		expect(snap2.categories.compacted_summary).toBeGreaterThan(0);
		expect(categorySum(snap2.categories)).toBe(15500);
	});

	it('cumulative tokens reset on compaction in timeline', () => {
		// Large user message so pre-compaction cumulative is significantly higher
		const records: TranscriptRecord[] = [
			makeUserRecord('A'.repeat(4000), '2026-04-03T17:44:33Z'), // ~1000 tokens
			makeCompactBoundary('2026-04-03T17:45:00Z', 50000),
			makeCompactSummaryRecord('Short summary', '2026-04-03T17:45:01Z'),
			makeUserRecord('New message after compaction', '2026-04-03T17:45:03Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 1200,
				cache_creation_input_tokens: 8000,
			})),
			makeGroup('2026-04-03T17:45:04Z', makeUsage({
				input_tokens: 500,
				cache_read_input_tokens: 8000,
			})),
		];

		const result = computeContextDecomposition(records, groups);

		// Find the compacted_summary entry
		const compactIdx = result.timeline.findIndex((e) => e.type === 'compacted_summary');
		expect(compactIdx).toBeGreaterThan(0);

		// Cumulative before compaction should be higher than after
		const preCumulative = result.timeline[compactIdx - 1].cumulativeTokens;
		const postCumulative = result.timeline[compactIdx].cumulativeTokens;
		expect(postCumulative).toBeLessThan(preCumulative);
	});

	it('normalizes compacted_summary timeline to actual post-compaction size', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello', '2026-04-03T17:44:33Z'),
			makeCompactBoundary('2026-04-03T17:45:00Z', 50000),
			// Short summary text — chars/4 would be ~6 tokens, but actual context is much larger
			makeCompactSummaryRecord('Summary of prior context', '2026-04-03T17:45:01Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 200,
				cache_creation_input_tokens: 8000,
				cache_read_input_tokens: 40000,
			})),
			makeGroup('2026-04-03T17:45:02Z', makeUsage({
				input_tokens: 500,
				cache_creation_input_tokens: 8000,
				cache_read_input_tokens: 12000,
			})),
		];

		const result = computeContextDecomposition(records, groups);

		// The compacted_summary timeline entry should reflect actual remainder (20500-8000=12500),
		// not the raw text estimate (~6 tokens)
		const summaryEntry = result.timeline.find((e) => e.type === 'compacted_summary');
		expect(summaryEntry).toBeDefined();
		expect(summaryEntry!.estimatedTokens).toBe(12500);

		// The cumulative at the summary entry should be system + summary = 20500
		expect(summaryEntry!.cumulativeTokens).toBe(8000 + 12500);
	});

	it('flushes pending compaction when session ends before next API call', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello', '2026-04-03T17:44:33Z'),
			// Compaction happens AFTER the last API call — no subsequent call
			makeCompactBoundary('2026-04-03T17:45:00Z', 50000),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 200,
				cache_creation_input_tokens: 8000,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		// Compaction should still be recorded (with null postTokens)
		expect(result.compactions).toHaveLength(1);
		expect(result.compactions[0].postTokens).toBeNull();
		expect(result.compactions[0].tokensFreed).toBeNull();
	});

	it('uses fallback system estimate when cache_creation is 0', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello', '2026-04-03T17:44:33Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 100,
				cache_read_input_tokens: 8000,
				cache_creation_input_tokens: 0,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		expect(result.snapshots).toHaveLength(1);
		expect(result.snapshots[0].categories.system).toBeGreaterThan(0);
		expect(categorySum(result.snapshots[0].categories)).toBe(8100);
	});

	it('handles thinking blocks in assistant output', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('Hello', '2026-04-03T17:44:33Z'),
		];
		const thinkingText = 'T'.repeat(4000); // ~1000 tokens
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 100,
				cache_creation_input_tokens: 5000,
			}), [
				{ type: 'thinking', thinking: thinkingText, signature: 'sig' },
				{ type: 'text', text: 'Result here' },
			]),
			makeGroup('2026-04-03T17:44:40Z', makeUsage({
				input_tokens: 1200,
				cache_read_input_tokens: 5000,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		const snap2 = result.snapshots[1];
		expect(snap2.categories.assistant_thinking).toBeGreaterThan(0);
		expect(snap2.categories.assistant_text).toBeGreaterThan(0);

		const thinkingEntries = result.timeline.filter((e) => e.type === 'assistant_thinking');
		expect(thinkingEntries.length).toBe(1);
	});

	it('all snapshots have categories summing to their authoritative total', () => {
		const records: TranscriptRecord[] = [
			makeUserRecord('First message', '2026-04-03T17:44:33Z'),
			makeUserToolResultRecord('t1', 'result data '.repeat(100), '2026-04-03T17:44:36Z'),
			makeUserRecord('Second message', '2026-04-03T17:44:41Z'),
		];
		const groups = [
			makeGroup('2026-04-03T17:44:34Z', makeUsage({
				input_tokens: 100,
				cache_creation_input_tokens: 5000,
			}), [
				{ type: 'tool_use', id: 't1', name: 'Read', input: {} },
			]),
			makeGroup('2026-04-03T17:44:37Z', makeUsage({
				input_tokens: 800,
				cache_read_input_tokens: 5000,
				cache_creation_input_tokens: 200,
			})),
			makeGroup('2026-04-03T17:44:42Z', makeUsage({
				input_tokens: 1000,
				cache_read_input_tokens: 5500,
				cache_creation_input_tokens: 100,
			})),
		];

		const result = computeContextDecomposition(records, groups);
		for (const snap of result.snapshots) {
			expect(categorySum(snap.categories)).toBe(snap.totalTokens);
		}
	});
});
