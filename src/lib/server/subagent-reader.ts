import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { SubagentMeta, TranscriptRecord, ApiCallGroup, NormalizedToolResult } from '$lib/types.js';
import { readTranscript } from './transcript-reader.js';

export interface SubagentData {
	agentId: string;
	meta: SubagentMeta;
	transcriptPath: string;
	records: TranscriptRecord[];
	apiCallGroups: ApiCallGroup[];
	toolResults: NormalizedToolResult[];
	skippedLines: number;
}

/** Find all subagent JSONL files in a session directory. */
export async function discoverSubagents(sessionDir: string): Promise<string[]> {
	const subagentsDir = join(sessionDir, 'subagents');
	try {
		const entries = await readdir(subagentsDir);
		return entries
			.filter((e) => e.startsWith('agent-') && e.endsWith('.jsonl'))
			.map((e) => join(subagentsDir, e));
	} catch {
		return [];
	}
}

/** Read and parse a single subagent transcript + meta. */
export async function readSubagent(transcriptPath: string): Promise<SubagentData> {
	const filename = basename(transcriptPath, '.jsonl');
	const agentId = filename.replace(/^agent-/, '');

	// Read meta file (optional — gracefully degrade)
	const metaPath = transcriptPath.replace('.jsonl', '.meta.json');
	let meta: SubagentMeta;
	try {
		meta = JSON.parse(await readFile(metaPath, 'utf-8'));
	} catch {
		meta = { agentType: 'unknown', description: '' };
	}

	const { records, apiCallGroups, toolResults, skippedLines } = await readTranscript(transcriptPath);

	return { agentId, meta, transcriptPath, records, apiCallGroups, toolResults, skippedLines };
}

/** Discover and read all subagents for a session. */
export async function readAllSubagents(sessionDir: string): Promise<SubagentData[]> {
	const paths = await discoverSubagents(sessionDir);
	return Promise.all(paths.map(readSubagent));
}
