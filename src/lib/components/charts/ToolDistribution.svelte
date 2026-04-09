<script lang="ts">
	import type { ToolBreakdown } from '$lib/analysis/session-aggregator.js';
	import * as d3 from 'd3';

	let { data }: { data: ToolBreakdown[] } = $props();

	const margin = { top: 10, right: 60, bottom: 20, left: 100 };
	const barHeight = 20;
	const gap = 3;

	let containerWidth = $state(400);

	const limited = $derived(data.slice(0, 12));
	const height = $derived(margin.top + margin.bottom + limited.length * (barHeight + gap));
	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));

	const maxCalls = $derived(d3.max(limited, (d) => d.totalCalls) || 1);

	const xScale = $derived(
		d3.scaleLinear()
			.domain([0, maxCalls])
			.range([0, chartWidth])
			.nice()
	);

	function truncate(s: string, len: number): string {
		return s.length > len ? s.slice(0, len - 1) + '\u2026' : s;
	}

	function formatCount(n: number): string {
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if limited.length === 0}
		<div class="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
			No tool data
		</div>
	{:else}
		<svg width={containerWidth} height={height} class="text-xs">
			<g transform="translate({margin.left},{margin.top})">
				{#each limited as d, i}
					{@const y = i * (barHeight + gap)}
					<text
						x="-8"
						y={y + barHeight / 2}
						dy="0.35em"
						text-anchor="end"
						fill="currentColor"
						opacity="0.7"
						class="text-[10px] font-mono"
					>
						{truncate(d.tool, 14)}
					</text>
					<rect
						x={0}
						y={y}
						width={xScale(d.totalCalls)}
						height={barHeight}
						fill="#f59e0b"
						opacity="0.6"
						rx="2"
					>
						<title>{d.tool}: {d.totalCalls.toLocaleString()} calls across {d.sessionCount} session{d.sessionCount > 1 ? 's' : ''}</title>
					</rect>
					<text
						x={xScale(d.totalCalls) + 6}
						y={y + barHeight / 2}
						dy="0.35em"
						fill="currentColor"
						opacity="0.6"
						class="text-[10px] font-mono"
					>
						{formatCount(d.totalCalls)}
					</text>
				{/each}
			</g>
		</svg>
	{/if}
</div>
