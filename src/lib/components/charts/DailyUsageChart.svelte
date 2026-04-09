<script lang="ts">
	import type { DailyUsage } from '$lib/analysis/session-aggregator.js';
	import * as d3 from 'd3';

	let { data }: { data: DailyUsage[] } = $props();

	const margin = { top: 20, right: 20, bottom: 50, left: 60 };
	const height = 220;

	let containerWidth = $state(600);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	const xScale = $derived(
		d3.scaleBand()
			.domain(data.map((d) => d.date))
			.range([0, chartWidth])
			.padding(0.2)
	);

	const maxTokens = $derived(d3.max(data, (d) => d.inputTokens + d.outputTokens) || 1);

	const yScale = $derived(
		d3.scaleLinear()
			.domain([0, maxTokens])
			.range([chartHeight, 0])
			.nice()
	);

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
		return String(n);
	}

	function formatDate(d: string): string {
		const date = new Date(d + 'T00:00:00');
		return d3.timeFormat('%b %d')(date);
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if data.length === 0}
		<div class="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
			No usage data
		</div>
	{:else}
		<svg width={containerWidth} {height} class="text-xs">
			<g transform="translate({margin.left},{margin.top})">
				{#each yScale.ticks(5) as tick}
					<g transform="translate(0,{yScale(tick)})">
						<line x2={chartWidth} stroke="currentColor" opacity="0.1" />
						<text x="-8" dy="0.32em" text-anchor="end" fill="currentColor" opacity="0.5" class="text-[10px]">
							{formatTokens(tick)}
						</text>
					</g>
				{/each}

				{#each data as d}
					{@const x = xScale(d.date) ?? 0}
					{@const bw = xScale.bandwidth()}
					{@const inputH = chartHeight - yScale(d.inputTokens)}
					{@const outputH = chartHeight - yScale(d.outputTokens)}
					<!-- Input tokens (bottom) -->
					<rect
						x={x}
						y={yScale(d.inputTokens + d.outputTokens)}
						width={bw}
						height={inputH + outputH}
						fill="#3b82f6"
						opacity="0.7"
					>
						<title>{formatDate(d.date)}: {formatTokens(d.inputTokens)} in + {formatTokens(d.outputTokens)} out ({d.sessions} session{d.sessions > 1 ? 's' : ''})</title>
					</rect>
					<!-- Output tokens (top) -->
					<rect
						x={x}
						y={yScale(d.inputTokens + d.outputTokens)}
						width={bw}
						height={outputH}
						fill="#22c55e"
						opacity="0.7"
					>
						<title>{formatDate(d.date)}: {formatTokens(d.outputTokens)} output</title>
					</rect>
				{/each}

				{#each data as d, i}
					{#if i % Math.max(1, Math.floor(data.length / 8)) === 0 || i === data.length - 1}
						{@const x = (xScale(d.date) ?? 0) + xScale.bandwidth() / 2}
						<text
							x={x}
							y={chartHeight + 16}
							text-anchor="middle"
							fill="currentColor"
							opacity="0.5"
							class="text-[10px]"
						>
							{formatDate(d.date)}
						</text>
					{/if}
				{/each}
			</g>
		</svg>

		<div class="mt-1 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
			<span class="flex items-center gap-1">
				<span class="inline-block h-2 w-2 rounded-sm bg-blue-500 opacity-70"></span> Input
			</span>
			<span class="flex items-center gap-1">
				<span class="inline-block h-2 w-2 rounded-sm bg-green-500 opacity-70"></span> Output
			</span>
		</div>
	{/if}
</div>
