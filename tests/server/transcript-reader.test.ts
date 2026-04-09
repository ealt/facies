import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { readTranscript } from '$lib/server/transcript-reader.js';

const FIXTURE = resolve('tests/fixtures/projects/-test-project/test-session.jsonl');

describe('readTranscript', () => {
	it('parses all 60 records from fixture', async () => {
		const { records, skippedLines } = await readTranscript(FIXTURE);
		expect(records).toHaveLength(60);
		expect(skippedLines).toBe(0);
	});

	it('has correct record type counts', async () => {
		const { records } = await readTranscript(FIXTURE);
		const counts: Record<string, number> = {};
		for (const r of records) {
			counts[r.type] = (counts[r.type] ?? 0) + 1;
		}
		expect(counts['user']).toBe(15);
		expect(counts['assistant']).toBe(25);
		expect(counts['system']).toBe(10);
		expect(counts['permission-mode']).toBe(2);
		expect(counts['file-history-snapshot']).toBe(4);
		expect(counts['attachment']).toBe(2);
		expect(counts['custom-title']).toBe(1);
		expect(counts['last-prompt']).toBe(1);
	});

	it('extracts title from custom-title record', async () => {
		const { title } = await readTranscript(FIXTURE);
		expect(title).toBe('Session Analytics Web UI');
	});

	it('extracts slug from first record that has one', async () => {
		const { slug } = await readTranscript(FIXTURE);
		expect(slug).toBe('test-fixture-session');
	});

	describe('API call grouping', () => {
		it('produces 12 non-synthetic API call groups', async () => {
			const { apiCallGroups } = await readTranscript(FIXTURE);
			expect(apiCallGroups).toHaveLength(12);
		});

		it('skips the synthetic record', async () => {
			const { apiCallGroups } = await readTranscript(FIXTURE);
			const synthetic = apiCallGroups.find((g) => g.model === '<synthetic>');
			expect(synthetic).toBeUndefined();
		});

		it('populates messageId from message.id', async () => {
			const { apiCallGroups } = await readTranscript(FIXTURE);
			const group1 = apiCallGroups.find(
				(g) => g.messageId === 'msg_01TestMsg000000001',
			);
			expect(group1).toBeDefined();
			expect(group1!.requestId).toBe('req_01TestFixtureReq00001');
		});

		it('produces no warnings for well-formed fixture data', async () => {
			const { warnings } = await readTranscript(FIXTURE);
			expect(warnings).toHaveLength(0);
		});

		it('merges streaming chunks for multi-chunk API calls', async () => {
			const { apiCallGroups } = await readTranscript(FIXTURE);
			// msg_01TestMsg000000001 has 5 chunks: thinking, text, tool_use x3
			const group1 = apiCallGroups.find(
				(g) => g.messageId === 'msg_01TestMsg000000001',
			);
			expect(group1).toBeDefined();
			expect(group1!.contentBlocks).toHaveLength(5);

			const blockTypes = group1!.contentBlocks.map((b) => b.type);
			expect(blockTypes).toEqual(['thinking', 'text', 'tool_use', 'tool_use', 'tool_use']);
		});

		it('takes usage from first chunk (identical across chunks)', async () => {
			const { apiCallGroups } = await readTranscript(FIXTURE);
			const group1 = apiCallGroups.find(
				(g) => g.messageId === 'msg_01TestMsg000000001',
			);
			expect(group1!.usage.cache_creation_input_tokens).toBe(8301);
			expect(group1!.usage.cache_read_input_tokens).toBe(11269);
			expect(group1!.usage.output_tokens).toBe(28);
		});

		it('resolves stop_reason from last chunk that has one', async () => {
			const { apiCallGroups } = await readTranscript(FIXTURE);
			// msg_01TestMsg000000001: all chunks have stop_reason: null
			const group1 = apiCallGroups.find(
				(g) => g.messageId === 'msg_01TestMsg000000001',
			);
			expect(group1!.stopReason).toBeNull();

			// msg_01TestMsg000000004 (single chunk): stop_reason: "end_turn"
			const endTurnGroup = apiCallGroups.find(
				(g) =>
					g.messageId === 'msg_01TestMsg000000004' && g.stopReason === 'end_turn',
			);
			expect(endTurnGroup).toBeDefined();
		});

		it('groups are sorted chronologically', async () => {
			const { apiCallGroups } = await readTranscript(FIXTURE);
			for (let i = 1; i < apiCallGroups.length; i++) {
				expect(apiCallGroups[i].timestamp >= apiCallGroups[i - 1].timestamp).toBe(true);
			}
		});

		it('preserves requestId for turn association', async () => {
			const { apiCallGroups } = await readTranscript(FIXTURE);
			// req_01TestFixtureReq00002 spans 3 API calls (msg_02, msg_03, msg_04)
			const req02Groups = apiCallGroups.filter(
				(g) => g.requestId === 'req_01TestFixtureReq00002',
			);
			expect(req02Groups).toHaveLength(3);
		});
	});

	describe('tool result normalization', () => {
		it('extracts tool results from user records', async () => {
			const { toolResults } = await readTranscript(FIXTURE);
			expect(toolResults.length).toBeGreaterThan(0);
		});

		it('resolves tool names from API call groups', async () => {
			const { toolResults } = await readTranscript(FIXTURE);
			const agentResult = toolResults.find((r) => r.toolName === 'Agent');
			expect(agentResult).toBeDefined();

			const bashResult = toolResults.find((r) => r.toolName === 'Bash');
			expect(bashResult).toBeDefined();
		});

		it('enriches with structured file metadata when available', async () => {
			const { toolResults } = await readTranscript(FIXTURE);
			const fileResult = toolResults.find((r) => r.sourceFile !== undefined);
			expect(fileResult).toBeDefined();
			expect(fileResult!.sourceFile!.filePath).toBeTruthy();
			expect(fileResult!.sourceFile!.numLines).toBeGreaterThan(0);
		});

		it('handles string toolUseResult without enrichment', async () => {
			const { toolResults } = await readTranscript(FIXTURE);
			// Bash tool results have string toolUseResult — no sourceFile enrichment
			const bashResults = toolResults.filter((r) => r.toolName === 'Bash');
			for (const r of bashResults) {
				expect(r.sourceFile).toBeUndefined();
			}
		});

		it('marks errors correctly', async () => {
			const { toolResults } = await readTranscript(FIXTURE);
			// All tool_result blocks in the fixture have is_error unset (default false)
			for (const r of toolResults) {
				expect(r.isError).toBe(false);
			}
		});
	});

	describe('record details', () => {
		it('has compact_boundary system record with preTokens', async () => {
			const { records } = await readTranscript(FIXTURE);
			const compaction = records.find(
				(r) =>
					r.type === 'system' &&
					'subtype' in r &&
					(r as { subtype: string }).subtype === 'compact_boundary',
			);
			expect(compaction).toBeDefined();
			const typed = compaction as { compactMetadata: { preTokens: number } };
			expect(typed.compactMetadata.preTokens).toBe(180000);
		});

		it('has api_error system record', async () => {
			const { records } = await readTranscript(FIXTURE);
			const apiError = records.find(
				(r) =>
					r.type === 'system' &&
					'subtype' in r &&
					(r as { subtype: string }).subtype === 'api_error',
			);
			expect(apiError).toBeDefined();
			const typed = apiError as { apiError: { message: string; retryInMs: number } };
			expect(typed.apiError.message).toBe('Overloaded');
			expect(typed.apiError.retryInMs).toBe(5000);
		});

		it('has compact summary user record with isCompactSummary', async () => {
			const { records } = await readTranscript(FIXTURE);
			const compactSummary = records.find(
				(r) =>
					r.type === 'user' &&
					'isCompactSummary' in r &&
					(r as { isCompactSummary: boolean }).isCompactSummary === true,
			);
			expect(compactSummary).toBeDefined();
			expect(
				(compactSummary as { isVisibleInTranscriptOnly: boolean })
					.isVisibleInTranscriptOnly,
			).toBe(true);
		});

		it('has user records with various toolUseResult shapes', async () => {
			const { records } = await readTranscript(FIXTURE);
			const userRecords = records.filter((r) => r.type === 'user' && 'toolUseResult' in r);

			// Structured file result (Read tool)
			const fileResult = userRecords.find(
				(r) =>
					'toolUseResult' in r &&
					typeof (r as { toolUseResult: unknown }).toolUseResult === 'object' &&
					(r as { toolUseResult: { type: string } }).toolUseResult?.type === 'text',
			);
			expect(fileResult).toBeDefined();

			// String result (Bash/Write tools)
			const stringResult = userRecords.find(
				(r) =>
					'toolUseResult' in r &&
					typeof (r as { toolUseResult: unknown }).toolUseResult === 'string',
			);
			expect(stringResult).toBeDefined();

			// Agent result (structured object with status/agentId)
			const agentResult = userRecords.find(
				(r) =>
					'toolUseResult' in r &&
					typeof (r as { toolUseResult: unknown }).toolUseResult === 'object' &&
					'status' in
						((r as { toolUseResult: Record<string, unknown> }).toolUseResult ?? {}),
			);
			expect(agentResult).toBeDefined();
		});
	});
});

