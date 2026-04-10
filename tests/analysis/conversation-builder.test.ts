import { describe, it, expect } from 'vitest';
import {
	buildConversationTree,
	flattenTree,
	type ConversationNode,
	type SubagentInput,
} from '$lib/analysis/conversation-builder.js';
import type {
	TranscriptRecord,
	ApiCallGroup,
	NormalizedToolResult,
	AssistantRecord,
	UserRecord,
	SystemRecord,
	Usage,
} from '$lib/types.js';

// =============================================================================
// Helpers
// =============================================================================

function makeUsage(input = 100, output = 50, cacheRead = 0, cacheCreate = 0): Usage {
	return {
		input_tokens: input,
		output_tokens: output,
		cache_read_input_tokens: cacheRead,
		cache_creation_input_tokens: cacheCreate,
	};
}

function makeAssistant(
	uuid: string,
	parentUuid: string | null,
	ts: string,
	messageId: string,
	opts: {
		model?: string;
		text?: string;
		thinking?: string;
		toolUse?: { id: string; name: string; input: Record<string, unknown> };
		stopReason?: string | null;
		requestId?: string;
		usage?: Usage;
	} = {},
): AssistantRecord {
	const content = [];
	if (opts.thinking) {
		content.push({ type: 'thinking' as const, thinking: opts.thinking, signature: 'sig' });
	}
	if (opts.text) {
		content.push({ type: 'text' as const, text: opts.text });
	}
	if (opts.toolUse) {
		content.push({ type: 'tool_use' as const, id: opts.toolUse.id, name: opts.toolUse.name, input: opts.toolUse.input });
	}

	return {
		type: 'assistant',
		uuid,
		parentUuid,
		isSidechain: false,
		timestamp: ts,
		requestId: opts.requestId,
		message: {
			model: opts.model ?? 'claude-opus-4-6',
			id: messageId,
			type: 'message',
			role: 'assistant',
			content,
			stop_reason: opts.stopReason ?? null,
			stop_sequence: null,
			usage: opts.usage ?? makeUsage(),
		},
	} as AssistantRecord;
}

function makeUserPrompt(
	uuid: string,
	parentUuid: string | null,
	ts: string,
	content: string,
): UserRecord {
	return {
		type: 'user',
		uuid,
		parentUuid,
		isSidechain: false,
		timestamp: ts,
		message: { role: 'user', content },
	} as UserRecord;
}

function makeToolResult(
	uuid: string,
	parentUuid: string | null,
	ts: string,
	toolUseId: string,
	content: string,
	isError = false,
): UserRecord {
	return {
		type: 'user',
		uuid,
		parentUuid,
		isSidechain: false,
		timestamp: ts,
		sourceToolAssistantUUID: parentUuid ?? undefined,
		message: {
			role: 'user',
			content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }],
		},
	} as unknown as UserRecord;
}

function makeSystemRecord(
	uuid: string,
	parentUuid: string | null,
	ts: string,
	subtype: string,
	opts: {
		compactMetadata?: { trigger: string; preTokens: number };
		durationMs?: number;
		apiError?: { message: string };
		content?: string;
	} = {},
): SystemRecord {
	return {
		type: 'system',
		uuid,
		parentUuid,
		isSidechain: false,
		timestamp: ts,
		subtype,
		content: opts.content,
		compactMetadata: opts.compactMetadata,
		durationMs: opts.durationMs,
		apiError: opts.apiError,
	} as SystemRecord;
}

function makeApiGroup(messageId: string, toolUseBlocks: { id: string; name: string }[] = []): ApiCallGroup {
	return {
		messageId,
		requestId: null,
		model: 'claude-opus-4-6',
		timestamp: '2026-04-03T17:45:00.000Z',
		usage: makeUsage(),
		contentBlocks: toolUseBlocks.map((t) => ({
			type: 'tool_use' as const,
			id: t.id,
			name: t.name,
			input: {},
		})),
		stopReason: 'end_turn',
		isSynthetic: false,
	};
}

// =============================================================================
// Tests
// =============================================================================

