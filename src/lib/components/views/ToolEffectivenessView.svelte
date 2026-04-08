<script lang="ts">
	import type { ToolAnalysis, ToolSummary } from '$lib/analysis/tool-analyzer.js';
	import type { SubagentSummary } from '$lib/types.js';
	import ToolCostDistribution from '$lib/components/charts/ToolCostDistribution.svelte';
	import ToolTimeline from '$lib/components/charts/ToolTimeline.svelte';
	import ToolScatter from '$lib/components/charts/ToolScatter.svelte';
	import SubagentDeepDive from '$lib/components/views/SubagentDeepDive.svelte';
	import FailureAnalysisPanel from '$lib/components/views/FailureAnalysisPanel.svelte';

	let { analysis, subagentSummaries = [] }: { analysis: ToolAnalysis; subagentSummaries?: SubagentSummary[] } = $props();

	// Sortable table state
	type SortKey = 'toolName' | 'callCount' | 'successRate' | 'avgLatencyMs' | 'avgInputSize' | 'avgResponseSize' | 'totalContextTokens' | 'estimatedContextCost' | 'costPerCall';
	let sortKey = $state<SortKey>('callCount');
	let sortAsc = $state(false);

	const sortedSummaries = $derived.by(() => {
		const list = [...analysis.summaries];
		list.sort((a, b) => {
			const av = sortValue(a, sortKey);
			const bv = sortValue(b, sortKey);
			const cmp = av < bv ? -1 : av > bv ? 1 : 0;
			return sortAsc ? cmp : -cmp;
		});
		return list;
	});

	function sortValue(s: ToolSummary, key: SortKey): number | string {
		switch (key) {
			case 'toolName': return s.toolName.toLowerCase();
			case 'callCount': return s.callCount;
			case 'successRate': return s.successRate;
			case 'avgLatencyMs': return s.avgLatencyMs ?? -1;
			case 'avgInputSize': return s.avgInputSize;
			case 'avgResponseSize': return s.avgResponseSize;
			case 'totalContextTokens': return s.totalContextTokens;
			case 'estimatedContextCost': return s.estimatedContextCost ?? -1;
			case 'costPerCall': return s.costPerCall ?? -1;
		}
	}

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = false;
		}
	}

	function sortIndicator(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' \u25B2' : ' \u25BC';
	}

	function formatMs(ms: number | null): string {
		if (ms === null) return '\u2014';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function formatBytes(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}KB`;
		return `${n}B`;
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(Math.round(n));
	}

	function formatCost(c: number | null): string {
		if (c === null) return '\u2014';
		if (c < 0.01) return `$${c.toFixed(4)}`;
		return `$${c.toFixed(2)}`;
	}

	function formatRate(r: number): string {
		return `${(r * 100).toFixed(0)}%`;
	}
</script>

<div class="space-y-6">
	<!-- Summary metrics -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Total Calls</div>
			<div class="text-lg font-semibold">{analysis.totalCalls}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Success Rate</div>
			<div class="text-lg font-semibold">{formatRate(analysis.overallSuccessRate)}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Unique Tools</div>
			<div class="text-lg font-semibold">{analysis.summaries.length}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Total Response Data</div>
			<div class="text-lg font-semibold">{formatBytes(analysis.totalResponseBytes)}</div>
		</div>
	</div>

	{#if analysis.unmatchedPreCount > 0}
		<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
			<p class="text-sm text-yellow-200">
				{analysis.unmatchedPreCount} tool call{analysis.unmatchedPreCount > 1 ? 's' : ''} started but never completed.
				Session may have been interrupted.
			</p>
		</div>
	{/if}

	{#if analysis.summaries.length > 0}
		<!-- Tool cost distribution -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-3 text-sm font-medium">
				Context Cost Distribution
				<span
					class="ml-2 text-[10px] text-muted-foreground"
					title="~Estimated context tokens per tool (response bytes / 4). Shows how much each tool contributes to context window usage."
				>
					~estimated
				</span>
			</h3>
			<ToolCostDistribution summaries={analysis.summaries} />
		</div>

		<!-- Sortable summary table -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-3 text-sm font-medium">Tool Summary</h3>
			<div class="overflow-auto">
				<table class="w-full text-sm">
					<thead class="sticky top-0 bg-card">
						<tr class="border-b border-border text-left text-xs text-muted-foreground">
							<th class="cursor-pointer pb-2 pr-3 select-none" onclick={() => toggleSort('toolName')}>
								Tool{sortIndicator('toolName')}
							</th>
							<th class="cursor-pointer pb-2 pr-3 text-right select-none" onclick={() => toggleSort('callCount')}>
								Calls{sortIndicator('callCount')}
							</th>
							<th class="cursor-pointer pb-2 pr-3 text-right select-none" onclick={() => toggleSort('successRate')}>
								Success{sortIndicator('successRate')}
							</th>
							<th class="cursor-pointer pb-2 pr-3 text-right select-none" onclick={() => toggleSort('avgLatencyMs')}>
								Avg Latency{sortIndicator('avgLatencyMs')}
							</th>
							<th class="cursor-pointer pb-2 pr-3 text-right select-none" onclick={() => toggleSort('avgInputSize')}>
								Avg Input{sortIndicator('avgInputSize')}
							</th>
							<th class="cursor-pointer pb-2 pr-3 text-right select-none" onclick={() => toggleSort('avgResponseSize')}>
								Avg Response{sortIndicator('avgResponseSize')}
							</th>
							<th class="cursor-pointer pb-2 pr-3 text-right select-none" onclick={() => toggleSort('totalContextTokens')}>
								~Context Cost{sortIndicator('totalContextTokens')}
							</th>
							<th class="cursor-pointer pb-2 pr-3 text-right select-none" onclick={() => toggleSort('estimatedContextCost')}>
								~Est. Cost{sortIndicator('estimatedContextCost')}
							</th>
							<th class="cursor-pointer pb-2 text-right select-none" onclick={() => toggleSort('costPerCall')}>
								~Cost/Call{sortIndicator('costPerCall')}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedSummaries as summary}
							<tr class="border-b border-border/30 hover:bg-muted/20">
								<td class="py-1.5 pr-3 font-medium">{summary.toolName}</td>
								<td class="py-1.5 pr-3 text-right font-mono text-xs">
									{summary.callCount}
									{#if summary.failureCount > 0}
										<span class="ml-1 text-red-400" title="{summary.failureCount} failed">
											({summary.failureCount} <span class="text-[10px]">fail</span>)
										</span>
									{/if}
								</td>
								<td class="py-1.5 pr-3 text-right font-mono text-xs">
									<span class={summary.successRate < 0.8 ? 'text-red-400' : summary.successRate < 1 ? 'text-yellow-400' : 'text-green-400'}>
										{formatRate(summary.successRate)}
									</span>
								</td>
								<td class="py-1.5 pr-3 text-right font-mono text-xs text-muted-foreground">
									{formatMs(summary.avgLatencyMs)}
									{#if summary.p95LatencyMs !== null}
										<span class="ml-1 text-[10px]" title="p95 latency">
											(p95: {formatMs(summary.p95LatencyMs)})
										</span>
									{/if}
								</td>
								<td class="py-1.5 pr-3 text-right font-mono text-xs text-muted-foreground">
									{formatBytes(summary.avgInputSize)}
								</td>
								<td class="py-1.5 pr-3 text-right font-mono text-xs">
									{formatBytes(summary.avgResponseSize)}
								</td>
								<td class="py-1.5 pr-3 text-right font-mono text-xs" title="~{summary.totalContextTokens} tokens">
									~{formatTokens(summary.totalContextTokens)}
								</td>
								<td class="py-1.5 pr-3 text-right font-mono text-xs text-muted-foreground">
									{formatCost(summary.estimatedContextCost)}
								</td>
								<td class="py-1.5 text-right font-mono text-xs text-muted-foreground">
									{formatCost(summary.costPerCall)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		<!-- Tool timeline (Gantt-style) -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-3 text-sm font-medium">Tool Timeline</h3>
			<ToolTimeline calls={analysis.calls} />
		</div>

		<!-- Context cost vs latency scatter -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-3 text-sm font-medium">
				Context Cost vs Latency
				<span class="ml-2 text-[10px] text-muted-foreground">dot size = response size</span>
			</h3>
			<ToolScatter calls={analysis.calls} />
		</div>

		<!-- Failure analysis panel -->
		{#if analysis.totalFailures > 0}
			<FailureAnalysisPanel calls={analysis.calls} />
		{/if}

		<!-- Subagent deep dive -->
		{#if subagentSummaries.length > 0}
			<div class="rounded-lg border border-border bg-card p-4">
				<h3 class="mb-3 text-sm font-medium">
					Subagent Deep Dive
					<span class="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{subagentSummaries.length}</span>
				</h3>
				<SubagentDeepDive summaries={subagentSummaries} />
			</div>
		{/if}
	{:else}
		<div class="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
			No tool call data available.
		</div>
	{/if}
</div>