describe('readTranscript — fallback grouping', () => {
	let tmpDir: string;

	async function writeAndParse(lines: object[]): ReturnType<typeof readTranscript> {
		tmpDir = await mkdtemp(join(tmpdir(), 'facies-test-'));
		const filePath = join(tmpDir, 'test.jsonl');
		await writeFile(filePath, lines.map((l) => JSON.stringify(l)).join('\n'));
		return readTranscript(filePath);
	}

	afterEach(async () => {
		if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
	});

	it('warns when assistant record is missing message.id and falls back to requestId', async () => {
		const record = {
			parentUuid: null,
			isSidechain: false,
			type: 'assistant',
			uuid: 'test-uuid-001',
			timestamp: '2026-01-01T00:00:00Z',
			requestId: 'req_fallback',
			message: {
				model: 'claude-opus-4-6',
				// id intentionally omitted
				type: 'message',
				role: 'assistant',
				content: [{ type: 'text', text: 'hello' }],
				stop_reason: 'end_turn',
				stop_sequence: null,
				usage: { input_tokens: 100, output_tokens: 10 },
			},
		};
		const { apiCallGroups, warnings } = await writeAndParse([record]);
		expect(apiCallGroups).toHaveLength(1);
		expect(apiCallGroups[0].messageId).toBeNull();
		expect(apiCallGroups[0].requestId).toBe('req_fallback');
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('missing message.id');
	});

	it('warns when assistant record is missing both message.id and requestId', async () => {
		const record = {
			parentUuid: null,
			isSidechain: false,
			type: 'assistant',
			uuid: 'test-uuid-002',
			timestamp: '2026-01-01T00:00:00Z',
			// requestId intentionally omitted
			message: {
				model: 'claude-opus-4-6',
				// id intentionally omitted
				type: 'message',
				role: 'assistant',
				content: [{ type: 'text', text: 'hello' }],
				stop_reason: 'end_turn',
				stop_sequence: null,
				usage: { input_tokens: 100, output_tokens: 10 },
			},
		};
		const { apiCallGroups, warnings } = await writeAndParse([record]);
		expect(apiCallGroups).toHaveLength(1);
		expect(apiCallGroups[0].messageId).toBeNull();
		expect(apiCallGroups[0].requestId).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('missing both message.id and requestId');
	});
});
