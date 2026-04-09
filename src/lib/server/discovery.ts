import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

export interface DiscoveredSession {
	sessionId: string;
	eventLogPath: string;
	transcriptPath: string;
	/** Directory that may contain subagents/ */
	sessionDir: string;
	model: string;
	cwd: string;
	startTimestamp: string;
}

/**
 * Discover all sessions by scanning event log files.
 *
 * Reads the first line of each JSONL in `logsDir` to extract session metadata.
 * Files starting with `_` (e.g. `_diagnostics.jsonl`) are skipped.
 */
export async function discoverSessions(logsDir: string): Promise<DiscoveredSession[]> {
	let entries: string[];
	try {
		entries = await readdir(logsDir);
	} catch {
		return [];
	}

	const jsonlFiles = entries.filter((e) => e.endsWith('.jsonl') && !e.startsWith('_'));

	const sessions: DiscoveredSession[] = [];

	for (const file of jsonlFiles) {
		const filePath = join(logsDir, file);
		try {
			const content = await readFile(filePath, 'utf-8');
			const firstLine = content.split('\n')[0]?.trim();
			if (!firstLine) continue;

			const event = JSON.parse(firstLine) as Record<string, unknown>;
			if (event.event !== 'SessionStart') continue;

			const sessionId = basename(file, '.jsonl');
			const transcriptPath = event.transcript_path as string;
			// Session directory mirrors transcript path without .jsonl extension
			const sessionDir = transcriptPath.replace(/\.jsonl$/, '');

			sessions.push({
				sessionId,
				eventLogPath: filePath,
				transcriptPath,
				sessionDir,
				model: (event.model as string) ?? 'unknown',
				cwd: (event.cwd as string) ?? '',
				startTimestamp: (event.timestamp as string) ?? '',
			});
		} catch {
			continue;
		}
	}

	return sessions;
}
