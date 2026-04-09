import { readFile, writeFile, stat, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
	SessionIndex,
	SessionSummary,
	EventLogRecord,
	ApiCallGroup,
} from '$lib/types.js';
import { normalizeModel } from '$lib/pricing.js';
import { computeSessionCost } from '$lib/analysis/cost-calculator.js';
import { discoverSessions, type DiscoveredSession } from './discovery.js';
import { readEventLog } from './event-log-reader.js';
import { readTranscript } from './transcript-reader.js';
import { readAllSubagents, type SubagentData } from './subagent-reader.js';

export { normalizeModel } from '$lib/pricing.js';

const INDEX_VERSION = 2;

/**
 * Resolve a transcript path that may be absolute on a different machine.
 * Tries in order: path as-is, relative to claudeDir, /projects/ suffix extraction.
 */
async function resolveTranscriptPath(
	storedPath: string,
	claudeDir: string,
): Promise<string | null> {
	// Normalize separators early (handles Windows-style paths on POSIX)
	const normalized = storedPath.replace(/\\/g, '/');

	// 1. Try the path as-is (works when running on the same machine)
	try {
		await access(normalized);
		return normalized;
	} catch {
		// Path doesn't exist at the stored location
	}

	// 2. If not absolute, try relative to claudeDir
	if (!normalized.startsWith('/')) {
		const relative = join(claudeDir, normalized);
		try {
			await access(relative);
			return relative;
		} catch {
			// Not found relative to claudeDir either
		}
	}

	// 3. Extract /projects/... suffix and resolve against claudeDir
	const projectsIdx = normalized.indexOf('/projects/');
	if (projectsIdx === -1) return null;

	const suffix = normalized.slice(projectsIdx + 1); // "projects/..."
	const resolved = join(claudeDir, suffix);
	try {
		await access(resolved);
		return resolved;
	} catch {
		return null;
	}
}

/** Derive the project slug from a transcript path. */
function extractProject(transcriptPath: string): string {
	const projectsIdx = transcriptPath.indexOf('/projects/');
	if (projectsIdx === -1) return 'unknown';
	const afterProjects = transcriptPath.slice(projectsIdx + '/projects/'.length);
	const slash = afterProjects.indexOf('/');
	return slash === -1 ? afterProjects : afterProjects.slice(0, slash);
}

/** Get file mtime in ms, or 0 if file doesn't exist. */
async function getMtime(filePath: string): Promise<number> {
	try {
		const s = await stat(filePath);
		return s.mtimeMs;
	} catch {
		return 0;
	}
}

function computeSessionSummary(
	discovered: DiscoveredSession,
	events: EventLogRecord[],
	apiCallGroups: ApiCallGroup[],
	subagents: SubagentData[],
	transcriptTitle: string | null,
	transcriptSlug: string | null,
	compactionCount: number,
	compactionPreTokens: number[],
	skippedLines: number,
	resolvedTranscriptPath: string | null,
	mtimes: {
		eventLog: number;
		transcript: number;
		subagents: Record<string, number>;
	},
): SessionSummary {
	const model = normalizeModel(discovered.model);

	// Title: custom-title > slug > sessionId
	const title = transcriptTitle ?? transcriptSlug ?? discovered.sessionId;

	// Timing from event log
	const startEvent = events.find((e) => e.event === 'SessionStart');
	const endEvent = events.find((e) => e.event === 'SessionEnd');
	const startTime = startEvent?.timestamp ?? discovered.startTimestamp;
	const endTime = endEvent?.timestamp ?? events[events.length - 1]?.timestamp ?? null;
	const durationMs =
		startTime && endTime
			? new Date(endTime).getTime() - new Date(startTime).getTime()
			: 0;

	// Turns = UserPromptSubmit count
	const turns = events.filter((e) => e.event === 'UserPromptSubmit').length;

	// Tool call counts from event log
	const toolCounts: Record<string, number> = {};
	for (const e of events) {
		if (e.event === 'PostToolUse') {
			const name = (e as { tool_name: string }).tool_name;
			toolCounts[name] = (toolCounts[name] ?? 0) + 1;
		}
	}
	const toolCallCount = Object.values(toolCounts).reduce((a, b) => a + b, 0);

	// Token totals from API call groups (main + subagents)
	const hasTranscript = resolvedTranscriptPath !== null;
	const allGroups = [
		...apiCallGroups,
		...subagents.flatMap((s) => s.apiCallGroups),
	];
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	for (const g of allGroups) {
		totalInputTokens +=
			(g.usage.input_tokens ?? 0) +
			(g.usage.cache_read_input_tokens ?? 0) +
			(g.usage.cache_creation_input_tokens ?? 0);
		totalOutputTokens += g.usage.output_tokens ?? 0;
	}

	// Cost calculation — null when transcript is missing (no API call data)
	const costResult = hasTranscript ? computeSessionCost(allGroups) : { totalCost: null, costIsLowerBound: false, perCall: [] };

	return {
		sessionId: discovered.sessionId,
		project: extractProject(discovered.transcriptPath),
		title,
		model,
		startTime,
		endTime,
		durationMs,
		turns,
		totalInputTokens: hasTranscript ? totalInputTokens : 0,
		totalOutputTokens: hasTranscript ? totalOutputTokens : 0,
		totalCost: costResult.totalCost,
		costIsLowerBound: costResult.costIsLowerBound,
		compactionCount,
		toolCallCount,
		toolCounts,
		subagentCount: subagents.length,
		compactionPreTokens,
		hasTranscript,
		skippedLines,
		eventLogPath: discovered.eventLogPath,
		eventLogMtime: mtimes.eventLog,
		transcriptPath: resolvedTranscriptPath ?? discovered.transcriptPath,
		transcriptMtime: mtimes.transcript,
		subagentMtimes: mtimes.subagents,
	};
}

