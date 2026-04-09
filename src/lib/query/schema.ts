import type { SessionSummary } from '$lib/types.js';

export interface QueryField {
	key: string;
	accessor: (s: SessionSummary) => string | number | null;
	type: 'string' | 'number' | 'date';
}

export const QUERY_SCHEMA: QueryField[] = [
	{ key: 'title', accessor: (s) => s.title ?? s.sessionId, type: 'string' },
	{ key: 'project', accessor: (s) => s.project, type: 'string' },
	{ key: 'model', accessor: (s) => s.model, type: 'string' },
	{ key: 'started', accessor: (s) => s.startTime, type: 'date' },
	{ key: 'duration', accessor: (s) => s.durationMs, type: 'number' },
	{ key: 'turns', accessor: (s) => s.turns, type: 'number' },
	{
		key: 'total_tokens',
		accessor: (s) => s.totalInputTokens + s.totalOutputTokens,
		type: 'number',
	},
	{ key: 'input_tokens', accessor: (s) => s.totalInputTokens, type: 'number' },
	{ key: 'output_tokens', accessor: (s) => s.totalOutputTokens, type: 'number' },
	{ key: 'cost', accessor: (s) => s.totalCost, type: 'number' },
	{ key: 'compactions', accessor: (s) => s.compactionCount, type: 'number' },
	{ key: 'tool_calls', accessor: (s) => s.toolCallCount, type: 'number' },
	{ key: 'subagents', accessor: (s) => s.subagentCount, type: 'number' },
];

const fieldMap = new Map(QUERY_SCHEMA.map((f) => [f.key, f]));

export function lookupField(name: string): QueryField | undefined {
	return fieldMap.get(name);
}

export function fieldNames(): string[] {
	return QUERY_SCHEMA.map((f) => f.key);
}
