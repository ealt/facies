<script lang="ts">
	import type { TokenEconomics, LatencyPoint } from '$lib/analysis/token-tracker.js';
	import TokenWaterfall from '$lib/components/charts/TokenWaterfall.svelte';
	import CumulativeCost from '$lib/components/charts/CumulativeCost.svelte';
	import CacheEfficiency from '$lib/components/charts/CacheEfficiency.svelte';
	import CostBreakdown from '$lib/components/charts/CostBreakdown.svelte';
	import LatencyScatter from '$lib/components/charts/LatencyScatter.svelte';

	let { economics, latencyPoints }: { economics: TokenEconomics; latencyPoints: LatencyPoint[] } = $props();

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

	function formatPercent(n: number): string {
		return `${(n * 100).toFixed(1)}%`;
	}

	function formatDuration(ms: number | null): string {
		if (ms === null) return 'N/A';
		if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
		if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
		return `${Math.round(ms)}ms`;
	}

	// Per-model average latency from latency points
	const avgLatencyByModel = $derived.by(() => {
		const map = new Map<string, { total: number; count: number }>();
		for (const p of latencyPoints) {
			const entry = map.get(p.model) ?? { total: 0, count: 0 };
			entry.total += p.latencyMs;
			entry.count++;
			map.set(p.model, entry);
		}
		const result = new Map<string, number>();
		for (const [model, { total, count }] of map) {
			result.set(model, total / count);
		}
		return result;
	});

	// Check if any models have unknown pricing (omitted from treemap)
	const hasUnpricedModels = $derived(
		economics.perModel.some((m) => m.totalCost === null)
	);

	const inputBreakdown = $derived(
		`Fresh: ${formatTokens(economics.totalInputTokens)}, Cache read: ${formatTokens(economics.totalCacheReadTokens)}, Cache create: ${formatTokens(economics.totalCacheCreateTokens)}`
	);

	const totalInputAll = $derived(
		economics.totalInputTokens + economics.totalCacheReadTokens + economics.totalCacheCreateTokens
	);
</script>

<div class="space-y-6">
	<!-- Metrics bar -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Total Cost</div>
			<div class="text-lg font-semibold">
				{formatCost(economics.totalCost)}
				{#if economics.costIsLowerBound}
					<span class="text-xs text-yellow-400" title="Some API calls used unknown models">~</span>
				{/if}
			</div>
		</div>

		<div class="rounded-lg border border-border bg-card p-3" title={inputBreakdown}>
			<div class="text-xs text-muted-foreground">Input Tokens</div>
			<div class="text-lg font-semibold">{formatTokens(totalInputAll)}</div>
			<div class="text-[10px] text-muted-foreground">{inputBreakdown}</div>
		</div>

		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Output Tokens</div>
			<div class="text-lg font-semibold">{formatTokens(economics.totalOutputTokens)}</div>
		</div>

		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Cache Hit Rate</div>
			<div class="text-lg font-semibold">{formatPercent(economics.overallCacheRate)}</div>
		</div>

		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Saved by Caching</div>
			<div class="text-lg font-semibold text-green-400">
				{formatCost(economics.costSavedByCaching)}
				{#if economics.costSavedIsLowerBound}
					<span class="text-xs text-yellow-400" title="Some API calls used unknown models">~</span>
				{/if}
			</div>
		</div>

		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Avg Cost/Turn</div>
			<div class="text-lg font-semibold">{formatCost(economics.avgCostPerTurn)}</div>
		</div>
	</div>

	{#if economics.models.length > 0}
		<!-- Model badges -->
		<div class="flex items-center gap-2 text-sm">
			<span class="text-muted-foreground">Models:</span>
			{#each economics.models as model}
				<span class="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{model}</span>
			{/each}
		</div>
	{/if}

	{#if economics.snapshots.length > 0}
		<!-- Token Waterfall -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-3 text-sm font-medium">Token Waterfall</h3>
			<TokenWaterfall snapshots={economics.snapshots} />
		</div>

		<!-- Cumulative Cost + Cache Efficiency side by side -->
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="rounded-lg border border-border bg-card p-4">
				<h3 class="mb-3 text-sm font-medium">Cumulative Cost</h3>
				<CumulativeCost snapshots={economics.snapshots} />
			</div>

			<div class="rounded-lg border border-border bg-card p-4">
				<h3 class="mb-3 text-sm font-medium">Cache Efficiency</h3>
				<CacheEfficiency snapshots={economics.snapshots} />
			</div>
		</div>

		<!-- Cost Breakdown + Latency Scatter side by side -->
		<div class="grid gap-4 lg:grid-cols-2">
			{#if economics.perModel.length > 0}
				<div class="rounded-lg border border-border bg-card p-4">
					<h3 class="mb-3 text-sm font-medium">Cost Breakdown</h3>
					<CostBreakdown perModel={economics.perModel} />
					{#if hasUnpricedModels}
						<p class="mt-2 text-[10px] text-yellow-400">
							~ Some models have unknown pricing and are not shown in the treemap.
						</p>
					{/if}
				</div>
			{/if}

			{#if latencyPoints.length > 0}
				<div class="rounded-lg border border-border bg-card p-4">
					<h3 class="mb-3 text-sm font-medium">Latency vs Input Tokens</h3>
					<LatencyScatter points={latencyPoints} />
				</div>
			{/if}
		</div>

		<!-- Per-model comparison table -->
		{#if economics.perModel.length > 1}
			<div class="rounded-lg border border-border bg-card p-4">
				<h3 class="mb-3 text-sm font-medium">Per-Model Breakdown</h3>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-border text-left text-xs text-muted-foreground">
								<th class="pb-2 pr-4">Model</th>
								<th class="pb-2 pr-4 text-right">API Calls</th>
								<th class="pb-2 pr-4 text-right">Input Tokens</th>
								<th class="pb-2 pr-4 text-right">Output Tokens</th>
								<th class="pb-2 pr-4 text-right">Cache Rate</th>
								<th class="pb-2 pr-4 text-right">Total Cost</th>
								<th class="pb-2 text-right">Avg Latency</th>
							</tr>
						</thead>
						<tbody>
							{#each economics.perModel as row}
								<tr class="border-b border-border/50">
									<td class="py-2 pr-4 font-mono text-xs">{row.model}</td>
									<td class="py-2 pr-4 text-right">{row.apiCalls}</td>
									<td class="py-2 pr-4 text-right">{formatTokens(row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens)}</td>
									<td class="py-2 pr-4 text-right">{formatTokens(row.outputTokens)}</td>
									<td class="py-2 pr-4 text-right">{formatPercent(row.cacheRate)}</td>
									<td class="py-2 pr-4 text-right">{formatCost(row.totalCost)}</td>
									<td class="py-2 text-right">{formatDuration(avgLatencyByModel.get(row.model) ?? null)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{:else}
		<div class="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
			No API call data available for token economics.
		</div>
	{/if}
</div>
