import { describe, it, expect } from 'vitest';
import {
	pairToolEvents,
	summarizeTools,
	computeToolAnalysis,
} from '$lib/analysis/tool-analyzer.js';
import type { EventLogRecord, PreToolUseEvent, PostToolUseEvent, PostToolUseFailureEvent } from '$lib/types.js';

const BASE = {
	session_id: 'test',
	cwd: '/test',
	transcript_path: '/test/transcript.jsonl',
};

function pre(tool: string, ts: string, keys: string[] = []): PreToolUseEvent {
	return { ...BASE, event: 'PreToolUse', timestamp: ts, tool_name: tool, tool_input_keys: keys };
}

function post(tool: string, ts: string, id: string, inputSize = 100, responseSize = 500): PostToolUseEvent {
	return {
		...BASE, event: 'PostToolUse', timestamp: ts, tool_name: tool,
		tool_use_id: id, tool_input_keys: [], tool_input_size: inputSize, tool_response_size: responseSize,
	};
}

function fail(tool: string, ts: string, id: string, error = 'some error'): PostToolUseFailureEvent {
	return {
		...BASE, event: 'PostToolUseFailure', timestamp: ts,
		tool_name: tool, tool_use_id: id, error,
	};
}

// =============================================================================
// pairToolEvents
// =============================================================================

