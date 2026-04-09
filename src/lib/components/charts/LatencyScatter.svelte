<script lang="ts">
	import type { LatencyPoint } from '$lib/analysis/token-tracker.js';
	import * as d3 from 'd3';

	let { points }: { points: LatencyPoint[] } = $props();

	const margin = { top: 20, right: 20, bottom: 40, left: 60 };
	const height = 250;

	let containerWidth = $state(600);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	const maxTokens = $derived(d3.max(points, (p) => p.inputTokens) || 1);
	const maxLatency = $derived(d3.max(points, (p) => p.latencyMs) || 1);

	const xScale = $derived(
		d3.scaleLinear().domain([0, maxTokens]).range([0, chartWidth]).nice()
	);

	const yScale = $derived(
		d3.scaleLinear().domain([0, maxLatency]).range([chartHeight, 0]).nice()
	);

	// Color by model
	const models = $derived([...new Set(points.map((p) => p.model))]);
	const modelColors = $derived.by(() => {
		const palette = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#f97316'];
		const map = new Map<string, string>();
		models.forEach((m, i) => map.set(m, palette[i % palette.length]));
		return map;
	});

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	function formatDuration(ms: number): string {
		if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
		if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
		return `${ms}ms`;
	}

	function shortModel(name: string): string {
		return name
			.replace('claude-', '')
			.replace(/-\d{8}$/, '');
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
						{formatDuration(tick)}
					</text>
				</g>
			{/each}

			<!-- X axis ticks -->
			{#each xScale.ticks(6) as tick}
				<g transform="translate({xScale(tick)},{chartHeight})">
					<line y2="4" stroke="currentColor" opacity="0.3" />
					<text y="16" text-anchor="middle" fill="currentColor" opacity="0.5" class="text-[10px]">
						{formatTokens(tick)}
					</text>
				</g>
			{/each}

			<!-- Axis labels -->
			<text
				x={chartWidth / 2}
				y={chartHeight + 34}
				text-anchor="middle"
				fill="currentColor"
				opacity="0.5"
				class="text-[10px]"
			>
				Input Tokens
			</text>
			<text
				transform="rotate(-90)"
				x={-chartHeight / 2}
				y="-44"
				text-anchor="middle"
				fill="currentColor"
				opacity="0.5"
				class="text-[10px]"
			>
				Latency
			</text>

			<!-- Data points -->
			{#each points as point}
				<circle
					cx={xScale(point.inputTokens)}
					cy={yScale(point.latencyMs)}
					r="4"
					fill={modelColors.get(point.model) ?? '#6b7280'}
					opacity={point.isEstimated ? 0.4 : 0.7}
					stroke={modelColors.get(point.model) ?? '#6b7280'}
					stroke-width="1"
					stroke-dasharray={point.isEstimated ? '2,2' : 'none'}
				>
					<title>API call {point.index + 1}: {formatTokens(point.inputTokens)} input, {formatDuration(point.latencyMs)}{point.isEstimated ? ' ~est' : ''} ({shortModel(point.model)})</title>
				</circle>
			{/each}
		</g>
	</svg>

	<!-- Legend -->
	{#if models.length > 0}
		<div class="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
			{#each models as model}
				<div class="flex items-center gap-1">
					<div class="h-2.5 w-2.5 rounded-full" style="background-color: {modelColors.get(model)}; opacity: 0.7"></div>
					{shortModel(model)}
				</div>
			{/each}
			{#if points.some((p) => p.isEstimated)}
				<div class="flex items-center gap-1">
					<div class="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground opacity-40"></div>
					~estimated
				</div>
			{/if}
		</div>
	{/if}
</div>
