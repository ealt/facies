import { homedir } from 'node:os';
import { join } from 'node:path';

/** Base ~/.claude directory. Override with FACIES_CLAUDE_DIR env var. */
export function getClaudeDir(): string {
	return process.env.FACIES_CLAUDE_DIR ?? join(homedir(), '.claude');
}

export function getLogsDir(): string {
	return join(getClaudeDir(), 'logs');
}

export function getCacheFile(): string {
	return join(process.cwd(), '.cache', 'session-index.json');
}