describe('pairToolEvents', () => {
	it('pairs a single Pre→Post sequence', () => {
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			post('Read', '2026-04-03T17:00:01Z', 'toolu_1'),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(1);
		expect(calls[0].toolName).toBe('Read');
		expect(calls[0].toolUseId).toBe('toolu_1');
		expect(calls[0].latencyMs).toBe(1000);
		expect(calls[0].failed).toBe(false);
	});

	it('pairs a Pre→PostFailure sequence', () => {
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			fail('Read', '2026-04-03T17:00:00Z', 'toolu_fail'),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(1);
		expect(calls[0].failed).toBe(true);
		expect(calls[0].error).toBe('some error');
		expect(calls[0].latencyMs).toBe(0);
		expect(calls[0].inputSize).toBe(0);
		expect(calls[0].responseSize).toBe(0);
	});

	it('pairs multiple calls of the same tool sequentially', () => {
		const events: EventLogRecord[] = [
			pre('Bash', '2026-04-03T17:00:00Z'),
			post('Bash', '2026-04-03T17:00:03Z', 'toolu_b1', 50, 1000),
			pre('Bash', '2026-04-03T17:00:04Z'),
			post('Bash', '2026-04-03T17:00:05Z', 'toolu_b2', 60, 800),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(2);
		expect(calls[0].toolUseId).toBe('toolu_b1');
		expect(calls[0].latencyMs).toBe(3000);
		expect(calls[1].toolUseId).toBe('toolu_b2');
		expect(calls[1].latencyMs).toBe(1000);
	});

	it('pairs interleaved different tools correctly', () => {
		// Read Pre → Bash Pre → Read Post → Bash Post
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			pre('Bash', '2026-04-03T17:00:01Z'),
			post('Read', '2026-04-03T17:00:02Z', 'toolu_r1', 80, 5000),
			post('Bash', '2026-04-03T17:00:03Z', 'toolu_b1', 40, 200),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(2);

		const readCall = calls.find((c) => c.toolName === 'Read')!;
		const bashCall = calls.find((c) => c.toolName === 'Bash')!;
		expect(readCall.latencyMs).toBe(2000);
		expect(bashCall.latencyMs).toBe(2000);
	});

	it('handles Post without Pre (latency null)', () => {
		const events: EventLogRecord[] = [
			post('Read', '2026-04-03T17:00:01Z', 'toolu_orphan'),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(1);
		expect(calls[0].latencyMs).toBeNull();
	});

	it('ignores non-tool events', () => {
		const events: EventLogRecord[] = [
			{ ...BASE, event: 'SessionStart', timestamp: '2026-04-03T17:00:00Z', source: 'startup', model: 'claude-opus-4-6' } as EventLogRecord,
			pre('Read', '2026-04-03T17:00:01Z'),
			{ ...BASE, event: 'UserPromptSubmit', timestamp: '2026-04-03T17:00:02Z', prompt_length: 100 } as EventLogRecord,
			post('Read', '2026-04-03T17:00:03Z', 'toolu_1'),
			{ ...BASE, event: 'Stop', timestamp: '2026-04-03T17:00:04Z', stop_hook_active: false } as EventLogRecord,
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(1);
		expect(calls[0].toolName).toBe('Read');
	});

	it('returns empty for no events', () => {
		const { calls, unmatchedPreCount } = pairToolEvents([]);
		expect(calls).toEqual([]);
		expect(unmatchedPreCount).toBe(0);
	});

	it('handles mixed success and failure for same tool', () => {
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			post('Read', '2026-04-03T17:00:01Z', 'toolu_r1', 80, 5000),
			pre('Read', '2026-04-03T17:00:02Z'),
			fail('Read', '2026-04-03T17:00:02Z', 'toolu_rf1', 'File not found'),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(2);
		expect(calls[0].failed).toBe(false);
		expect(calls[1].failed).toBe(true);
		expect(calls[1].error).toBe('File not found');
	});

	it('preserves inputKeys from Pre event on failure', () => {
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z', ['file_path']),
			fail('Read', '2026-04-03T17:00:01Z', 'toolu_f1'),
		];
		const { calls } = pairToolEvents(events);
		expect(calls[0].inputKeys).toEqual(['file_path']);
	});

	// --- Ambiguity and orphan tests (Codex findings) ---

	it('marks latency null for entire ambiguous batch', () => {
		// Two Pre(Read) before any Post → ambiguous pairing
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			pre('Read', '2026-04-03T17:00:01Z'),
			post('Read', '2026-04-03T17:00:02Z', 'toolu_r1', 80, 5000),
			post('Read', '2026-04-03T17:00:03Z', 'toolu_r2', 80, 3000),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(2);
		// Both Posts drain from ambiguous batch → both null
		expect(calls[0].latencyMs).toBeNull();
		expect(calls[1].latencyMs).toBeNull();
	});

	it('counts orphan Pre events at session end', () => {
		const events: EventLogRecord[] = [
			pre('Bash', '2026-04-03T17:00:00Z'),
			post('Bash', '2026-04-03T17:00:01Z', 'toolu_b1', 50, 500),
			pre('Read', '2026-04-03T17:00:02Z'),
			// Session ended — Read Pre never matched
		];
		const { calls, unmatchedPreCount } = pairToolEvents(events);
		expect(calls).toHaveLength(1);
		expect(unmatchedPreCount).toBe(1);
	});

	it('counts multiple orphan Pre events across tools', () => {
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			pre('Bash', '2026-04-03T17:00:01Z'),
			pre('Read', '2026-04-03T17:00:02Z'),
			// All unmatched
		];
		const { calls, unmatchedPreCount } = pairToolEvents(events);
		expect(calls).toHaveLength(0);
		expect(unmatchedPreCount).toBe(3);
	});

	it('handles concurrent subagent ambiguity (same tool, different contexts)', () => {
		// Simulates two subagents both calling Read concurrently
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			pre('Read', '2026-04-03T17:00:00Z'),  // Same timestamp — concurrent
			pre('Read', '2026-04-03T17:00:00Z'),  // Third concurrent
			post('Read', '2026-04-03T17:00:01Z', 'toolu_r1', 80, 2000),
			post('Read', '2026-04-03T17:00:01Z', 'toolu_r2', 80, 3000),
			post('Read', '2026-04-03T17:00:02Z', 'toolu_r3', 80, 1000),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(3);
		// All three drain from the same ambiguous batch → all null
		expect(calls[0].latencyMs).toBeNull();
		expect(calls[1].latencyMs).toBeNull();
		expect(calls[2].latencyMs).toBeNull();
	});

	it('recovers unambiguous pairing after ambiguous batch drains', () => {
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			pre('Read', '2026-04-03T17:00:00Z'),  // Ambiguous
			post('Read', '2026-04-03T17:00:01Z', 'toolu_r1', 80, 2000),
			post('Read', '2026-04-03T17:00:02Z', 'toolu_r2', 80, 3000),
			// Batch fully drained. New unambiguous call:
			pre('Read', '2026-04-03T17:00:03Z'),
			post('Read', '2026-04-03T17:00:04Z', 'toolu_r3', 80, 1000),
		];
		const { calls } = pairToolEvents(events);
		expect(calls).toHaveLength(3);
		expect(calls[0].latencyMs).toBeNull();
		expect(calls[1].latencyMs).toBeNull();
		// After ambiguous batch drains, new pairing is clean
		expect(calls[2].latencyMs).toBe(1000);
	});
});

// =============================================================================
// summarizeTools
// =============================================================================

