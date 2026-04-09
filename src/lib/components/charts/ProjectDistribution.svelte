<script lang="ts">
	import type { ProjectBreakdown } from '$lib/analysis/session-aggregator.js';
	import * as d3 from 'd3';

	let { data }: { data: ProjectBreakdown[] } = $props();

	const margin = { top: 10, right: 60, bottom: 20, left: 120 };
	const barHeight = 24;
	const gap = 4;

	let containerWidth = $state(400);

	const limited = $derived(data.slice(0, 10));
	const height = $derived(margin.top + margin.bottom + limited.length * (barHeight + gap));
	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));

	const maxSessions = $derived(d3.max(limited, (d) => d.sessions) || 1);

	const xScale = $derived(
		d3.scaleLinear()
			.domain([0, maxSessions])
			.range([0, chartWidth])
			.nice()
	);

	function truncate(s: string, len: number): string {
		return s.length > len ? s.slice(0, len - 1) + '\u2026' : s;
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if limited.length === 0}
		<div class="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
			No project data
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
						class="text-[11px]"
					>
						{truncate(d.project, 16)}
					</text>
					<rect
						x={0}
						y={y}
						width={xScale(d.sessions)}
						height={barHeight}
						fill="#8b5cf6"
						opacity="0.6"
						rx="2"
					>
						<title>{d.project}: {d.sessions} session{d.sessions > 1 ? 's' : ''}</title>
					</rect>
					<text
						x={xScale(d.sessions) + 6}
						y={y + barHeight / 2}
						dy="0.35em"
						fill="currentColor"
						opacity="0.6"
						class="text-[10px] font-mono"
					>
						{d.sessions}
					</text>
				{/each}
			</g>
		</svg>
	{/if}
</div>
