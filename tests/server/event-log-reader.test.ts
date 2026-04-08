import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readEventLog } from '$lib/server/event-log-reader.js';

const FIXTURE = resolve('tests/fixtures/logs/test-session.jsonl');

describe('readEventLog', () => {
	it('parses all 41 event records from fixture', async () => {
		const { events, skippedLines } = await readEventLog(FIXTURE);
		expect(events).toHaveLength(41);
		expect(skippedLines).toBe(0);
	});

	it('correctly types SessionStart event', async () => {
		const { events } = await readEventLog(FIXTURE);
		const start = events.find((e) => e.event === 'SessionStart');
		expect(start).toBeDefined();
		expect(start!.session_id).toBe('test-session');
		expect((start as { model: string }).model).toBe('claude-opus-4-6[1m]');
	});

	it('correctly types SessionEnd event', async () => {
		const { events } = await readEventLog(FIXTURE);
		const end = events.find((e) => e.event === 'SessionEnd');
		expect(end).toBeDefined();
		expect((end as { reason: string }).reason).toBe('prompt_input_exit');
	});

	it('has correct event type counts', async () => {
		const { events } = await readEventLog(FIXTURE);
		const counts: Record<string, number> = {};
		for (const e of events) {
			counts[e.event] = (counts[e.event] ?? 0) + 1;
		}
		expect(counts).toEqual({
			SessionStart: 1,
			UserPromptSubmit: 4,
			PreToolUse: 15,
			PostToolUse: 12,
			PostToolUseFailure: 3,
			SubagentStart: 1,
			SubagentStop: 1,
			Stop: 3,
			SessionEnd: 1,
		});
	});

	it('has PostToolUse with tool_use_id and sizes', async () => {
		const { events } = await readEventLog(FIXTURE);
		const post = events.find(
			(e) => e.event === 'PostToolUse' && (e as { tool_name: string }).tool_name === 'Read',
		);
		expect(post).toBeDefined();
		const typed = post as {
			tool_use_id: string;
			tool_input_size: number;
			tool_response_size: number;
		};
		expect(typed.tool_use_id).toBeDefined();
		expect(typed.tool_input_size).toBeGreaterThan(0);
		expect(typed.tool_response_size).toBeGreaterThan(0);
	});

	it('has PostToolUseFailure with error message', async () => {
		const { events } = await readEventLog(FIXTURE);
		const failures = events.filter((e) => e.event === 'PostToolUseFailure');
		expect(failures).toHaveLength(3);
		for (const f of failures) {
			expect((f as { error: string }).error).toBeTruthy();
		}
	});

	it('preserves chronological order', async () => {
		const { events } = await readEventLog(FIXTURE);
		for (let i = 1; i < events.length; i++) {
			expect(events[i].timestamp >= events[i - 1].timestamp).toBe(true);
		}
	});
});