describe('summarizeTools', () => {
	it('computes per-tool stats', () => {
		const { calls } = pairToolEvents([
			pre('Bash', '2026-04-03T17:00:00Z'),
			post('Bash', '2026-04-03T17:00:03Z', 'b1', 50, 1000),
			pre('Bash', '2026-04-03T17:00:04Z'),
			post('Bash', '2026-04-03T17:00:05Z', 'b2', 60, 2000),
			pre('Read', '2026-04-03T17:00:06Z'),
			post('Read', '2026-04-03T17:00:06Z', 'r1', 80, 5000),
		]);

		const summaries = summarizeTools(calls, null);
		expect(summaries).toHaveLength(2);

		// Sorted by call count descending — Bash first (2 calls)
		const bash = summaries[0];
		expect(bash.toolName).toBe('Bash');
		expect(bash.callCount).toBe(2);
		expect(bash.successCount).toBe(2);
		expect(bash.failureCount).toBe(0);
		expect(bash.successRate).toBe(1);
		expect(bash.avgLatencyMs).toBe(2000); // (3000 + 1000) / 2
		expect(bash.totalInputSize).toBe(110);
		expect(bash.avgInputSize).toBe(55);
		expect(bash.totalResponseSize).toBe(3000);

		const read = summaries[1];
		expect(read.toolName).toBe('Read');
		expect(read.callCount).toBe(1);
		expect(read.avgResponseSize).toBe(5000);
	});

	it('computes success rate with failures', () => {
		const { calls } = pairToolEvents([
			pre('Read', '2026-04-03T17:00:00Z'),
			post('Read', '2026-04-03T17:00:01Z', 'r1', 80, 5000),
			pre('Read', '2026-04-03T17:00:02Z'),
			fail('Read', '2026-04-03T17:00:02Z', 'rf1'),
			pre('Read', '2026-04-03T17:00:03Z'),
			post('Read', '2026-04-03T17:00:04Z', 'r2', 80, 3000),
		]);

		const summaries = summarizeTools(calls, null);
		expect(summaries).toHaveLength(1);
		expect(summaries[0].successRate).toBeCloseTo(2 / 3);
		expect(summaries[0].failureCount).toBe(1);
	});

	it('computes responseSizeFraction across tools', () => {
		const { calls } = pairToolEvents([
			pre('Bash', '2026-04-03T17:00:00Z'),
			post('Bash', '2026-04-03T17:00:01Z', 'b1', 50, 1000),
			pre('Read', '2026-04-03T17:00:02Z'),
			post('Read', '2026-04-03T17:00:03Z', 'r1', 80, 4000),
		]);

		const summaries = summarizeTools(calls, null);
		const bash = summaries.find((s) => s.toolName === 'Bash')!;
		const read = summaries.find((s) => s.toolName === 'Read')!;
		expect(bash.responseSizeFraction).toBeCloseTo(0.2);
		expect(read.responseSizeFraction).toBeCloseTo(0.8);
	});

	it('handles latency percentiles', () => {
		// 10 Bash calls with latencies 100, 200, ..., 1000
		const events: EventLogRecord[] = [];
		for (let i = 0; i < 10; i++) {
			const preTs = `2026-04-03T17:00:${String(i * 2).padStart(2, '0')}Z`;
			const postTs = new Date(new Date(preTs).getTime() + (i + 1) * 100).toISOString();
			events.push(pre('Bash', preTs));
			events.push(post('Bash', postTs, `b${i}`, 50, 500));
		}

		const summaries = summarizeTools(pairToolEvents(events).calls, null);
		expect(summaries[0].medianLatencyMs).toBeDefined();
		expect(summaries[0].p95LatencyMs).toBeDefined();
		expect(summaries[0].medianLatencyMs).toBeCloseTo(550);
		expect(summaries[0].p95LatencyMs!).toBeGreaterThanOrEqual(900);
	});

	it('returns null latency stats when all calls lack latency', () => {
		const { calls } = pairToolEvents([
			post('Read', '2026-04-03T17:00:01Z', 'r1'),
		]);
		const summaries = summarizeTools(calls, null);
		expect(summaries[0].avgLatencyMs).toBeNull();
		expect(summaries[0].medianLatencyMs).toBeNull();
		expect(summaries[0].p95LatencyMs).toBeNull();
	});

	it('returns empty array for no calls', () => {
		expect(summarizeTools([], null)).toEqual([]);
	});

	it('excludes failed calls from avgResponseSize', () => {
		const { calls } = pairToolEvents([
			pre('Read', '2026-04-03T17:00:00Z'),
			post('Read', '2026-04-03T17:00:01Z', 'r1', 80, 6000),
			pre('Read', '2026-04-03T17:00:02Z'),
			fail('Read', '2026-04-03T17:00:02Z', 'rf1'),
		]);

		const summaries = summarizeTools(calls, null);
		expect(summaries[0].avgResponseSize).toBe(6000);
	});

	// --- Context cost tests (Codex finding) ---

	it('computes context tokens from response bytes (chars/4)', () => {
		const { calls } = pairToolEvents([
			pre('Read', '2026-04-03T17:00:00Z'),
			post('Read', '2026-04-03T17:00:01Z', 'r1', 80, 4000),
		]);

		const summaries = summarizeTools(calls, null);
		expect(summaries[0].totalContextTokens).toBe(1000); // 4000 / 4
		expect(summaries[0].estimatedContextCost).toBeNull(); // no pricing
	});

	it('computes estimated context cost when pricing provided', () => {
		const { calls } = pairToolEvents([
			pre('Read', '2026-04-03T17:00:00Z'),
			post('Read', '2026-04-03T17:00:01Z', 'r1', 80, 4000),
		]);

		// cacheRead rate for claude-opus-4-6 is $1.25 per 1M tokens
		const summaries = summarizeTools(calls, 1.25);
		expect(summaries[0].totalContextTokens).toBe(1000);
		expect(summaries[0].estimatedContextCost).toBeCloseTo(1000 * 1.25 / 1_000_000);
		expect(summaries[0].costPerCall).toBeCloseTo(1000 * 1.25 / 1_000_000);
	});
});

