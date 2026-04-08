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

	const yScale = $derived(
		d3.scaleLinear()
			.domain([0, 1])
			.range([chartHeight, 0])
	);

	const linePath = $derived(
		d3.line<TokenSnapshot>()
			.x((d) => xScale(new Date(d.timestamp)))
			.y((d) => yScale(d.cacheRate))
			(snapshots) ?? ''
	);

	const areaPath = $derived(
		d3.area<TokenSnapshot>()
			.x((d) => xScale(new Date(d.timestamp)))
			.y0(chartHeight)
			.y1((d) => yScale(d.cacheRate))
			(snapshots) ?? ''
	);

	function formatTime(d: Date): string {
		return d3.timeFormat('%H:%M')(d);
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	<svg width={containerWidth} {height} class="text-xs">
		<g transform="translate({margin.left},{margin.top})">
			<!-- Y axis gridlines -->
			{#each [0, 0.25, 0.50, 0.75, 1.0] as tick}
				<g transform="translate(0,{yScale(tick)})">
					<line x2={chartWidth} stroke="currentColor" opacity="0.1" />
					<text x="-8" dy="0.32em" text-anchor="end" fill="currentColor" opacity="0.5" class="text-[10px]">
						{(tick * 100).toFixed(0)}%
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

			<!-- Area fill -->
			<path
				d={areaPath}
				fill="#22c55e"
				opacity="0.1"
			/>

			<!-- Line -->
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
					cy={yScale(snap.cacheRate)}
					r="3"
					fill="#22c55e"
				>
					<title>Call {snap.index}: {(snap.cacheRate * 100).toFixed(1)}% cache rate</title>
				</circle>
			{/each}
		</g>
	</svg>
</div>
