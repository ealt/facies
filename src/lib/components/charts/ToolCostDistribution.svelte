<script lang="ts">
	import type { ToolSummary } from '$lib/analysis/tool-analyzer.js';

	let { summaries }: { summaries: ToolSummary[] } = $props();

	// Distinct colors for up to 12 tools, then cycle
	const PALETTE = [
		'#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
		'#06b6d4', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6',
		'#84cc16', '#6b7280',
	];

	function color(idx: number): string {
		return PALETTE[idx % PALETTE.length];
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(Math.round(n));
	}

	const totalTokens = $derived(summaries.reduce((sum, s) => sum + s.totalContextTokens, 0));

	interface Segment {
		toolName: string;
		fraction: number;
		offset: number;
		color: string;
		tokens: number;
	}

	const segments = $derived.by(() => {
		const result: Segment[] = [];
		let offset = 0;
		for (let i = 0; i < summaries.length; i++) {
			const s = summaries[i];
			const fraction = totalTokens > 0 ? s.totalContextTokens / totalTokens : 0;
			result.push({
				toolName: s.toolName,
				fraction,
				offset,
				color: color(i),
				tokens: s.totalContextTokens,
			});
			offset += fraction;
		}
		return result;
	});
</script>

{#if totalTokens > 0}
	<div class="space-y-3">
		<!-- Stacked bar -->
		<div class="relative h-8 w-full overflow-hidden rounded-md">
			{#each segments as seg}
				{#if seg.fraction > 0}
					<div
						class="absolute inset-y-0"
						style="left: {seg.offset * 100}%; width: {seg.fraction * 100}%; background-color: {seg.color}"
						title="{seg.toolName}: ~{formatTokens(seg.tokens)} tokens ({(seg.fraction * 100).toFixed(1)}%)"
					></div>
				{/if}
			{/each}
		</div>

		<!-- Legend -->
		<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
			{#each segments as seg}
				{#if seg.fraction > 0.005}
					<div class="flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-sm" style="background-color: {seg.color}"></span>
						<span class="text-muted-foreground">{seg.toolName}</span>
						<span class="font-mono">~{formatTokens(seg.tokens)} tokens</span>
						<span class="text-muted-foreground">({(seg.fraction * 100).toFixed(1)}%)</span>
					</div>
				{/if}
			{/each}
		</div>
	</div>
{:else}
	<p class="text-sm text-muted-foreground">No tool response data.</p>
{/if}
