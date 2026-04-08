<script lang="ts">
	import type { TokenSnapshot } from '$lib/analysis/token-tracker.js';
	import * as d3 from 'd3';

	let { snapshots }: { snapshots: TokenSnapshot[] } = $props();

	const margin = { top: 20, right: 20, bottom: 40, left: 60 };
	const height = 300;

	let containerWidth = $state(600);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	const categories = ['inputTokens', 'cacheCreateTokens', 'cacheReadTokens', 'outputTokens'] as const;
	const colors: Record<typeof categories[number], string> = {
		inputTokens: '#ef4444',       // red — uncached input
		cacheReadTokens: '#22c55e',   // green — cache hits
		cacheCreateTokens: '#eab308', // yellow — cache creation
		outputTokens: '#3b82f6',      // blue — output
	};
	const labels: Record<typeof categories[number], string> = {
		inputTokens: 'Input (uncached)',
		cacheReadTokens: 'Cache Read',
		cacheCreateTokens: 'Cache Create',
		outputTokens: 'Output',
	};

	const xScale = $derived(
		d3.scaleBand()
			.domain(snapshots.map((_, i) => String(i)))
			.range([0, chartWidth])
			.padding(0.1)
	);

	const maxTokens = $derived(
		d3.max(snapshots, (s) =>
			s.inputTokens + s.cacheReadTokens + s.cacheCreateTokens + s.outputTokens
		) || 1
	);

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

	const bars = $derived(
		snapshots.map((s, i) => {
			let y0 = 0;
			const segments = categories.map((cat) => {
				const value = s[cat];
				const segment = {
					key: cat,
					x: xScale(String(i)) ?? 0,
					y: yScale(y0 + value),
					width: xScale.bandwidth(),
					height: yScale(y0) - yScale(y0 + value),
					fill: colors[cat],
					value,
				};
				y0 += value;
				return segment;
			});
			return { index: i, segments, snapshot: s };
		})
	);
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	<svg width={containerWidth} {height} class="text-xs">
		<g transform="translate({margin.left},{margin.top})">
			<!-- Y axis -->
			{#each yScale.ticks(5) as tick}
				<g transform="translate(0,{yScale(tick)})">
					<line x2={chartWidth} stroke="currentColor" opacity="0.1" />
					<text x="-8" dy="0.32em" text-anchor="end" fill="currentColor" opacity="0.5" class="text-[10px]">
						{formatTokens(tick)}
					</text>
				</g>
			{/each}

			<!-- Bars -->
			{#each bars as bar}
				{#each bar.segments as seg}
					{#if seg.height > 0}
						<rect
							x={seg.x}
							y={seg.y}
							width={seg.width}
							height={seg.height}
							fill={seg.fill}
							opacity="0.85"
						>
							<title>{labels[seg.key]}: {formatTokens(seg.value)}</title>
						</rect>
					{/if}
				{/each}
			{/each}

			<!-- X axis label -->
			<text
				x={chartWidth / 2}
				y={chartHeight + 30}
				text-anchor="middle"
				fill="currentColor"
				opacity="0.5"
				class="text-[11px]"
			>
				API Call
			</text>
		</g>
	</svg>

	<!-- Legend -->
	<div class="mt-2 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
		{#each categories as cat}
			<div class="flex items-center gap-1.5">
				<div class="h-2.5 w-2.5 rounded-sm" style="background-color: {colors[cat]}"></div>
				<span>{labels[cat]}</span>
			</div>
		{/each}
	</div>
</div>
