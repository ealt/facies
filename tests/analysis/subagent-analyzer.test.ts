import { describe, it, expect } from 'vitest';
import { computeSubagentSummaries } from '$lib/analysis/subagent-analyzer.js';
import type {
	EventLogRecord,
	SubagentStartEvent,
	SubagentStopEvent,
	ApiCallGroup,
	Usage,
} from '$lib/types.js';
import type { SubagentData } from '$lib/server/subagent-reader.js';

const BASE = {
	session_id: 'test',
	cwd: '/test',
	transcript_path: '/test/transcript.jsonl',
};

function subagentStart(agentId: string, agentType: string, ts: string): SubagentStartEvent {
	return { ...BASE, event: 'SubagentStart', timestamp: ts, agent_id: agentId, agent_type: agentType };
}

function subagentStop(agentId: string, agentType: string, ts: string): SubagentStopEvent {
	return {
		...BASE, event: 'SubagentStop', timestamp: ts,
		agent_id: agentId, agent_type: agentType,
		agent_transcript_path: `/test/subagents/agent-${agentId}.jsonl`,
	};
}

function makeUsage(input: number, output: number, cacheRead = 0, cacheCreate = 0): Usage {
	return {
		input_tokens: input,
		output_tokens: output,
		cache_read_input_tokens: cacheRead,
		cache_creation_input_tokens: cacheCreate,
	};
}