describe('buildConversationTree', () => {
	it('returns empty tree for empty input', () => {
		const tree = buildConversationTree([], []);
		expect(tree.roots).toHaveLength(0);
		expect(tree.nodeCount).toBe(0);
		expect(tree.orphanCount).toBe(0);
	});

	it('builds single user prompt as root', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
		];
		const tree = buildConversationTree(records, []);
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0].kind).toBe('user-prompt');
		expect((tree.roots[0] as any).content).toBe('Hello');
		expect(tree.nodeCount).toBe(1);
	});

	it('merges streaming assistant chunks by message.id', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', { thinking: 'Let me think...' }),
			makeAssistant('a2', 'a1', '2026-04-03T17:45:20.000Z', 'msg-001', { text: 'Here is my answer.' }),
			makeAssistant('a3', 'a2', '2026-04-03T17:45:30.000Z', 'msg-001', {
				toolUse: { id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } },
			}),
		];

		const tree = buildConversationTree(records, []);

		// User prompt → one merged assistant node (not three)
		expect(tree.roots).toHaveLength(1);
		const userNode = tree.roots[0];
		expect(userNode.kind).toBe('user-prompt');
		expect(userNode.children).toHaveLength(1);

		const assistant = userNode.children[0];
		expect(assistant.kind).toBe('assistant');
		const ar = assistant as any;
		expect(ar.thinkingBlocks).toHaveLength(1);
		expect(ar.textBlocks).toHaveLength(1);
		expect(ar.toolUseBlocks).toHaveLength(1);
		expect(ar.messageId).toBe('msg-001');
	});

	it('links tool results as children of assistant nodes', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Read a file'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', {
				toolUse: { id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } },
			}),
			makeToolResult('tr1', 'a1', '2026-04-03T17:45:20.000Z', 'tool-1', 'file contents here'),
		];

		const apiGroups = [makeApiGroup('msg-001', [{ id: 'tool-1', name: 'Read' }])];
		const tree = buildConversationTree(records, apiGroups);

		const flat = flattenTree(tree.roots);
		const toolResult = flat.find((n) => n.kind === 'tool-result');
		expect(toolResult).toBeDefined();
		expect((toolResult as any).toolName).toBe('Read');
		expect((toolResult as any).content).toBe('file contents here');
		expect((toolResult as any).isError).toBe(false);
	});

	it('marks error tool results', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Run bash'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', {
				toolUse: { id: 'tool-1', name: 'Bash', input: { command: 'exit 1' } },
			}),
			makeToolResult('tr1', 'a1', '2026-04-03T17:45:20.000Z', 'tool-1', 'Command failed', true),
		];
		const apiGroups = [makeApiGroup('msg-001', [{ id: 'tool-1', name: 'Bash' }])];
		const tree = buildConversationTree(records, apiGroups);

		const flat = flattenTree(tree.roots);
		const toolResult = flat.find((n) => n.kind === 'tool-result');
		expect((toolResult as any).isError).toBe(true);
	});

	it('handles parallel tool calls branching', () => {
		// Assistant makes two tool calls in one message; each gets its own tool result
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Do two things'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', {
				toolUse: { id: 'tool-1', name: 'Read', input: {} },
			}),
			makeAssistant('a2', 'a1', '2026-04-03T17:45:11.000Z', 'msg-001', {
				toolUse: { id: 'tool-2', name: 'Bash', input: {} },
			}),
			// Tool results point to respective tool_use chunks
			makeToolResult('tr1', 'a1', '2026-04-03T17:45:20.000Z', 'tool-1', 'Read result'),
			makeToolResult('tr2', 'a2', '2026-04-03T17:45:21.000Z', 'tool-2', 'Bash result'),
		];
		const apiGroups = [makeApiGroup('msg-001', [
			{ id: 'tool-1', name: 'Read' },
			{ id: 'tool-2', name: 'Bash' },
		])];

		const tree = buildConversationTree(records, apiGroups);

		// User → merged assistant → two tool results as children
		const assistant = tree.roots[0].children[0];
		expect(assistant.kind).toBe('assistant');
		expect(assistant.children).toHaveLength(2);
		expect(assistant.children[0].kind).toBe('tool-result');
		expect(assistant.children[1].kind).toBe('tool-result');
	});

	it('creates system event nodes', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', { text: 'Hi' }),
			makeSystemRecord('s1', 'a1', '2026-04-03T17:45:20.000Z', 'turn_duration', { durationMs: 5000 }),
		];
		const tree = buildConversationTree(records, []);

		const flat = flattenTree(tree.roots);
		const sys = flat.find((n) => n.kind === 'system');
		expect(sys).toBeDefined();
		expect((sys as any).subtype).toBe('turn_duration');
		expect((sys as any).durationMs).toBe(5000);
	});

	it('creates system node for compact_boundary', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			makeSystemRecord('s1', 'u1', '2026-04-03T17:45:10.000Z', 'compact_boundary', {
				compactMetadata: { trigger: 'auto', preTokens: 180000 },
			}),
		];
		const tree = buildConversationTree(records, []);

		const flat = flattenTree(tree.roots);
		const sys = flat.find((n) => n.kind === 'system');
		expect((sys as any).preTokens).toBe(180000);
	});

	it('creates system node for api_error', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			makeSystemRecord('s1', 'u1', '2026-04-03T17:45:10.000Z', 'api_error', {
				apiError: { message: 'Overloaded' },
				content: 'API error: overloaded',
			}),
		];
		const tree = buildConversationTree(records, []);

		const flat = flattenTree(tree.roots);
		const sys = flat.find((n) => n.kind === 'system');
		expect((sys as any).errorMessage).toBe('Overloaded');
	});

	it('identifies compaction summary user records', () => {
		const records: TranscriptRecord[] = [
			{
				type: 'user',
				uuid: 'u1',
				parentUuid: null,
				isSidechain: false,
				timestamp: '2026-04-03T17:45:00.000Z',
				isCompactSummary: true,
				isVisibleInTranscriptOnly: true,
				message: { role: 'user', content: 'Summary of the conversation so far.' },
			} as unknown as UserRecord,
		];
		const tree = buildConversationTree(records, []);

		expect(tree.roots[0].kind).toBe('user-prompt');
		expect((tree.roots[0] as any).isCompactSummary).toBe(true);
	});

	it('skips synthetic assistant records entirely', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			{
				type: 'assistant',
				uuid: 'synth1',
				parentUuid: 'u1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:10.000Z',
				message: {
					model: '<synthetic>',
					id: 'synth_id',
					type: 'message',
					role: 'assistant',
					content: [{ type: 'text', text: 'Rate limit message' }],
					stop_reason: 'stop_sequence',
					stop_sequence: '',
					usage: makeUsage(0, 0),
				},
			} as unknown as AssistantRecord,
		];
		const tree = buildConversationTree(records, []);

		const flat = flattenTree(tree.roots);
		// Synthetic records should not appear in the tree at all
		expect(flat).toHaveLength(1);
		expect(flat[0].kind).toBe('user-prompt');
	});

	it('assigns correct depths', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', { text: 'Hi' }),
			makeToolResult('tr1', 'a1', '2026-04-03T17:45:20.000Z', 'tool-1', 'result'),
		];
		const apiGroups = [makeApiGroup('msg-001', [{ id: 'tool-1', name: 'Read' }])];
		const tree = buildConversationTree(records, apiGroups);

		expect(tree.roots[0].depth).toBe(0);
		expect(tree.roots[0].children[0].depth).toBe(1);
		expect(tree.roots[0].children[0].children[0].depth).toBe(2);
	});

	it('sorts children by timestamp', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			// Children added in reverse order
			makeAssistant('a2', 'u1', '2026-04-03T17:46:00.000Z', 'msg-002', { text: 'Second' }),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:30.000Z', 'msg-001', { text: 'First' }),
		];
		const tree = buildConversationTree(records, []);

		expect(tree.roots[0].children).toHaveLength(2);
		expect(tree.roots[0].children[0].timestamp).toBe('2026-04-03T17:45:30.000Z');
		expect(tree.roots[0].children[1].timestamp).toBe('2026-04-03T17:46:00.000Z');
	});

	it('resolves orphans by walking ancestor chain', () => {
		// Record 'u1' → attachment (not in nodes) → 'a1'
		// The attachment parent is skipped, so a1's parent isn't in the node set.
		// It should walk up to find u1.
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			// Attachment — skipped by the builder (no node created)
			{
				type: 'attachment' as any,
				uuid: 'att1',
				parentUuid: 'u1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:05.000Z',
				attachment: { type: 'deferred_tools_delta' },
			} as unknown as TranscriptRecord,
			makeAssistant('a1', 'att1', '2026-04-03T17:45:10.000Z', 'msg-001', { text: 'Hi' }),
		];
		const tree = buildConversationTree(records, []);

		// a1 should be a child of u1 (resolved via ancestor walk)
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0].kind).toBe('user-prompt');
		expect(tree.roots[0].children).toHaveLength(1);
		expect(tree.roots[0].children[0].kind).toBe('assistant');
		expect(tree.orphanCount).toBe(0);
	});

	it('counts true orphans when ancestor chain is unresolvable', () => {
		const records: TranscriptRecord[] = [
			makeAssistant('a1', 'nonexistent', '2026-04-03T17:45:10.000Z', 'msg-001', { text: 'Orphaned' }),
		];
		const tree = buildConversationTree(records, []);

		expect(tree.roots).toHaveLength(1);
		expect(tree.orphanCount).toBe(1);
	});

	it('multi-turn conversation has correct structure', () => {
		const records: TranscriptRecord[] = [
			// Turn 1
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'First question'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', { text: 'First answer' }),
			makeSystemRecord('s1', 'a1', '2026-04-03T17:45:20.000Z', 'turn_duration', { durationMs: 10000 }),
			// Turn 2
			makeUserPrompt('u2', 's1', '2026-04-03T17:46:00.000Z', 'Second question'),
			makeAssistant('a2', 'u2', '2026-04-03T17:46:10.000Z', 'msg-002', { text: 'Second answer' }),
		];
		const tree = buildConversationTree(records, []);

		const flat = flattenTree(tree.roots);
		expect(flat).toHaveLength(5);
		// Verify the chain: u1 → a1 → s1 → u2 → a2
		expect(flat[0].kind).toBe('user-prompt');
		expect(flat[1].kind).toBe('assistant');
		expect(flat[2].kind).toBe('system');
		expect(flat[3].kind).toBe('user-prompt');
		expect(flat[4].kind).toBe('assistant');
	});

	it('deduplicates repeated content blocks across streaming chunks', () => {
		// Real transcripts repeat earlier blocks in later chunks
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', { thinking: 'Let me think' }),
			// Second chunk repeats thinking AND adds text
			{
				type: 'assistant',
				uuid: 'a2',
				parentUuid: 'a1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:20.000Z',
				message: {
					model: 'claude-opus-4-6',
					id: 'msg-001',
					type: 'message',
					role: 'assistant',
					content: [
						{ type: 'thinking', thinking: 'Let me think', signature: 'sig' },
						{ type: 'text', text: 'My answer' },
					],
					stop_reason: null,
					stop_sequence: null,
					usage: makeUsage(),
				},
			} as unknown as AssistantRecord,
		];
		const tree = buildConversationTree(records, []);
		const assistant = tree.roots[0].children[0] as any;
		// Should have 1 thinking + 1 text, not 2 thinking
		expect(assistant.thinkingBlocks).toHaveLength(1);
		expect(assistant.textBlocks).toHaveLength(1);
	});

	it('preserves stop reason from final streaming chunk', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', { text: 'thinking', stopReason: null }),
			makeAssistant('a2', 'a1', '2026-04-03T17:45:20.000Z', 'msg-001', { text: 'done', stopReason: 'end_turn' }),
		];
		const tree = buildConversationTree(records, []);
		const assistant = tree.roots[0].children[0] as any;
		expect(assistant.stopReason).toBe('end_turn');
	});

	it('skips file-history-snapshot and permission-mode records', () => {
		const records: TranscriptRecord[] = [
			{ type: 'permission-mode', permissionMode: 'plan', sessionId: 'test' } as any,
			{ type: 'file-history-snapshot', messageId: 'mid', snapshot: {}, isSnapshotUpdate: false } as any,
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
		];
		const tree = buildConversationTree(records, []);
		// Only the user prompt should be a node
		expect(tree.nodeCount).toBe(1);
	});

	it('groups assistant records without message.id by requestId', () => {
		// Assistant record without message.id but with requestId — should still become an assistant node
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			{
				type: 'assistant',
				uuid: 'a1',
				parentUuid: 'u1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:10.000Z',
				requestId: 'req-001',
				message: {
					model: 'claude-opus-4-6',
					id: undefined as any, // Missing message.id
					type: 'message',
					role: 'assistant',
					content: [{ type: 'text', text: 'Response without message.id' }],
					stop_reason: 'end_turn',
					stop_sequence: null,
					usage: makeUsage(),
				},
			} as unknown as AssistantRecord,
		];
		const tree = buildConversationTree(records, []);

		const flat = flattenTree(tree.roots);
		const assistant = flat.find((n) => n.kind === 'assistant');
		expect(assistant).toBeDefined();
		expect((assistant as any).textBlocks).toHaveLength(1);
	});

	it('handles assistant record with no message.id and no requestId as standalone', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			{
				type: 'assistant',
				uuid: 'a1',
				parentUuid: 'u1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:10.000Z',
				message: {
					model: 'claude-opus-4-6',
					id: undefined as any,
					type: 'message',
					role: 'assistant',
					content: [{ type: 'text', text: 'Standalone response' }],
					stop_reason: 'end_turn',
					stop_sequence: null,
					usage: makeUsage(),
				},
			} as unknown as AssistantRecord,
		];
		const tree = buildConversationTree(records, []);

		const flat = flattenTree(tree.roots);
		expect(flat.find((n) => n.kind === 'assistant')).toBeDefined();
	});

	it('does not collide distinct blocks with same prefix during dedup', () => {
		const prefix = 'A'.repeat(100);
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			// First chunk: text block with prefix + "first"
			{
				type: 'assistant',
				uuid: 'a1',
				parentUuid: 'u1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:10.000Z',
				message: {
					model: 'claude-opus-4-6',
					id: 'msg-001',
					type: 'message',
					role: 'assistant',
					content: [{ type: 'text', text: prefix + ' first' }],
					stop_reason: null,
					stop_sequence: null,
					usage: makeUsage(),
				},
			} as unknown as AssistantRecord,
			// Second chunk: different text block with prefix + "second"
			{
				type: 'assistant',
				uuid: 'a2',
				parentUuid: 'a1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:20.000Z',
				message: {
					model: 'claude-opus-4-6',
					id: 'msg-001',
					type: 'message',
					role: 'assistant',
					content: [
						{ type: 'text', text: prefix + ' first' },
						{ type: 'text', text: prefix + ' second' },
					],
					stop_reason: 'end_turn',
					stop_sequence: null,
					usage: makeUsage(),
				},
			} as unknown as AssistantRecord,
		];
		const tree = buildConversationTree(records, []);
		const assistant = tree.roots[0].children[0] as any;
		// Both distinct text blocks should be preserved
		expect(assistant.textBlocks).toHaveLength(2);
		expect(assistant.textBlocks[0].text).toContain('first');
		expect(assistant.textBlocks[1].text).toContain('second');
	});

	it('enriches tool result nodes with sourceFile from NormalizedToolResult', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Read a file'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', {
				toolUse: { id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } },
			}),
			makeToolResult('tr1', 'a1', '2026-04-03T17:45:20.000Z', 'tool-1', 'file contents here'),
		];
		const apiGroups = [makeApiGroup('msg-001', [{ id: 'tool-1', name: 'Read' }])];
		const normalizedResults: NormalizedToolResult[] = [{
			toolUseId: 'tool-1',
			toolName: 'Read',
			content: 'file contents here',
			isError: false,
			sourceFile: {
				filePath: '/test.ts',
				numLines: 42,
				startLine: 1,
				totalLines: 100,
			},
		}];

		const tree = buildConversationTree(records, apiGroups, normalizedResults);
		const flat = flattenTree(tree.roots);
		const toolResult = flat.find((n) => n.kind === 'tool-result') as any;

		expect(toolResult.sourceFile).toBeDefined();
		expect(toolResult.sourceFile.filePath).toBe('/test.ts');
		expect(toolResult.sourceFile.numLines).toBe(42);
	});

	it('weaves subagent sub-trees into Agent tool results', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Explore the codebase'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', {
				toolUse: { id: 'tool-1', name: 'Agent', input: { subagent_type: 'Explore', prompt: 'Find files' } },
			}),
			{
				type: 'user',
				uuid: 'tr1',
				parentUuid: 'a1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:30.000Z',
				sourceToolAssistantUUID: 'a1',
				toolUseResult: { agentId: 'sub1', agentType: 'Explore', content: 'Found files' },
				message: {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'Found files' }],
				},
			} as unknown as UserRecord,
		];
		const apiGroups = [makeApiGroup('msg-001', [{ id: 'tool-1', name: 'Agent' }])];

		const subagentRecords: TranscriptRecord[] = [
			makeUserPrompt('su1', null, '2026-04-03T17:45:12.000Z', 'Find all *.ts files'),
			makeAssistant('sa1', 'su1', '2026-04-03T17:45:15.000Z', 'sub-msg-001', { text: 'Found 5 files' }),
		];

		const subagents: SubagentInput[] = [{
			agentId: 'sub1',
			meta: { agentType: 'Explore', description: 'Code explorer' },
			records: subagentRecords,
			apiCallGroups: [],
			toolResults: [],
		}];

		const tree = buildConversationTree(records, apiGroups, [], subagents);
		const flat = flattenTree(tree.roots);

		// Should find a subagent node
		const subagentNode = flat.find((n) => n.kind === 'subagent');
		expect(subagentNode).toBeDefined();
		expect((subagentNode as any).agentId).toBe('sub1');
		expect((subagentNode as any).agentType).toBe('Explore');
		// Subagent should have children from its own records
		expect(subagentNode!.children.length).toBeGreaterThan(0);
	});

	it('counts subagent nodes in nodeCount', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Explore'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', {
				toolUse: { id: 'tool-1', name: 'Agent', input: {} },
			}),
			{
				type: 'user',
				uuid: 'tr1',
				parentUuid: 'a1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:30.000Z',
				sourceToolAssistantUUID: 'a1',
				toolUseResult: { agentId: 'sub1', agentType: 'Explore', content: 'Done' },
				message: {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'Done' }],
				},
			} as unknown as UserRecord,
		];
		const apiGroups = [makeApiGroup('msg-001', [{ id: 'tool-1', name: 'Agent' }])];
		const subagents: SubagentInput[] = [{
			agentId: 'sub1',
			meta: { agentType: 'Explore', description: 'Explorer' },
			records: [
				makeUserPrompt('su1', null, '2026-04-03T17:45:12.000Z', 'Find files'),
				makeAssistant('sa1', 'su1', '2026-04-03T17:45:15.000Z', 'sub-msg', { text: 'Found' }),
			],
			apiCallGroups: [],
			toolResults: [],
		}];

		const tree = buildConversationTree(records, apiGroups, [], subagents);
		// Main nodes: u1, a1, tr1 = 3; Subagent: subagent-sub1, su1, sa1 = 3; Total = 6
		expect(tree.nodeCount).toBe(6);
	});

	it('builds subagent-only tree when main records are empty', () => {
		const subagents: SubagentInput[] = [{
			agentId: 'sub1',
			meta: { agentType: 'Explore', description: 'Explorer' },
			records: [
				makeUserPrompt('su1', null, '2026-04-03T17:45:00.000Z', 'Find files'),
				makeAssistant('sa1', 'su1', '2026-04-03T17:45:10.000Z', 'sub-msg', { text: 'Found' }),
			],
			apiCallGroups: [],
			toolResults: [],
		}];

		const tree = buildConversationTree([], [], [], subagents);
		// Should have the subagent node with children, not empty
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0].kind).toBe('subagent');
		expect(tree.nodeCount).toBe(3); // subagent + user + assistant
	});

	it('namespaces subagent descendant ids to avoid collisions with main and sibling trees', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('shared-u', null, '2026-04-03T17:45:00.000Z', 'Explore'),
			makeAssistant('shared-a', 'shared-u', '2026-04-03T17:45:10.000Z', 'msg-001', {
				toolUse: { id: 'tool-1', name: 'Agent', input: {} },
			}),
			{
				type: 'user',
				uuid: 'tool-result-1',
				parentUuid: 'shared-a',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:30.000Z',
				sourceToolAssistantUUID: 'shared-a',
				toolUseResult: { agentId: 'sub1', agentType: 'Explore', content: 'Done' },
				message: {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'Done' }],
				},
			} as unknown as UserRecord,
			makeAssistant('shared-b', 'shared-u', '2026-04-03T17:46:10.000Z', 'msg-002', {
				toolUse: { id: 'tool-2', name: 'Agent', input: {} },
			}),
			{
				type: 'user',
				uuid: 'tool-result-2',
				parentUuid: 'shared-b',
				isSidechain: false,
				timestamp: '2026-04-03T17:46:30.000Z',
				sourceToolAssistantUUID: 'shared-b',
				toolUseResult: { agentId: 'sub2', agentType: 'Explore', content: 'Done' },
				message: {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: 'tool-2', content: 'Done' }],
				},
			} as unknown as UserRecord,
		];
		const apiGroups = [
			makeApiGroup('msg-001', [{ id: 'tool-1', name: 'Agent' }]),
			makeApiGroup('msg-002', [{ id: 'tool-2', name: 'Agent' }]),
		];
		const reusedSubagentRecords: TranscriptRecord[] = [
			makeUserPrompt('shared-u', null, '2026-04-03T17:45:12.000Z', 'Find files'),
			makeAssistant('shared-a', 'shared-u', '2026-04-03T17:45:15.000Z', 'sub-msg', { text: 'Found' }),
		];
		const subagents: SubagentInput[] = [
			{
				agentId: 'sub1',
				meta: { agentType: 'Explore', description: 'Explorer 1' },
				records: reusedSubagentRecords,
				apiCallGroups: [],
				toolResults: [],
			},
			{
				agentId: 'sub2',
				meta: { agentType: 'Explore', description: 'Explorer 2' },
				records: reusedSubagentRecords,
				apiCallGroups: [],
				toolResults: [],
			},
		];

		const tree = buildConversationTree(records, apiGroups, [], subagents);
		const flat = flattenTree(tree.roots);
		const ids = flat.map((node) => node.id);

		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain('shared-u');
		expect(ids).toContain('shared-a');
		expect(ids).toContain('subagent:sub1');
		expect(ids).toContain('subagent:sub1:shared-u');
		expect(ids).toContain('subagent:sub2:shared-u');
	});

	it('resolves children whose parent is a skipped synthetic record', () => {
		// u1 → synth → u2: synth is skipped, u2 should find u1 via ancestor walk
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			{
				type: 'assistant',
				uuid: 'synth1',
				parentUuid: 'u1',
				isSidechain: false,
				timestamp: '2026-04-03T17:45:10.000Z',
				message: {
					model: '<synthetic>',
					id: 'synth_id',
					type: 'message',
					role: 'assistant',
					content: [{ type: 'text', text: 'Synthetic' }],
					stop_reason: 'stop_sequence',
					stop_sequence: '',
					usage: makeUsage(0, 0),
				},
			} as unknown as AssistantRecord,
			makeUserPrompt('u2', 'synth1', '2026-04-03T17:45:20.000Z', 'Continue'),
		];
		const tree = buildConversationTree(records, []);

		// u2 should be attached to u1 (via ancestor walk past skipped synthetic)
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0].children).toHaveLength(1);
		expect(tree.roots[0].children[0].kind).toBe('user-prompt');
		expect((tree.roots[0].children[0] as any).content).toBe('Continue');
		expect(tree.orphanCount).toBe(0);
	});
});

describe('flattenTree', () => {
	it('returns empty array for empty roots', () => {
		expect(flattenTree([])).toHaveLength(0);
	});

	it('flattens depth-first', () => {
		const records: TranscriptRecord[] = [
			makeUserPrompt('u1', null, '2026-04-03T17:45:00.000Z', 'Hello'),
			makeAssistant('a1', 'u1', '2026-04-03T17:45:10.000Z', 'msg-001', { text: 'Hi' }),
			makeSystemRecord('s1', 'a1', '2026-04-03T17:45:20.000Z', 'turn_duration', { durationMs: 5000 }),
		];
		const tree = buildConversationTree(records, []);
		const flat = flattenTree(tree.roots);

		expect(flat.map((n) => n.id)).toEqual(['u1', 'a1', 's1']);
	});
});
