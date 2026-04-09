import type { SessionSummary } from '$lib/types.js';

// =============================================================================
// Column definition for the session table
// =============================================================================

export interface ColumnDef {
	key: string;
	label: string;
	type: 'string' | 'number' | 'date';
	accessor: (s: SessionSummary) => string | number | null;
	align?: 'left' | 'right';
	defaultVisible?: boolean;
	groupable?: boolean;
}

export const ALL_COLUMNS: ColumnDef[] = [
	{ key: 'title', label: 'Title', type: 'string', accessor: (s) => s.title ?? s.sessionId, defaultVisible: true, groupable: false },
	{ key: 'project', label: 'Project', type: 'string', accessor: (s) => s.project, defaultVisible: true, groupable: true },
	{ key: 'model', label: 'Model', type: 'string', accessor: (s) => s.model, groupable: true },
	{ key: 'started', label: 'Started', type: 'date', accessor: (s) => s.startTime, defaultVisible: true, align: 'right' },
	{ key: 'duration', label: 'Duration', type: 'number', accessor: (s) => s.durationMs, align: 'right' },
	{ key: 'turns', label: 'Turns', type: 'number', accessor: (s) => s.turns, align: 'right' },
	{ key: 'total_tokens', label: 'Total Tokens', type: 'number', accessor: (s) => s.totalInputTokens + s.totalOutputTokens, defaultVisible: true, align: 'right' },
	{ key: 'input_tokens', label: 'Input Tokens', type: 'number', accessor: (s) => s.totalInputTokens, align: 'right' },
	{ key: 'output_tokens', label: 'Output Tokens', type: 'number', accessor: (s) => s.totalOutputTokens, align: 'right' },
	{ key: 'cost', label: 'Cost', type: 'number', accessor: (s) => s.totalCost, align: 'right' },
	{ key: 'compactions', label: 'Compactions', type: 'number', accessor: (s) => s.compactionCount, align: 'right' },
	{ key: 'tool_calls', label: 'Tool Calls', type: 'number', accessor: (s) => s.toolCallCount, align: 'right' },
	{ key: 'subagents', label: 'Subagents', type: 'number', accessor: (s) => s.subagentCount, align: 'right' },
];

const columnMap = new Map(ALL_COLUMNS.map((c) => [c.key, c]));
export function getColumn(key: string): ColumnDef | undefined {
	return columnMap.get(key);
}

export const DEFAULT_VISIBLE = ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);
export const GROUPABLE_COLUMNS = ALL_COLUMNS.filter((c) => c.groupable);

// =============================================================================
// Aggregation
// =============================================================================

export interface ColumnAggregate {
	column: string;
	display: string;
	raw: number | null;
}

export function aggregateSessions(
	sessions: SessionSummary[],
	visibleColumns: ColumnDef[],
): ColumnAggregate[] {
	if (sessions.length === 0) {
		return visibleColumns.map((c) => ({ column: c.key, display: '—', raw: null }));
	}

	return visibleColumns.map((col) => {
		switch (col.key) {
			case 'title':
				return {
					column: col.key,
					display: `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`,
					raw: sessions.length,
				};

			case 'project': {
				const unique = new Set(sessions.map((s) => s.project));
				// Singleton: raw=null → sort by display string (alphabetical)
				// Multi: raw=count → sort numerically
				return {
					column: col.key,
					display: unique.size === 1 ? [...unique][0] : `${unique.size} projects`,
					raw: unique.size === 1 ? null : unique.size,
				};
			}

			case 'model': {
				const unique = new Set(sessions.map((s) => s.model));
				return {
					column: col.key,
					display: unique.size === 1 ? [...unique][0] : `${unique.size} models`,
					raw: unique.size === 1 ? null : unique.size,
				};
			}

			case 'started': {
				let maxTime = new Date(sessions[0].startTime).getTime();
				let maxStr = sessions[0].startTime;
				for (const s of sessions) {
					const t = new Date(s.startTime).getTime();
					if (t > maxTime) {
						maxTime = t;
						maxStr = s.startTime;
					}
				}
				return { column: col.key, display: maxStr, raw: maxTime };
			}

			case 'cost': {
				let sum = 0;
				let anyNull = false;
				let anyLowerBound = false;
				for (const s of sessions) {
					if (s.totalCost === null) {
						anyNull = true;
					} else {
						sum += s.totalCost;
					}
					if (s.costIsLowerBound) anyLowerBound = true;
				}
				const display =
					anyNull && sum === 0
						? 'N/A'
						: `$${sum >= 1 ? sum.toFixed(2) : sum >= 0.01 ? sum.toFixed(3) : sum.toFixed(4)}${anyLowerBound || anyNull ? '+' : ''}`;
				return { column: col.key, display, raw: sum };
			}

			default: {
				// Generic numeric sum
				if (col.type === 'number') {
					let sum = 0;
					for (const s of sessions) {
						const v = col.accessor(s);
						if (typeof v === 'number') sum += v;
					}
					return { column: col.key, display: String(sum), raw: sum };
				}
				// Fallback for unknown string columns
				return { column: col.key, display: '—', raw: null };
			}
		}
	});
}

// =============================================================================
// Grouping
// =============================================================================

export interface SessionGroup {
	key: string;
	sessions: SessionSummary[];
	aggregates: ColumnAggregate[];
}

export function groupSessions(
	sessions: SessionSummary[],
	groupByKey: string,
	visibleColumns: ColumnDef[],
): SessionGroup[] {
	const col = getColumn(groupByKey);
	if (!col) return [];

	const map = new Map<string, SessionSummary[]>();
	for (const s of sessions) {
		const val = String(col.accessor(s) ?? 'unknown');
		const list = map.get(val);
		if (list) {
			list.push(s);
		} else {
			map.set(val, [s]);
		}
	}

	return [...map.entries()].map(([key, groupSessions]) => ({
		key,
		sessions: groupSessions,
		aggregates: aggregateSessions(groupSessions, visibleColumns),
	}));
}
