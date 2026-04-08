<script lang="ts">
	import type { TokenSnapshot } from '$lib/analysis/token-tracker.js';
	import * as d3 from 'd3';

	let { snapshots }: { snapshots: TokenSnapshot[] } = $props();

	const margin = { top: 20, right: 20, bottom: 40, left: 60 };
	const height = 250;

	let containerWidth = $state(600);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	const timestamps = $derived(snapshots.map((s) => new Date(s.timestamp)));

	const xScale = $derived(
		d3.scaleTime()
			.domain(d3.extent(timestamps) as [Date, Date] ?? [new Date(), new Date()])
			.range([0, chartWidth])
	);

	const maxCost = $derived(
		d3.max(snapshots, (s) => s.cumulativeCost) || 1
	);

	const yScale = $derived(
		d3.scaleLinear()
			.domain([0, maxCost])
			.range([chartHeight, 0])
			.nice()
	);

	const linePath = $derived(
		d3.line<TokenSnapshot>()
			.x((d) => xScale(new Date(d.timestamp)))
			.y((d) => yScale(d.cumulativeCost))
			(snapshots) ?? ''
	);

	// Per-call cost bars
	const barWidth = $derived(
		snapshots.length > 1 ? Math.max(chartWidth / snapshots.length * 0.6, 2) : 20
	);

	const maxPerCallCost = $derived(
		d3.max(snapshots, (s) => s.cost ?? 0) || 1
	);

	const barYScale = $derived(
		d3.scaleLinear()
			.domain([0, maxPerCallCost])
			.range([0, chartHeight * 0.3])
	);

	function formatCost(n: number): string {
		if (n >= 1) return `$${n.toFixed(2)}`;
		if (n >= 0.01) return `$${n.toFixed(3)}`;
		return `$${n.toFixed(4)}`;
	}

	function formatTime(d: Date): string {
		return d3.timeFormat('%H:%M')(d);
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	<svg width={containerWidth} {height} class="text-xs">
		<g transform="translate({margin.left},{margin.top})">
			<!-- Y axis gridlines -->
			{#each yScale.ticks(5) as tick}
				<g transform="translate(0,{yScale(tick)})">
					<line x2={chartWidth} stroke="currentColor" opacity="0.1" />
					<text x="-8" dy="0.32em" text-anchor="end" fill="currentColor" opacity="0.5" class="text-[10px]">
						{formatCost(tick)}
					</text>
				</g>
			{/each}

			<!-- X axis ticks -->
			{#each xScale.ticks(6) as tick}
				<g transform="translate({xScale(tick)},{chartHeight})">
					<line y2="4" stroke="currentColor" opacity="0.3" />
					<text y="16" text-anchor="middle" fill="currentColor" opacity="0.5" class="text-[10px]">
						{formatTime(tick)}
					</text>
				</g>
			{/each}

			<!-- Per-call cost bars (background) -->
			{#each snapshots as snap}
				{#if snap.cost !== null && snap.cost > 0}
					<rect
						x={xScale(new Date(snap.timestamp)) - barWidth / 2}
						y={chartHeight - barYScale(snap.cost)}
						width={barWidth}
						height={barYScale(snap.cost)}
						fill="#3b82f6"
						opacity="0.15"
					>
						<title>Call {snap.index}: {formatCost(snap.cost)}</title>
					</rect>
				{/if}
			{/each}

			<!-- Cumulative cost line -->
			<path
				d={linePath}
				fill="none"
				stroke="#22c55e"
				stroke-width="2"
			/>

			<!-- Dots -->
			{#each snapshots as snap}
				<circle
					cx={xScale(new Date(snap.timestamp))}
					cy={yScale(snap.cumulativeCost)}
					r="3"
					fill="#22c55e"
				>
					<title>Call {snap.index}: cumulative {formatCost(snap.cumulativeCost)}</title>
				</circle>
			{/each}
		</g>
	</svg>
</div>
