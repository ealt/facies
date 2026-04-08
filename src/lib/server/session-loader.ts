import { access } from 'node:fs/promises';
import type {
	SessionSummary,
	EventLogRecord,
	TranscriptRecord,
	ApiCallGroup,
	NormalizedToolResult,
} from '$lib/types.js';
import { readEventLog } from './event-log-reader.js';
import { readTranscript } from './transcript-reader.js';
import { readAllSubagents, type SubagentData } from './subagent-reader.js';

export interface SessionDetail {
	summary: SessionSummary;
	events: EventLogRecord[];
	transcriptRecords: TranscriptRecord[];
	apiCallGroups: ApiCallGroup[];
	toolResults: NormalizedToolResult[];
	subagents: SubagentData[];
	skippedLines: number;
	warnings: string[];
}

/** Load the full parsed data for a single session. */
export async function loadSession(summary: SessionSummary): Promise<SessionDetail> {
	const warnings: string[] = [];
	let totalSkipped = 0;

	// Parse event log
	const { events, skippedLines: eventSkipped } = await readEventLog(summary.eventLogPath);
	totalSkipped += eventSkipped;

	// Parse transcript
	let transcriptRecords: TranscriptRecord[] = [];
	let apiCallGroups: ApiCallGroup[] = [];
	let toolResults: NormalizedToolResult[] = [];

	try {
		await access(summary.transcriptPath);
		const result = await readTranscript(summary.transcriptPath);
		transcriptRecords = result.records;
		apiCallGroups = result.apiCallGroups;
		toolResults = result.toolResults;
		totalSkipped += result.skippedLines;
		warnings.push(...result.warnings);
	} catch {
		warnings.push(`Transcript not found: ${summary.transcriptPath}`);
	}

	// Parse subagents
	const sessionDir = summary.transcriptPath.replace(/\.jsonl$/, '');
	let subagents: SubagentData[] = [];
	try {
		subagents = await readAllSubagents(sessionDir);
		for (const s of subagents) {
			totalSkipped += s.skippedLines;
		}
	} catch {
		// No subagents — not an error
	}

	return {
		summary,
		events,
		transcriptRecords,
		apiCallGroups,
		toolResults,
		subagents,
		skippedLines: totalSkipped,
		warnings,
	};
}
