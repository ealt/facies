import { readFile } from 'node:fs/promises';
import type { EventLogRecord } from '$lib/types.js';
import { parseJsonl } from './jsonl-parser.js';

export interface EventLogResult {
	events: EventLogRecord[];
	skippedLines: number;
}

export async function readEventLog(filePath: string): Promise<EventLogResult> {
	const content = await readFile(filePath, 'utf-8');
	const { records, skippedLines } = parseJsonl<EventLogRecord>(content);
	return { events: records, skippedLines };
}
