<script lang="ts">
	import type { SessionSummary } from '$lib/types.js';
	import { goto } from '$app/navigation';
	import {
		computeAggregateMetrics,
		computeDailyUsage,
		computeProjectBreakdown,
		computeToolBreakdown,
		computeCompactionPoints,
		collectCompactionThresholds,
	} from '$lib/analysis/session-aggregator.js';
	import DailyUsageChart from '$lib/components/charts/DailyUsageChart.svelte';
	import ProjectDistribution from '$lib/components/charts/ProjectDistribution.svelte';
	import ToolDistribution from '$lib/components/charts/ToolDistribution.svelte';
	import TriggerHistogram from '$lib/components/charts/TriggerHistogram.svelte';
	import CompactionScatter from '$lib/components/charts/CompactionScatter.svelte';

	let { sessions }: { sessions: SessionSummary[] } = $props();

	// Aggregations
	const metrics = $derived(computeAggregateMetrics(sessions));
	const dailyUsage = $derived(computeDailyUsage(sessions));
	const projectBreakdown = $derived(computeProjectBreakdown(sessions));
	const toolBreakdown = $derived(computeToolBreakdown(sessions));
	const compactionPoints = $derived(computeCompactionPoints(sessions));
	const compactionThresholds = $derived(collectCompactionThresholds(sessions));

	// Session table state
	type SortKey = keyof SessionSummary | '_totalTokens';
	let searchQuery = $state('');
	let sortKey = $state<SortKey>('startTime');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let modelFilter = $state<string>('all');
	let projectFilter = $state<string>('all');

	const models = $derived([...new Set(sessions.map((s) => s.model))].sort());
	const projects = $derived([...new Set(sessions.map((s) => s.project))].sort());

	const filteredSessions = $derived.by(() => {
		let result = sessions;

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			result = result.filter(
				(s) =>
					(s.title?.toLowerCase().includes(q) ?? false) ||
					s.sessionId.toLowerCase().includes(q) ||
					s.project.toLowerCase().includes(q),
			);
		}

		if (modelFilter !== 'all') {
			result = result.filter((s) => s.model === modelFilter);
		}
		if (projectFilter !== 'all') {
			result = result.filter((s) => s.project === projectFilter);
		}

		const dir = sortDir === 'asc' ? 1 : -1;
		result = [...result].sort((a, b) => {
			if (sortKey === '_totalTokens') {
				// Sort missing-transcript sessions last regardless of direction
				if (a.hasTranscript === false && b.hasTranscript !== false) return 1;
				if (b.hasTranscript === false && a.hasTranscript !== false) return -1;
				return ((a.totalInputTokens + a.totalOutputTokens) - (b.totalInputTokens + b.totalOutputTokens)) * dir;
			}
			const av = a[sortKey];
			const bv = b[sortKey];
			if (av === null || av === undefined) return 1;
			if (bv === null || bv === undefined) return -1;
			if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
			if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
			return 0;
		});

		return result;
	});

	// Keyboard navigation for session table
	let focusedRow = $state(-1);

	function handleTableKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusedRow = Math.min(focusedRow + 1, filteredSessions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusedRow = Math.max(focusedRow - 1, 0);
		} else if (e.key === 'Enter' && focusedRow >= 0 && focusedRow < filteredSessions.length) {
			goto(`/session/${filteredSessions[focusedRow].sessionId}`);
		}
	}

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'desc';
		}
	}

	function sortIndicator(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
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

	function formatDate(ts: string): string {
		const d = new Date(ts);
		const month = d.toLocaleString('en-US', { month: 'short' });
		const day = d.getDate();
		const h = d.getHours().toString().padStart(2, '0');
		const m = d.getMinutes().toString().padStart(2, '0');
		return `${month} ${day} ${h}:${m}`;
	}
</script>

<div>
	<!-- Aggregate Metric Cards -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Total Sessions</div>
			<div class="mt-1 text-2xl font-bold">{metrics.totalSessions}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Total Tokens</div>
			<div class="mt-1 text-2xl font-bold">{formatTokens(metrics.totalInputTokens + metrics.totalOutputTokens)}</div>
			<div class="text-xs text-muted-foreground">
				{formatTokens(metrics.totalInputTokens)} in / {formatTokens(metrics.totalOutputTokens)} out
				{#if metrics.sessionsWithoutTranscript > 0}
					<span class="text-yellow-500" title="{metrics.sessionsWithoutTranscript} session(s) missing transcript data">&mdash; incomplete</span>
				{/if}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Total Cost</div>
			<div class="mt-1 text-2xl font-bold">{formatCost(metrics.totalCost)}</div>
			{#if metrics.costIsLowerBound}
				<div class="text-xs text-yellow-500">lower bound</div>
			{/if}
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Unique Projects</div>
			<div class="mt-1 text-2xl font-bold">{metrics.uniqueProjects}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Most-Used Model</div>
			<div class="mt-1 text-lg font-bold font-mono truncate" title={metrics.mostUsedModel ?? ''}>
				{metrics.mostUsedModel ?? 'N/A'}
			</div>
		</div>
	</div>

	<!-- Trend Charts -->
	<div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 text-sm font-medium">Daily Token Usage</h3>
			<DailyUsageChart data={dailyUsage} />
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 text-sm font-medium">Sessions per Project</h3>
			<ProjectDistribution data={projectBreakdown} />
		</div>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 text-sm font-medium">Tool Usage</h3>
			<ToolDistribution data={toolBreakdown} />
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 text-sm font-medium">Compaction Thresholds</h3>
			<TriggerHistogram thresholds={compactionThresholds} />
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 text-sm font-medium">Duration vs Compactions</h3>
			<CompactionScatter data={compactionPoints} />
		</div>
	</div>

	<!-- Session Table -->
	<div class="rounded-lg border border-border">
		<div class="flex flex-wrap items-center gap-2 border-b border-border p-3">
			<input
				type="text"
				placeholder="Search sessions..."
				bind:value={searchQuery}
				class="rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			/>
			<select
				bind:value={modelFilter}
				class="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
			>
				<option value="all">All models</option>
				{#each models as m}
					<option value={m}>{m}</option>
				{/each}
			</select>
			<select
				bind:value={projectFilter}
				class="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
			>
				<option value="all">All projects</option>
				{#each projects as p}
					<option value={p}>{p}</option>
				{/each}
			</select>
			<span class="text-xs text-muted-foreground">
				{filteredSessions.length} of {sessions.length} session{sessions.length !== 1 ? 's' : ''}
			</span>
		</div>

		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
		<div tabindex="0" onkeydown={handleTableKeydown} class="focus:outline-none">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-muted/50">
						<th class="cursor-pointer px-4 py-2 text-left font-medium" onclick={() => toggleSort('project')}>
							Project{sortIndicator('project')}
						</th>
						<th class="cursor-pointer px-4 py-2 text-left font-medium" onclick={() => toggleSort('title')}>
							Title{sortIndicator('title')}
						</th>
						<th class="cursor-pointer px-4 py-2 text-left font-medium" onclick={() => toggleSort('model')}>
							Model{sortIndicator('model')}
						</th>
						<th class="cursor-pointer px-4 py-2 text-right font-medium" onclick={() => toggleSort('startTime')}>
							Start{sortIndicator('startTime')}
						</th>
						<th class="cursor-pointer px-4 py-2 text-right font-medium" onclick={() => toggleSort('durationMs')}>
							Duration{sortIndicator('durationMs')}
						</th>
						<th class="cursor-pointer px-4 py-2 text-right font-medium" onclick={() => toggleSort('turns')}>
							Turns{sortIndicator('turns')}
						</th>
						<th class="cursor-pointer px-4 py-2 text-right font-medium" onclick={() => toggleSort('_totalTokens')}>
							Tokens{sortIndicator('_totalTokens')}
						</th>
						<th class="cursor-pointer px-4 py-2 text-right font-medium" onclick={() => toggleSort('totalCost')}>
							Cost{sortIndicator('totalCost')}
						</th>
						<th class="cursor-pointer px-4 py-2 text-right font-medium" onclick={() => toggleSort('compactionCount')}>
							Compactions{sortIndicator('compactionCount')}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredSessions as session, i}
						<tr
							class="cursor-pointer border-b border-border last:border-0 transition-colors
								{i === focusedRow ? 'bg-muted/50' : 'hover:bg-muted/30'}"
							onclick={() => goto(`/session/${session.sessionId}`)}
						>
							<td class="px-4 py-2 text-xs text-muted-foreground">{session.project}</td>
							<td class="px-4 py-2">
								<span class="font-medium text-primary">{session.title ?? session.sessionId}</span>
							</td>
							<td class="px-4 py-2">
								<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{session.model}</span>
							</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{formatDate(session.startTime)}</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{formatDuration(session.durationMs)}</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{session.turns}</td>
							<td class="px-4 py-2 text-right font-mono text-xs" title="{session.hasTranscript ? `${formatTokens(session.totalInputTokens)} in / ${formatTokens(session.totalOutputTokens)} out` : 'Transcript unavailable'}">
								{#if session.hasTranscript}
									{formatTokens(session.totalInputTokens + session.totalOutputTokens)}
								{:else}
									<span class="text-muted-foreground">N/A</span>
								{/if}
							</td>
							<td class="px-4 py-2 text-right font-mono text-xs">
								{#if session.hasTranscript}
									{formatCost(session.totalCost)}
									{#if session.costIsLowerBound}
										<span class="text-yellow-500" title="Lower bound — some models have unknown pricing">+</span>
									{/if}
								{:else}
									<span class="text-muted-foreground">N/A</span>
								{/if}
							</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{session.compactionCount}</td>
						</tr>
					{/each}
					{#if filteredSessions.length === 0}
						<tr>
							<td colspan="9" class="px-4 py-8 text-center text-muted-foreground">
								{#if sessions.length === 0}
									No sessions found. Ensure Claude Code logging hooks are configured.
								{:else}
									No sessions match the current filters.
								{/if}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
