<script lang="ts">
	import type { CompactionPoint } from '$lib/analysis/session-aggregator.js';
	import * as d3 from 'd3';

	let { data }: { data: CompactionPoint[] } = $props();

	const margin = { top: 20, right: 20, bottom: 45, left: 60 };
	const height = 200;

	let containerWidth = $state(400);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	const xScale = $derived(
		d3.scaleLinear()
			.domain([0, d3.max(data, (d) => d.durationMs / 60_000) || 60])
			.range([0, chartWidth])
			.nice()
	);

	const yScale = $derived(
		d3.scaleLinear()
			.domain([0, d3.max(data, (d) => d.compactionCount) || 5])
			.range([chartHeight, 0])
			.nice()
	);

	function formatDuration(min: number): string {
		if (min >= 60) return `${(min / 60).toFixed(1)}h`;
		return `${Math.round(min)}m`;
	}

	function truncate(s: string, len: number): string {
		return s.length > len ? s.slice(0, len - 1) + '\u2026' : s;
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if data.length === 0}
		<div class="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
			No session data
		</div>
	{:else}
		<svg width={containerWidth} {height} class="text-xs">
			<g transform="translate({margin.left},{margin.top})">
				{#each yScale.ticks(4) as tick}
					<g transform="translate(0,{yScale(tick)})">
						<line x2={chartWidth} stroke="currentColor" opacity="0.1" />
						<text x="-8" dy="0.32em" text-anchor="end" fill="currentColor" opacity="0.5" class="text-[10px]">
							{tick}
						</text>
					</g>
				{/each}

				{#each xScale.ticks(5) as tick}
					<g transform="translate({xScale(tick)},{chartHeight})">
						<text y="16" text-anchor="middle" fill="currentColor" opacity="0.5" class="text-[10px]">
							{formatDuration(tick)}
						</text>
					</g>
				{/each}

				{#each data as d}
					<circle
						cx={xScale(d.durationMs / 60_000)}
						cy={yScale(d.compactionCount)}
						r="4"
						fill="#8b5cf6"
						opacity="0.6"
					>
						<title>{truncate(d.title, 40)}: {formatDuration(d.durationMs / 60_000)}, {d.compactionCount} compaction{d.compactionCount !== 1 ? 's' : ''}</title>
					</circle>
				{/each}

				<text
					x={chartWidth / 2}
					y={chartHeight + 32}
					text-anchor="middle"
					fill="currentColor"
					opacity="0.4"
					class="text-[10px]"
				>
					Session duration
				</text>

				<text
					transform="translate(-40,{chartHeight / 2}) rotate(-90)"
					text-anchor="middle"
					fill="currentColor"
					opacity="0.4"
					class="text-[10px]"
				>
					Compactions
				</text>
			</g>
		</svg>
	{/if}
</div>
