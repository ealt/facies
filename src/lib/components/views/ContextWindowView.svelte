<script lang="ts">
	import type { ContextSnapshot, ContextTimelineEntry, ContextCategory } from '$lib/types.js';
	import type { CompactionMarker } from '$lib/analysis/context-decomposer.js';
	import ContextTimeline from '$lib/components/charts/ContextTimeline.svelte';

	let { snapshots, timeline, compactions }: {
		snapshots: ContextSnapshot[];
		timeline: ContextTimelineEntry[];
		compactions: CompactionMarker[];
	} = $props();

	const CATEGORY_COLORS: Record<ContextCategory, string> = {
		system: '#6b7280',
		user: '#3b82f6',
		assistant_text: '#22c55e',
		assistant_thinking: '#9ca3af',
		tool_results: '#f97316',
		subagent_overhead: '#a855f7',
		compacted_summary: '#f59e0b',
	};

	const CATEGORY_LABELS: Record<ContextCategory, string> = {
		system: 'System',
		user: 'User',
		assistant_text: 'Assistant',
		assistant_thinking: 'Thinking',
		tool_results: 'Tool Result',
		subagent_overhead: 'Subagent',
		compacted_summary: 'Compacted',
	};

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(Math.round(n));
	}

	function formatTime(ts: string): string {
		const d = new Date(ts);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	const peakTokens = $derived(
		snapshots.length > 0
			? Math.max(...snapshots.map((s) => s.totalTokens))
			: 0,
	);
	const finalTokens = $derived(
		snapshots.length > 0
			? snapshots[snapshots.length - 1].totalTokens
			: 0,
	);

	// Chart mode toggle
	let chartMode = $state<'cumulative' | 'incremental'>('cumulative');

	// Selection state: clicking the chart selects an API call index
	let selectedCallIdx = $state<number | null>(null);

	function isEntryHighlighted(entry: ContextTimelineEntry): boolean {
		if (selectedCallIdx === null) return false;
		return entry.apiCallIndex === selectedCallIdx;
	}

	// Expanded row for detail
	let expandedIdx = $state<number | null>(null);

	function toggleExpand(idx: number) {
		expandedIdx = expandedIdx === idx ? null : idx;
	}

	function handleChartSelect(idx: number | null) {
		selectedCallIdx = idx;
		expandedIdx = null;
	}
</script>

<div class="space-y-6">
	<!-- Summary metrics -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Peak Context</div>
			<div class="text-lg font-semibold">{formatTokens(peakTokens)}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Final Context</div>
			<div class="text-lg font-semibold">{formatTokens(finalTokens)}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">API Calls</div>
			<div class="text-lg font-semibold">{snapshots.length}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Compactions</div>
			<div class="text-lg font-semibold">{compactions.length}</div>
		</div>
	</div>

	{#if snapshots.length > 0}
		<!-- Stacked area chart -->
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-medium">
					Context Window Composition
					<span
						class="ml-2 text-[10px] text-muted-foreground"
						title="Categorical breakdown is estimated via proportional attribution; totals are exact"
					>
						~estimated breakdown
					</span>
				</h3>
				<div class="flex rounded-md border border-border text-xs">
					<button
						onclick={() => chartMode = 'cumulative'}
						class="px-2.5 py-1 transition-colors {chartMode === 'cumulative'
							? 'bg-primary/20 font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Cumulative
					</button>
					<button
						onclick={() => chartMode = 'incremental'}
						class="px-2.5 py-1 transition-colors {chartMode === 'incremental'
							? 'bg-primary/20 font-medium text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Incremental
					</button>
				</div>
			</div>
			<ContextTimeline {snapshots} {compactions} mode={chartMode} onSelect={handleChartSelect} />
			{#if selectedCallIdx !== null}
				<p class="mt-2 text-[10px] text-muted-foreground">
					Showing items for API call {selectedCallIdx}.
					<button onclick={() => handleChartSelect(null)} class="underline hover:text-foreground">Clear</button>
				</p>
			{/if}
		</div>

		<!-- Network tab table -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-3 text-sm font-medium">Context Items</h3>
			<div class="max-h-96 overflow-auto">
				<table class="w-full text-sm">
					<thead class="sticky top-0 bg-card">
						<tr class="border-b border-border text-left text-xs text-muted-foreground">
							<th class="pb-2 pr-4">Time</th>
							<th class="pb-2 pr-4">Type</th>
							<th class="pb-2 pr-4">Description</th>
							<th class="pb-2 pr-4 text-right">~Tokens</th>
							<th class="pb-2 text-right">Cumulative</th>
						</tr>
					</thead>
					<tbody>
						{#each timeline as entry, idx}
							{@const highlighted = isEntryHighlighted(entry)}
							{@const visible = selectedCallIdx === null || highlighted}
							{#if visible}
								<tr
									class="cursor-pointer border-b border-border/30 transition-colors
										{highlighted ? 'bg-primary/10' : 'hover:bg-muted/20'}"
									onclick={() => toggleExpand(idx)}
								>
									<td class="whitespace-nowrap py-1.5 pr-4 font-mono text-xs text-muted-foreground">
										{formatTime(entry.timestamp)}
									</td>
									<td class="py-1.5 pr-4">
										<span
											class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
											style="background-color: {CATEGORY_COLORS[entry.type]}20; color: {CATEGORY_COLORS[entry.type]}"
										>
											<span
												class="inline-block h-1.5 w-1.5 rounded-full"
												style="background-color: {CATEGORY_COLORS[entry.type]}"
											></span>
											{CATEGORY_LABELS[entry.type]}
										</span>
									</td>
									<td class="max-w-md py-1.5 pr-4 text-xs {expandedIdx === idx ? '' : 'truncate'}" title={entry.description}>
										{entry.description}
									</td>
									<td class="py-1.5 pr-4 text-right font-mono text-xs text-muted-foreground">
										~{formatTokens(entry.estimatedTokens)}
									</td>
									<td class="py-1.5 text-right font-mono text-xs">
										{formatTokens(entry.cumulativeTokens)}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else}
		<div class="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
			No API call data available for context decomposition.
		</div>
	{/if}
</div>