function makeApiGroup(model: string, ts: string, usage: Usage): ApiCallGroup {
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

/** API call group whose content is a single text block. */
function makeTextApiGroup(text: string, ts = '2026-04-03T17:00:05Z'): ApiCallGroup {
	return {
		messageId: `msg-${ts}`,
		requestId: null,
		model: 'claude-opus-4-6',
		timestamp: ts,
		usage: makeUsage(100, 50),
		contentBlocks: [{ type: 'text', text }],
		stopReason: 'end_turn',
		isSynthetic: false,
	};
}

/** API call group whose content is a single tool_use block (no text). */
function makeToolOnlyApiGroup(ts = '2026-04-03T17:00:10Z'): ApiCallGroup {
	return {
		messageId: `msg-${ts}`,
		requestId: null,
		model: 'claude-opus-4-6',
		timestamp: ts,
		usage: makeUsage(100, 50),
		contentBlocks: [{ type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/test' } }],
		stopReason: 'tool_use',
		isSynthetic: false,
	};
}

function makeSubagentData(
	agentId: string,
	agentType: string,
	description: string,
	apiCallGroups: ApiCallGroup[] = [],
	records: SubagentData['records'] = [],
	toolResults: SubagentData['toolResults'] = [],
): SubagentData {
	return {
		agentId,
		meta: { agentType, description },
		transcriptPath: `/test/subagents/agent-${agentId}.jsonl`,
		records,
		apiCallGroups,
		toolResults,
		skippedLines: 0,
	};
}

// =============================================================================
// computeSubagentSummaries
// =============================================================================

describe('computeSubagentSummaries', () => {
	it('returns empty array for no subagents', () => {
		const result = computeSubagentSummaries([], []);
		expect(result).toEqual([]);
	});

	it('computes basic summary from SubagentStart/SubagentStop events', () => {
		const events: EventLogRecord[] = [
			subagentStart('abc', 'Explore', '2026-04-03T17:00:00Z'),
			subagentStop('abc', 'Explore', '2026-04-03T17:00:30Z'),
		];

		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Find config files', [
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:00:05Z', makeUsage(1000, 200)),
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:00:15Z', makeUsage(2000, 300)),
			]),
		];

		const result = computeSubagentSummaries(subagents, events);
		expect(result).toHaveLength(1);

		const s = result[0];
		expect(s.agentId).toBe('abc');
		expect(s.agentType).toBe('Explore');
		expect(s.description).toBe('Find config files');
		expect(s.startTime).toBe('2026-04-03T17:00:00Z');
		expect(s.endTime).toBe('2026-04-03T17:00:30Z');
		expect(s.durationMs).toBe(30_000);
		expect(s.totalInputTokens).toBe(3000);
		expect(s.totalOutputTokens).toBe(500);
	});

	it('falls back to API call timestamps when events are missing', () => {
		const subagents: SubagentData[] = [
			makeSubagentData('xyz', 'Plan', 'Design schema', [
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:01:00Z', makeUsage(500, 100)),
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:02:00Z', makeUsage(600, 150)),
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result).toHaveLength(1);
		expect(result[0].startTime).toBe('2026-04-03T17:01:00Z');
		expect(result[0].endTime).toBe('2026-04-03T17:02:00Z');
		expect(result[0].durationMs).toBe(60_000);
	});

	it('counts internal tool calls from toolResults', () => {
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search', [], [], [
				{ toolUseId: 't1', toolName: 'Read', content: 'data', isError: false },
				{ toolUseId: 't2', toolName: 'Grep', content: 'matches', isError: false },
				{ toolUseId: 't3', toolName: 'Read', content: 'more', isError: false },
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].internalToolCalls).toBe(3);
	});

	it('extracts last assistant message from final API call group', () => {
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'general-purpose', 'Run task', [
				makeTextApiGroup('First response', '2026-04-03T17:00:05Z'),
				makeTextApiGroup('Final output here', '2026-04-03T17:00:15Z'),
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].lastAssistantMessage).toBe('Final output here');
	});

	it('returns null for lastAssistantMessage when no API call groups', () => {
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search'),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].lastAssistantMessage).toBeNull();
	});

	it('estimates context overhead from last assistant message length', () => {
		const message = 'A'.repeat(400); // 400 chars → ~100 tokens
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search', [
				makeTextApiGroup(message),
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].contextOverheadTokens).toBe(100);
	});

	it('returns null contextOverheadTokens when no assistant message', () => {
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search'),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].contextOverheadTokens).toBeNull();
	});

	it('skips synthetic API calls for token totals', () => {
		const syntheticGroup: ApiCallGroup = {
			messageId: null,
			requestId: null,
			model: 'claude-opus-4-6',
			timestamp: '2026-04-03T17:00:00Z',
			usage: makeUsage(9999, 9999),
			contentBlocks: [],
			stopReason: null,
			isSynthetic: true,
		};

		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search', [
				syntheticGroup,
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:00:05Z', makeUsage(500, 100)),
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].totalInputTokens).toBe(500);
		expect(result[0].totalOutputTokens).toBe(100);
	});

	it('computes cost from API call groups', () => {
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search', [
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:00:00Z', makeUsage(1000, 200)),
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		// Cost should be non-null (pricing exists for claude-opus-4-6)
		expect(result[0].totalCost).not.toBeNull();
		expect(result[0].totalCost).toBeGreaterThan(0);
	});

	it('sorts summaries by start time', () => {
		const events: EventLogRecord[] = [
			subagentStart('second', 'Explore', '2026-04-03T17:02:00Z'),
			subagentStop('second', 'Explore', '2026-04-03T17:03:00Z'),
			subagentStart('first', 'Plan', '2026-04-03T17:00:00Z'),
			subagentStop('first', 'Plan', '2026-04-03T17:01:00Z'),
		];

		const subagents: SubagentData[] = [
			makeSubagentData('second', 'Explore', 'Second task'),
			makeSubagentData('first', 'Plan', 'First task'),
		];

		const result = computeSubagentSummaries(subagents, events);
		expect(result[0].agentId).toBe('first');
		expect(result[1].agentId).toBe('second');
	});

	it('handles SubagentStart without SubagentStop (interrupted session)', () => {
		const events: EventLogRecord[] = [
			subagentStart('abc', 'Explore', '2026-04-03T17:00:00Z'),
			// No SubagentStop
		];

		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Interrupted search', [
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:00:05Z', makeUsage(500, 100)),
			]),
		];

		const result = computeSubagentSummaries(subagents, events);
		expect(result[0].startTime).toBe('2026-04-03T17:00:00Z');
		// endTime falls back to last API call timestamp
		expect(result[0].endTime).toBe('2026-04-03T17:00:05Z');
		expect(result[0].durationMs).toBe(5000);
	});

	it('handles multiple concurrent subagents', () => {
		const events: EventLogRecord[] = [
			subagentStart('a', 'Explore', '2026-04-03T17:00:00Z'),
			subagentStart('b', 'Explore', '2026-04-03T17:00:01Z'),
			subagentStop('a', 'Explore', '2026-04-03T17:00:30Z'),
			subagentStop('b', 'Explore', '2026-04-03T17:00:45Z'),
		];

		const subagents: SubagentData[] = [
			makeSubagentData('a', 'Explore', 'Task A', [
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:00:05Z', makeUsage(1000, 200)),
			]),
			makeSubagentData('b', 'Explore', 'Task B', [
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:00:10Z', makeUsage(800, 150)),
			]),
		];

		const result = computeSubagentSummaries(subagents, events);
		expect(result).toHaveLength(2);
		expect(result[0].agentId).toBe('a');
		expect(result[0].durationMs).toBe(30_000);
		expect(result[1].agentId).toBe('b');
		expect(result[1].durationMs).toBe(44_000);
	});

	it('handles subagent with no API calls and no events', () => {
		const subagents: SubagentData[] = [
			makeSubagentData('empty', 'unknown', ''),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result).toHaveLength(1);
		expect(result[0].startTime).toBe('');
		expect(result[0].endTime).toBeNull();
		expect(result[0].durationMs).toBeNull();
		expect(result[0].totalInputTokens).toBe(0);
		expect(result[0].totalOutputTokens).toBe(0);
		expect(result[0].internalToolCalls).toBe(0);
	});

	it('returns null lastAssistantMessage when final API group is tool-only', () => {
		// The last API call group has only tool_use blocks — no text.
		// Should NOT walk backwards to find an older text response.
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search', [
				makeTextApiGroup('Intermediate response', '2026-04-03T17:00:05Z'),
				makeToolOnlyApiGroup('2026-04-03T17:00:15Z'),
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].lastAssistantMessage).toBeNull();
		expect(result[0].contextOverheadTokens).toBeNull();
	});

	it('carries costIsLowerBound from session cost computation', () => {
		// Known model — costIsLowerBound should be false
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search', [
				makeApiGroup('claude-opus-4-6', '2026-04-03T17:00:00Z', makeUsage(1000, 200)),
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].costIsLowerBound).toBe(false);
	});

	it('sets costIsLowerBound true for unknown model', () => {
		const subagents: SubagentData[] = [
			makeSubagentData('abc', 'Explore', 'Search', [
				makeApiGroup('unknown-future-model', '2026-04-03T17:00:00Z', makeUsage(1000, 200)),
			]),
		];

		const result = computeSubagentSummaries(subagents, []);
		expect(result[0].costIsLowerBound).toBe(true);
	});
});
