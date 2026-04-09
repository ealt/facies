import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { discoverSessions } from '$lib/server/discovery.js';

const LOGS_DIR = resolve('tests/fixtures/logs');

describe('discoverSessions', () => {
	it('discovers the test session from event logs', async () => {
		const sessions = await discoverSessions(LOGS_DIR);
		expect(sessions).toHaveLength(1);
	});

	it('extracts correct session metadata', async () => {
		const sessions = await discoverSessions(LOGS_DIR);
		const session = sessions[0];
		expect(session.sessionId).toBe('test-session');
		expect(session.model).toBe('claude-opus-4-6[1m]');
		expect(session.cwd).toBe('/Users/testuser/Documents/test-project');
		expect(session.startTimestamp).toBe('2026-04-03T17:44:34Z');
	});

	it('derives transcript path from first event line', async () => {
		const sessions = await discoverSessions(LOGS_DIR);
		expect(sessions[0].transcriptPath).toBe(
			'/Users/testuser/.claude/projects/-test-project/test-session.jsonl',
		);
	});

	it('derives session directory from transcript path', async () => {
		const sessions = await discoverSessions(LOGS_DIR);
		expect(sessions[0].sessionDir).toBe(
			'/Users/testuser/.claude/projects/-test-project/test-session',
		);
	});

	it('skips _diagnostics.jsonl', async () => {
		const sessions = await discoverSessions(LOGS_DIR);
		const diagnostics = sessions.find((s) => s.sessionId === '_diagnostics');
		expect(diagnostics).toBeUndefined();
	});

	it('returns empty for nonexistent directory', async () => {
		const sessions = await discoverSessions('/nonexistent/path');
		expect(sessions).toHaveLength(0);
	});
});