function isStale(
	cached: SessionSummary,
	eventLogMtime: number,
	transcriptMtime: number,
	subagentMtimes: Record<string, number>,
): boolean {
	if (eventLogMtime > cached.eventLogMtime) return true;
	if (transcriptMtime > cached.transcriptMtime) return true;
	// Detect deleted transcript (was present, now gone)
	if (cached.transcriptMtime > 0 && transcriptMtime === 0) return true;
	// Detect new or updated subagent files
	for (const [path, mtime] of Object.entries(subagentMtimes)) {
		if (!cached.subagentMtimes[path] || mtime > cached.subagentMtimes[path]) return true;
	}
	// Detect removed subagent files
	for (const path of Object.keys(cached.subagentMtimes)) {
		if (!(path in subagentMtimes)) return true;
	}
	return false;
}

/**
 * Build or refresh the session index. Reads cached index if available,
 * discovers sessions, parses new/stale ones, writes updated cache.
 */
export async function getSessionIndex(
	claudeDir: string,
	cacheFile: string,
): Promise<SessionIndex> {
	// 1. Read existing cache (validate structure before accepting)
	let cached: SessionIndex = { version: INDEX_VERSION, lastUpdated: '', sessions: [] };
	try {
		const raw = await readFile(cacheFile, 'utf-8');
		const parsed = JSON.parse(raw);
		if (
			parsed &&
			parsed.version === INDEX_VERSION &&
			Array.isArray(parsed.sessions)
		) {
			cached = parsed as SessionIndex;
		}
	} catch {
		// No cache or invalid — start fresh
	}

	const cachedMap = new Map(cached.sessions.map((s) => [s.sessionId, s]));

	// 2. Discover sessions
	const logsDir = join(claudeDir, 'logs');
	const discovered = await discoverSessions(logsDir);
	const discoveredIds = new Set(discovered.map((d) => d.sessionId));

	// 3. Check each session for staleness
	const updatedSessions: SessionSummary[] = [];

	for (const disc of discovered) {
		const eventLogMtime = await getMtime(disc.eventLogPath);

		// Resolve transcript path (may be on a different machine)
		const resolvedTranscript = await resolveTranscriptPath(disc.transcriptPath, claudeDir);
		const transcriptMtime = resolvedTranscript ? await getMtime(resolvedTranscript) : 0;

		// Resolve session directory for subagents
		const resolvedSessionDir = resolvedTranscript
			? resolvedTranscript.replace(/\.jsonl$/, '')
			: null;

		// Get subagent mtimes
		const subagentMtimes: Record<string, number> = {};
		if (resolvedSessionDir) {
			try {
				const { discoverSubagents } = await import('./subagent-reader.js');
				const subPaths = await discoverSubagents(resolvedSessionDir);
				for (const p of subPaths) {
					subagentMtimes[p] = await getMtime(p);
				}
			} catch {
				// No subagents
			}
		}

		const existing = cachedMap.get(disc.sessionId);
		if (existing && !isStale(existing, eventLogMtime, transcriptMtime, subagentMtimes)) {
			updatedSessions.push(existing);
			continue;
		}

		// 4. Parse new/stale session
		const { events, skippedLines: eventSkipped } = await readEventLog(disc.eventLogPath);

		let apiCallGroups: ApiCallGroup[] = [];
		let transcriptTitle: string | null = null;
		let transcriptSlug: string | null = null;
		let compactionCount = 0;
		let compactionPreTokensList: number[] = [];
		let transcriptSkipped = 0;
		let subagents: SubagentData[] = [];

		if (resolvedTranscript) {
			const result = await readTranscript(resolvedTranscript);
			apiCallGroups = result.apiCallGroups;
			transcriptTitle = result.title;
			transcriptSlug = result.slug;
			transcriptSkipped = result.skippedLines;

			const compactionRecords = result.records.filter(
				(r) => r.type === 'system' && 'subtype' in r && (r as { subtype: string }).subtype === 'compact_boundary',
			);
			compactionCount = compactionRecords.length;
			compactionPreTokensList = compactionRecords.map((r) => {
				const sys = r as { compactMetadata?: { preTokens?: number } };
				return sys.compactMetadata?.preTokens ?? 0;
			}).filter((n) => n > 0);

			if (resolvedSessionDir) {
				subagents = await readAllSubagents(resolvedSessionDir);
			}
		}

		const summary = computeSessionSummary(
			disc,
			events,
			apiCallGroups,
			subagents,
			transcriptTitle,
			transcriptSlug,
			compactionCount,
			compactionPreTokensList,
			eventSkipped + transcriptSkipped + subagents.reduce((n, s) => n + s.skippedLines, 0),
			resolvedTranscript,
			{ eventLog: eventLogMtime, transcript: transcriptMtime, subagents: subagentMtimes },
		);

		updatedSessions.push(summary);
	}

	// 5. Remove stale entries (event log no longer exists)
	const finalSessions = updatedSessions.filter((s) => discoveredIds.has(s.sessionId));

	const index: SessionIndex = {
		version: INDEX_VERSION,
		lastUpdated: new Date().toISOString(),
		sessions: finalSessions,
	};

	// 6. Write cache
	try {
		await mkdir(dirname(cacheFile), { recursive: true });
		await writeFile(cacheFile, JSON.stringify(index, null, 2));
	} catch {
		// Cache write failure is non-fatal
	}

	return index;
}
