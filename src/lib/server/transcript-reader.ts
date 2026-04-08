import { readFile } from 'node:fs/promises';
import type {
	TranscriptRecord,
	AssistantRecord,
	UserRecord,
	ApiCallGroup,
	AssistantContentBlock,
	NormalizedToolResult,
	Usage,
	UserContentBlock,
} from '$lib/types.js';
import { parseJsonl } from './jsonl-parser.js';

export interface TranscriptResult {
	records: TranscriptRecord[];
	apiCallGroups: ApiCallGroup[];
	toolResults: NormalizedToolResult[];
	title: string | null;
	slug: string | null;
	skippedLines: number;
	/** Diagnostic warnings (e.g. fallback grouping used) */
	warnings: string[];
}

/** Only skip records with the explicit synthetic model marker. */
function isSynthetic(record: AssistantRecord): boolean {
	return record.message.model === '<synthetic>';
}

interface GroupKeyResult {
	key: string;
	messageId: string | null;
	fallback: 'none' | 'requestId' | 'standalone';
}

/**
 * Determine the grouping key for an assistant record.
 * Prefer message.id, fall back to requestId, then generate a standalone key.
 */
function groupKey(record: AssistantRecord): GroupKeyResult {
	const messageId = record.message?.id;
	if (messageId) return { key: messageId, messageId, fallback: 'none' };

	const requestId =
		'requestId' in record && typeof record.requestId === 'string'
			? record.requestId
			: undefined;
	if (requestId) return { key: requestId, messageId: null, fallback: 'requestId' };

	return { key: `standalone:${record.uuid}`, messageId: null, fallback: 'standalone' };
}

interface GroupingResult {
	groups: ApiCallGroup[];
	warnings: string[];
}

/**
 * Group assistant records by message.id into ApiCallGroups.
 *
 * message.id is unique per API call — streaming chunks of the same call
 * share the same message.id and identical usage. requestId spans the
 * entire tool-use loop and is preserved for turn-level association.
 */
function buildApiCallGroups(records: TranscriptRecord[]): GroupingResult {
	const groupMap = new Map<string, { records: AssistantRecord[]; messageId: string | null }>();
	const warnings: string[] = [];

	for (const record of records) {
		if (record.type !== 'assistant') continue;
		const assistant = record as AssistantRecord;
		if (isSynthetic(assistant)) continue;

		const gk = groupKey(assistant);

		if (gk.fallback === 'standalone') {
			warnings.push(
				`Assistant record ${assistant.uuid} missing both message.id and requestId — grouped standalone`,
			);
		} else if (gk.fallback === 'requestId') {
			warnings.push(
				`Assistant record ${assistant.uuid} missing message.id — falling back to requestId`,
			);
		}

		const existing = groupMap.get(gk.key);
		if (existing) {
			existing.records.push(assistant);
		} else {
			groupMap.set(gk.key, { records: [assistant], messageId: gk.messageId });
		}
	}

	const groups: ApiCallGroup[] = [];

	for (const [, { records: chunks, messageId }] of groupMap) {
		chunks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

		const first = chunks[0];
		const requestId =
			'requestId' in first && typeof first.requestId === 'string'
				? first.requestId
				: null;

		const contentBlocks: AssistantContentBlock[] = [];
		for (const chunk of chunks) {
			contentBlocks.push(...chunk.message.content);
		}

		const usage: Usage = first.message.usage;

		let stopReason: string | null = null;
		for (const chunk of chunks) {
			if (chunk.message.stop_reason !== null) {
				stopReason = chunk.message.stop_reason;
			}
		}

		groups.push({
			messageId,
			requestId,
			model: first.message.model,
			timestamp: first.timestamp,
			usage,
			contentBlocks,
			stopReason,
			isSynthetic: false,
		});
	}

	groups.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	return { groups, warnings };
}

/**
 * Extract and normalize tool results from user records.
 *
 * Unifies tool_result content blocks (authoritative — what the model saw)
 * with toolUseResult enrichment (structured file metadata when available).
 */
function extractToolResults(
	records: TranscriptRecord[],
	apiCallGroups: ApiCallGroup[],
): NormalizedToolResult[] {
	// Build a map from tool_use_id → tool name from API call groups
	const toolNameMap = new Map<string, string>();
	for (const group of apiCallGroups) {
		for (const block of group.contentBlocks) {
			if (block.type === 'tool_use') {
				toolNameMap.set(block.id, block.name);
			}
		}
	}

	const results: NormalizedToolResult[] = [];

	for (const record of records) {
		if (record.type !== 'user') continue;
		const userRecord = record as UserRecord;
		const message = userRecord.message;
		if (!message || typeof message.content === 'string') continue;

		const contentBlocks = message.content as UserContentBlock[];

		for (const block of contentBlocks) {
			if (block.type !== 'tool_result') continue;

			const normalized: NormalizedToolResult = {
				toolUseId: block.tool_use_id,
				toolName: toolNameMap.get(block.tool_use_id) ?? 'unknown',
				content: block.content,
				isError: block.is_error ?? false,
			};

			// Enrich from structured toolUseResult when available
			const tur = userRecord.toolUseResult;
			if (
				tur &&
				typeof tur === 'object' &&
				'type' in tur &&
				(tur as { type: string }).type === 'text' &&
				'file' in tur
			) {
				const file = (tur as { file: { filePath: string; numLines: number; startLine: number; totalLines: number } }).file;
				normalized.sourceFile = {
					filePath: file.filePath,
					numLines: file.numLines,
					startLine: file.startLine,
					totalLines: file.totalLines,
				};
			}

			results.push(normalized);
		}
	}

	return results;
}

export async function readTranscript(filePath: string): Promise<TranscriptResult> {
	const content = await readFile(filePath, 'utf-8');
	const { records, skippedLines } = parseJsonl<TranscriptRecord>(content);

	let title: string | null = null;
	let slug: string | null = null;

	for (const record of records) {
		if (record.type === 'custom-title') {
			title = record.title;
		}
		if (slug === null && 'slug' in record && typeof record.slug === 'string') {
			slug = record.slug;
		}
	}

	const { groups: apiCallGroups, warnings } = buildApiCallGroups(records);
	const toolResults = extractToolResults(records, apiCallGroups);

	return { records, apiCallGroups, toolResults, title, slug, skippedLines, warnings };
}
