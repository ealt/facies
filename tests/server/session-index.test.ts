import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdtemp, rm, cp, writeFile, utimes, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { getSessionIndex, normalizeModel } from '$lib/server/session-index.js';

const FIXTURES = resolve('tests/fixtures');

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
});

describe('getSessionIndex', () => {
	let tmpDir: string;

	afterEach(async () => {
		if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
	});

	it('discovers sessions and computes summaries from fixture data', async () => {
		// Copy fixtures to a tmp dir that mirrors ~/.claude/ structure
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });

		const cacheFile = join(tmpDir, '.cache', 'session-index.json');
		const index = await getSessionIndex(tmpDir, cacheFile);

		expect(index.version).toBe(1);
		expect(index.sessions).toHaveLength(1);

		const session = index.sessions[0];
		expect(session.sessionId).toBe('test-session');
		expect(session.model).toBe('claude-opus-4-6');
		expect(session.project).toBe('-test-project');
	});

	it('computes correct metadata from event log', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });

		const cacheFile = join(tmpDir, '.cache', 'session-index.json');
		const index = await getSessionIndex(tmpDir, cacheFile);
		const session = index.sessions[0];

		expect(session.startTime).toBe('2026-04-03T17:44:34Z');
		expect(session.endTime).toBe('2026-04-04T01:15:24Z');
		expect(session.durationMs).toBeGreaterThan(0);
		expect(session.turns).toBe(4); // 4 UserPromptSubmit events
		expect(session.toolCallCount).toBe(12); // 12 PostToolUse events
	});

	it('computes token totals from transcript API call groups', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });

		const cacheFile = join(tmpDir, '.cache', 'session-index.json');
		const index = await getSessionIndex(tmpDir, cacheFile);
		const session = index.sessions[0];

		expect(session.totalInputTokens).toBeGreaterThan(0);
		expect(session.totalOutputTokens).toBeGreaterThan(0);
	});

	it('extracts title from custom-title transcript record', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });

		const cacheFile = join(tmpDir, '.cache', 'session-index.json');
		const index = await getSessionIndex(tmpDir, cacheFile);

		expect(index.sessions[0].title).toBe('Session Analytics Web UI');
	});

	it('counts compaction events from transcript', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });

		const cacheFile = join(tmpDir, '.cache', 'session-index.json');
		const index = await getSessionIndex(tmpDir, cacheFile);

		expect(index.sessions[0].compactionCount).toBe(1);
	});

	it('discovers subagents', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });

		const cacheFile = join(tmpDir, '.cache', 'session-index.json');
		const index = await getSessionIndex(tmpDir, cacheFile);

		expect(index.sessions[0].subagentCount).toBe(1);
	});

	it('writes cache file and reuses on second call', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });

		const cacheFile = join(tmpDir, '.cache', 'session-index.json');

		const index1 = await getSessionIndex(tmpDir, cacheFile);
		const index2 = await getSessionIndex(tmpDir, cacheFile);

		expect(index2.sessions).toHaveLength(index1.sessions.length);
		expect(index2.sessions[0].sessionId).toBe(index1.sessions[0].sessionId);
	});

	it('returns empty index for nonexistent directory', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		const cacheFile = join(tmpDir, '.cache', 'session-index.json');

		const index = await getSessionIndex('/nonexistent/path', cacheFile);
		expect(index.sessions).toHaveLength(0);
	});

	it('refreshes when event log mtime changes', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });
		const cacheFile = join(tmpDir, '.cache', 'session-index.json');

		const index1 = await getSessionIndex(tmpDir, cacheFile);
		const mtime1 = index1.sessions[0].eventLogMtime;

		// Touch the event log to change mtime
		const eventLog = join(tmpDir, 'logs', 'test-session.jsonl');
		const future = new Date(Date.now() + 10_000);
		await utimes(eventLog, future, future);

		const index2 = await getSessionIndex(tmpDir, cacheFile);
		expect(index2.sessions[0].eventLogMtime).toBeGreaterThan(mtime1);
	});

	it('removes stale entries when event log is deleted', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });
		const cacheFile = join(tmpDir, '.cache', 'session-index.json');

		const index1 = await getSessionIndex(tmpDir, cacheFile);
		expect(index1.sessions).toHaveLength(1);

		// Delete the event log
		await unlink(join(tmpDir, 'logs', 'test-session.jsonl'));

		const index2 = await getSessionIndex(tmpDir, cacheFile);
		expect(index2.sessions).toHaveLength(0);
	});

	it('handles malformed cache gracefully', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });
		const cacheFile = join(tmpDir, '.cache', 'session-index.json');

		// Write a structurally invalid cache
		const { mkdir } = await import('node:fs/promises');
		await mkdir(join(tmpDir, '.cache'), { recursive: true });
		await writeFile(cacheFile, '{"version":1}');

		// Should rebuild cleanly instead of crashing
		const index = await getSessionIndex(tmpDir, cacheFile);
		expect(index.sessions).toHaveLength(1);
		expect(index.sessions[0].sessionId).toBe('test-session');
	});

	it('reports skippedLines=0 for well-formed fixture data', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });
		const cacheFile = join(tmpDir, '.cache', 'session-index.json');

		const index = await getSessionIndex(tmpDir, cacheFile);
		expect(index.sessions[0].skippedLines).toBe(0);
	});

	it('propagates skippedLines when transcript has malformed lines', async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-idx-'));
		await cp(FIXTURES, tmpDir, { recursive: true });

		// Append malformed lines to transcript
		const transcript = join(tmpDir, 'projects', '-test-project', 'test-session.jsonl');
		const { readFile, appendFile } = await import('node:fs/promises');
		await appendFile(transcript, '\nthis is not json\nalso bad\n');

		const cacheFile = join(tmpDir, '.cache', 'session-index.json');
		const index = await getSessionIndex(tmpDir, cacheFile);
		expect(index.sessions[0].skippedLines).toBe(2);
	});
});
