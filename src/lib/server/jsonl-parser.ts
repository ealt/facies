export interface ParsedJsonl<T = unknown> {
	records: T[];
	skippedLines: number;
}

/**
 * Parse JSONL content into an array of records.
 * Skips empty lines and malformed JSON, tracking the skip count.
 */
export function parseJsonl<T = unknown>(content: string): ParsedJsonl<T> {
	const records: T[] = [];
	let skippedLines = 0;

	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			records.push(JSON.parse(trimmed) as T);
		} catch {
			skippedLines++;
		}
	}

	return { records, skippedLines };
}