// =============================================================================
// computeToolAnalysis (integration)
// =============================================================================

describe('computeToolAnalysis', () => {
	it('computes full analysis from raw events', () => {
		const events: EventLogRecord[] = [
			{ ...BASE, event: 'SessionStart', timestamp: '2026-04-03T17:00:00Z', source: 'startup', model: 'claude-opus-4-6' } as EventLogRecord,
			pre('Bash', '2026-04-03T17:00:01Z'),
			post('Bash', '2026-04-03T17:00:04Z', 'b1', 50, 1000),
			pre('Read', '2026-04-03T17:00:05Z'),
			post('Read', '2026-04-03T17:00:05Z', 'r1', 80, 5000),
			pre('Read', '2026-04-03T17:00:06Z'),
			fail('Read', '2026-04-03T17:00:06Z', 'rf1', 'File not found'),
			{ ...BASE, event: 'SessionEnd', timestamp: '2026-04-03T17:00:10Z', reason: 'exit' } as EventLogRecord,
		];

		const analysis = computeToolAnalysis(events);
		expect(analysis.totalCalls).toBe(3);
		expect(analysis.totalSuccesses).toBe(2);
		expect(analysis.totalFailures).toBe(1);
		expect(analysis.overallSuccessRate).toBeCloseTo(2 / 3);
		expect(analysis.totalResponseBytes).toBe(6000);
		expect(analysis.summaries).toHaveLength(2);
		expect(analysis.calls).toHaveLength(3);
		expect(analysis.unmatchedPreCount).toBe(0);
	});

	it('returns zero-state for no tool events', () => {
		const events: EventLogRecord[] = [
			{ ...BASE, event: 'SessionStart', timestamp: '2026-04-03T17:00:00Z', source: 'startup', model: 'claude-opus-4-6' } as EventLogRecord,
		];

		const analysis = computeToolAnalysis(events);
		expect(analysis.totalCalls).toBe(0);
		expect(analysis.overallSuccessRate).toBe(0);
		expect(analysis.summaries).toEqual([]);
		expect(analysis.unmatchedPreCount).toBe(0);
	});

	it('handles all-failure session', () => {
		const events: EventLogRecord[] = [
			pre('Bash', '2026-04-03T17:00:00Z'),
			fail('Bash', '2026-04-03T17:00:01Z', 'bf1', 'exit 1'),
			pre('Read', '2026-04-03T17:00:02Z'),
			fail('Read', '2026-04-03T17:00:02Z', 'rf1', 'not found'),
		];

		const analysis = computeToolAnalysis(events);
		expect(analysis.totalCalls).toBe(2);
		expect(analysis.totalSuccesses).toBe(0);
		expect(analysis.overallSuccessRate).toBe(0);
	});

	it('tracks unmatched Pre events in analysis', () => {
		const events: EventLogRecord[] = [
			pre('Bash', '2026-04-03T17:00:00Z'),
			post('Bash', '2026-04-03T17:00:01Z', 'b1', 50, 500),
			pre('Read', '2026-04-03T17:00:02Z'),
			pre('Bash', '2026-04-03T17:00:03Z'),
		];

		const analysis = computeToolAnalysis(events);
		expect(analysis.totalCalls).toBe(1);
		expect(analysis.unmatchedPreCount).toBe(2);
	});

	it('uses pricing from apiCallGroups for context cost', () => {
		const events: EventLogRecord[] = [
			pre('Read', '2026-04-03T17:00:00Z'),
			post('Read', '2026-04-03T17:00:01Z', 'r1', 80, 4000),
		];
		const groups = [{
			messageId: 'msg-1',
			requestId: 'req-1',
			model: 'claude-opus-4-6',
			timestamp: '2026-04-03T17:00:00Z',
			usage: { input_tokens: 1000, output_tokens: 200 },
			contentBlocks: [],
			stopReason: 'end_turn',
			isSynthetic: false,
		}];

		const analysis = computeToolAnalysis(events, groups);
		const readSummary = analysis.summaries[0];
		expect(readSummary.totalContextTokens).toBe(1000);
		expect(readSummary.estimatedContextCost).not.toBeNull();
		expect(readSummary.costPerCall).not.toBeNull();
	});
});
