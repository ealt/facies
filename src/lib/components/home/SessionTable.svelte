<script lang="ts">
	import type { SessionSummary } from '$lib/types.js';
	import { goto } from '$app/navigation';
	import {
		ALL_COLUMNS,
		DEFAULT_VISIBLE,
		GROUPABLE_COLUMNS,
		aggregateSessions,
		groupSessions,
		getColumn,
		type ColumnDef,
		type SessionGroup,
	} from '$lib/analysis/group-aggregator.js';

	let {
		sessions,
		groupBy,
		onGroupByChange,
		visibleColumnKeys,
		onVisibleColumnsChange,
	}: {
		sessions: SessionSummary[];
		groupBy: string | null;
		onGroupByChange: (key: string | null) => void;
		visibleColumnKeys: string[];
		onVisibleColumnsChange: (keys: string[]) => void;
	} = $props();

	// Sort state
	let sortKey = $state<string>('started');
	let sortDir = $state<'asc' | 'desc'>('desc');

	// UI state
	let columnsOpen = $state(false);
	let collapsedGroups = $state<Set<string>>(new Set());

	const visibleColumns = $derived(
		visibleColumnKeys
			.map((k) => getColumn(k))
			.filter((c): c is ColumnDef => c !== undefined),
	);

	// Summary row (aggregates all sessions)
	const summaryAggregates = $derived(aggregateSessions(sessions, visibleColumns));

	// Sorting
	function sortSessions(list: SessionSummary[]): SessionSummary[] {
		const col = getColumn(sortKey);
		if (!col) return list;
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...list].sort((a, b) => {
			const av = col.accessor(a);
			const bv = col.accessor(b);
			if (av === null || av === undefined) return 1;
			if (bv === null || bv === undefined) return -1;
			// Date columns: compare chronologically via epoch ms
			if (col.type === 'date') {
				return (new Date(String(av)).getTime() - new Date(String(bv)).getTime()) * dir;
			}
			if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
			if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
			return 0;
		});
	}

	// Grouped data
	const groups = $derived.by((): SessionGroup[] | null => {
		if (!groupBy) return null;
		const raw = groupSessions(sessions, groupBy, visibleColumns);
		// Sort groups by sortKey aggregate
		const sortCol = sortKey;
		const dir = sortDir === 'asc' ? 1 : -1;
		raw.sort((a, b) => {
			const aAgg = a.aggregates.find((ag) => ag.column === sortCol);
			const bAgg = b.aggregates.find((ag) => ag.column === sortCol);
			// Use numeric raw when available, fall back to display string comparison
			if (aAgg?.raw != null && bAgg?.raw != null) {
				return (aAgg.raw - bAgg.raw) * dir;
			}
			const aDisplay = aAgg?.display ?? '';
			const bDisplay = bAgg?.display ?? '';
			return aDisplay.localeCompare(bDisplay) * dir;
		});
		// Sort sessions within each group
		for (const g of raw) {
			g.sessions = sortSessions(g.sessions);
		}
		return raw;
	});

	const sortedSessions = $derived(groupBy ? null : sortSessions(sessions));

	function handleSort(key: string) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'desc';
		}
	}

	function sortIndicator(key: string): string {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
	}

	function toggleColumn(key: string) {
		const next = visibleColumnKeys.includes(key)
			? visibleColumnKeys.filter((k) => k !== key)
			: [...visibleColumnKeys, key];
		onVisibleColumnsChange(next);
	}

	function toggleGroup(key: string) {
		const next = new Set(collapsedGroups);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsedGroups = next;
	}

	// Formatting
	function formatCellValue(col: ColumnDef, session: SessionSummary): string {
		const v = col.accessor(session);
		if (v === null || v === undefined) return 'N/A';
		switch (col.key) {
			case 'started': return formatDate(String(v));
			case 'duration': return formatDuration(v as number);
			case 'total_tokens':
			case 'input_tokens':
			case 'output_tokens': return formatTokens(v as number);
			case 'cost': return formatCost(v as number);
			default:
				if (col.type === 'number') return (v as number).toLocaleString();
				return String(v);
		}
	}

	function formatAggregateValue(col: ColumnDef, display: string): string {
		if (display === '—' || display === 'N/A') return display;
		switch (col.key) {
			case 'started': return formatDate(display);
			case 'duration': return formatDuration(Number(display));
			case 'total_tokens':
			case 'input_tokens':
			case 'output_tokens': return formatTokens(Number(display));
			case 'cost': return display; // Already formatted with $
			default: return display;
		}
	}

	function formatDate(ts: string): string {
		const d = new Date(ts);
		if (isNaN(d.getTime())) return ts;
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`;
		if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h ago`;
		if (diffMs < 604_800_000) return `${Math.round(diffMs / 86_400_000)}d ago`;
		const month = d.toLocaleString('en-US', { month: 'short' });
		return `${month} ${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
	}

	function formatDuration(ms: number): string {
		if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
		if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
		return `${(ms / 3_600_000).toFixed(1)}h`;
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	function formatCost(n: number | null): string {
		if (n === null) return 'N/A';
		if (n >= 1) return `$${n.toFixed(2)}`;
		if (n >= 0.01) return `$${n.toFixed(3)}`;
		return `$${n.toFixed(4)}`;
	}
</script>

<div class="rounded-lg border border-border">
	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-2 border-b border-border p-3">
		<!-- Columns dropdown -->
		<div class="relative">
			<button
				class="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted transition-colors"
				onclick={() => { columnsOpen = !columnsOpen; }}
			>
				Columns
			</button>
			{#if columnsOpen}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute left-0 top-full z-10 mt-1 rounded-md border border-border bg-background p-2 shadow-lg"
					onmouseleave={() => { columnsOpen = false; }}
				>
					{#each ALL_COLUMNS as col}
						<label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
							<input
								type="checkbox"
								checked={visibleColumnKeys.includes(col.key)}
								onchange={() => toggleColumn(col.key)}
								class="rounded border-input"
							/>
							{col.label}
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Group by dropdown -->
		<select
			value={groupBy ?? ''}
			onchange={(e) => onGroupByChange((e.currentTarget as HTMLSelectElement).value || null)}
			class="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
		>
			<option value="">No grouping</option>
			{#each GROUPABLE_COLUMNS as col}
				<option value={col.key}>{col.label}</option>
			{/each}
		</select>

		<span class="text-xs text-muted-foreground">
			{sessions.length} session{sessions.length !== 1 ? 's' : ''}
		</span>
	</div>

	<!-- Table -->
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-border bg-muted/50">
					{#each visibleColumns as col}
						<th
							class="cursor-pointer px-4 py-2 font-medium transition-colors hover:bg-muted {col.align === 'right' ? 'text-right' : 'text-left'}"
							onclick={() => handleSort(col.key)}
						>
							{col.label}{sortIndicator(col.key)}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				<!-- Summary row -->
				<tr class="border-b border-border bg-muted/30 font-medium">
					{#each visibleColumns as col, i}
						{@const agg = summaryAggregates[i]}
						<td class="px-4 py-2 text-xs {col.align === 'right' ? 'text-right' : 'text-left'}">
							{#if agg}
								{formatAggregateValue(col, agg.display)}
							{/if}
						</td>
					{/each}
				</tr>

				{#if groups}
					<!-- Grouped rows -->
					{#each groups as group}
						<!-- Group header -->
						<tr
							class="cursor-pointer border-b border-border bg-muted/20 transition-colors hover:bg-muted/40"
							onclick={() => toggleGroup(group.key)}
						>
							{#each visibleColumns as col, i}
								{@const agg = group.aggregates[i]}
								<td class="px-4 py-2 text-xs font-medium {col.align === 'right' ? 'text-right' : 'text-left'}">
									{#if i === 0}
										<span class="mr-1 text-muted-foreground">{collapsedGroups.has(group.key) ? '\u25B6' : '\u25BC'}</span>
										{group.key}
										<span class="ml-1 text-muted-foreground">({group.sessions.length})</span>
									{:else if agg}
										{formatAggregateValue(col, agg.display)}
									{/if}
								</td>
							{/each}
						</tr>
						<!-- Group sessions -->
						{#if !collapsedGroups.has(group.key)}
							{#each group.sessions as session}
								<tr
									class="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/30"
									onclick={() => goto(`/session/${session.sessionId}`)}
								>
									{#each visibleColumns as col}
										<td class="px-4 py-2 {col.align === 'right' ? 'text-right font-mono text-xs' : ''}">
											{#if col.key === 'title'}
												<span class="pl-4 font-medium text-primary">{formatCellValue(col, session)}</span>
											{:else if col.key === 'model'}
												<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{formatCellValue(col, session)}</span>
											{:else}
												{formatCellValue(col, session)}
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						{/if}
					{/each}
				{:else if sortedSessions}
					<!-- Ungrouped rows -->
					{#each sortedSessions as session}
						<tr
							class="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/30"
							onclick={() => goto(`/session/${session.sessionId}`)}
						>
							{#each visibleColumns as col}
								<td class="px-4 py-2 {col.align === 'right' ? 'text-right font-mono text-xs' : ''}">
									{#if col.key === 'title'}
										<span class="font-medium text-primary">{formatCellValue(col, session)}</span>
									{:else if col.key === 'model'}
										<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{formatCellValue(col, session)}</span>
									{:else}
										{formatCellValue(col, session)}
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				{/if}

				{#if sessions.length === 0}
					<tr>
						<td colspan={visibleColumns.length} class="px-4 py-8 text-center text-muted-foreground">
							No sessions match the current filters.
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
