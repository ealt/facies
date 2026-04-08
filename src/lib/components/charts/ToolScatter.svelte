<script lang="ts">
	import type { ToolCall } from '$lib/types.js';
	import * as d3 from 'd3';

	let { calls }: { calls: ToolCall[] } = $props();

	const margin = { top: 20, right: 20, bottom: 40, left: 60 };
	const height = 250;

	let containerWidth = $state(600);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	// Only scatter calls with known latency
	const scatterCalls = $derived(calls.filter((c) => c.latencyMs !== null));

	// Tool names for color mapping
	const toolNames = $derived.by(() => {
		const seen = new Set<string>();
		const names: string[] = [];
		for (const c of calls) {
			if (!seen.has(c.toolName)) {
				seen.add(c.toolName);
				names.push(c.toolName);
			}
		}
		return names;
	});

	const PALETTE = [
		'#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
		'#06b6d4', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6',
		'#84cc16', '#6b7280',
	];

	const toolColorMap = $derived.by(() => {
		const map = new Map<string, string>();
		toolNames.forEach((name, i) => map.set(name, PALETTE[i % PALETTE.length]));
		return map;
	});

	const maxResponse = $derived(d3.max(scatterCalls, (c) => c.responseSize) || 1);
	const maxLatency = $derived(d3.max(scatterCalls, (c) => c.latencyMs!) || 1);

	const xScale = $derived(
		d3.scaleLinear().domain([0, maxResponse]).range([0, chartWidth]).nice()
	);

	const yScale = $derived(
		d3.scaleLinear().domain([0, maxLatency]).range([chartHeight, 0]).nice()
	);

	// Size scale: radius proportional to response size (context cost proxy)
	const sizeScale = $derived(
		d3.scaleSqrt().domain([0, maxResponse]).range([3, 14])
	);

	function formatBytes(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}KB`;
		return `${n}B`;
	}

	function formatMs(ms: number): string {
		if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
		if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
		return `${Math.round(ms)}ms`;
	}
</script>

{#if scatterCalls.length > 0}
	<div class="w-full" bind:clientWidth={containerWidth}>
		<svg width={containerWidth} {height} class="text-xs">
			<g transform="translate({margin.left},{margin.top})">
				<!-- Y axis gridlines -->
				{#each yScale.ticks(5) as tick}
					<g transform="translate(0,{yScale(tick)})">
						<line x2={chartWidth} stroke="currentColor" opacity="0.1" />
						<text x="-8" dy="0.32em" text-anchor="end" fill="currentColor" opacity="0.5" class="text-[10px]">
							{formatMs(tick)}
						</text>
					</g>
				{/each}

				<!-- X axis ticks -->
				{#each xScale.ticks(6) as tick}
					<g transform="translate({xScale(tick)},{chartHeight})">
						<line y2="4" stroke="currentColor" opacity="0.3" />
						<text y="16" text-anchor="middle" fill="currentColor" opacity="0.5" class="text-[10px]">
							{formatBytes(tick)}
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
					Response Size
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
				{#each scatterCalls as call}
					{@const color = toolColorMap.get(call.toolName) ?? '#6b7280'}
					<circle
						cx={xScale(call.responseSize)}
						cy={yScale(call.latencyMs!)}
						r={sizeScale(call.responseSize)}
						fill={color}
						opacity={call.failed ? 0.4 : 0.6}
						stroke={call.failed ? '#ef4444' : color}
						stroke-width={call.failed ? 1.5 : 1}
					>
						<title>{call.toolName}{call.failed ? ' (FAILED)' : ''}: {formatBytes(call.responseSize)} response, {formatMs(call.latencyMs!)}</title>
					</circle>
				{/each}
			</g>
		</svg>

		<!-- Legend -->
		{#if toolNames.length > 0}
			<div class="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
				{#each toolNames as name}
					<div class="flex items-center gap-1">
						<div class="h-2.5 w-2.5 rounded-full" style="background-color: {toolColorMap.get(name)}; opacity: 0.7"></div>
						{name}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">No tool calls with latency data.</p>
{/if}
