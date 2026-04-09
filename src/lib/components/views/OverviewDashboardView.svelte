<script lang="ts">
	import type { SessionSummary } from '$lib/types.js';
	import { parseQuery } from '$lib/query/parser.js';
	import { DEFAULT_VISIBLE } from '$lib/analysis/group-aggregator.js';
	import { buildProjectColorMap } from '$lib/analysis/color-map.js';
	import SessionTimeline from '$lib/components/charts/SessionTimeline.svelte';
	import CumulativeChart from '$lib/components/charts/CumulativeChart.svelte';
	import TokenTreemap from '$lib/components/charts/TokenTreemap.svelte';
	import SessionTable from '$lib/components/home/SessionTable.svelte';

	let { sessions }: { sessions: SessionSummary[] } = $props();

	// Shared state
	let queryString = $state('');
	let groupBy = $state<string | null>(null);
	let visibleColumnKeys = $state<string[]>([...DEFAULT_VISIBLE]);

	// Parse and filter
	const parseResult = $derived(parseQuery(queryString));
	const filteredSessions = $derived(
		parseResult.ok ? sessions.filter(parseResult.predicate) : sessions,
	);

	// Color map (stable across all charts)
	const allProjects = $derived([...new Set(sessions.map((s) => s.project))]);
	const colorMap = $derived(buildProjectColorMap(allProjects));
</script>

<div>
	<!-- Query bar -->
	<div class="mb-4">
		<div class="relative">
			<input
				type="text"
				placeholder="Filter sessions... (e.g. total_tokens > 1M AND project = &quot;my-app&quot;)"
				bind:value={queryString}
				class="w-full rounded-md border bg-background px-4 py-2.5 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring
					{!parseResult.ok && queryString.trim() ? 'border-red-500' : 'border-input'}"
			/>
			{#if !parseResult.ok && queryString.trim()}
				<!-- Error underline overlay positioned at the error offset -->
				{@const charWidth = 7.8}
				{@const padLeft = 16}
				<div
					class="pointer-events-none absolute top-0 left-0 h-full"
					style="padding-top: 2.25rem;"
				>
					<div
						class="h-0.5 bg-red-500"
						style="margin-left: {padLeft + parseResult.offset * charWidth}px; width: {Math.max(parseResult.length, 1) * charWidth}px;"
					></div>
				</div>
				<!-- Error hint anchored near the error position -->
				<div
					class="absolute top-full z-10 mt-1 max-w-sm rounded-md border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs text-red-400"
					style="left: {Math.min(padLeft + parseResult.offset * charWidth, 400)}px;"
				>
					{parseResult.error}
				</div>
			{/if}
		</div>
	</div>

	<!-- Charts -->
	<div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 text-sm font-medium">Session Timeline</h3>
			<SessionTimeline sessions={filteredSessions} {colorMap} />
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 text-sm font-medium">Cumulative Tokens + Cost</h3>
			<CumulativeChart sessions={filteredSessions} {colorMap} />
		</div>
	</div>

	<div class="mb-6">
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 text-sm font-medium">Token Distribution</h3>
			<TokenTreemap sessions={filteredSessions} {colorMap} {groupBy} />
		</div>
	</div>

	<!-- Session table -->
	<SessionTable
		sessions={filteredSessions}
		{groupBy}
		onGroupByChange={(key) => { groupBy = key; }}
		{visibleColumnKeys}
		onVisibleColumnsChange={(keys) => { visibleColumnKeys = keys; }}
	/>
</div>
