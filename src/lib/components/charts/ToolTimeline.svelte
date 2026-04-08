<script lang="ts">
	import type { ToolCall } from '$lib/types.js';
	import * as d3 from 'd3';

	let { calls }: { calls: ToolCall[] } = $props();

	const margin = { top: 20, right: 20, bottom: 40, left: 80 };
	const ROW_HEIGHT = 22;
	const BAR_HEIGHT = 14;
	const MIN_BAR_WIDTH = 3;

	let containerWidth = $state(600);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));

	// Split calls by known vs unknown latency
	const timedCalls = $derived(calls.filter((c) => c.latencyMs !== null));
	const untimedCalls = $derived(calls.filter((c) => c.latencyMs === null));

	// Distinct tool names (sorted by first appearance)
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

	const chartHeight = $derived(Math.max(toolNames.length * ROW_HEIGHT, 40));
	const totalHeight = $derived(chartHeight + margin.top + margin.bottom);

	// Color palette matching ToolCostDistribution
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

	// Time scale — session-relative
	const timeExtent = $derived.by(() => {
		if (calls.length === 0) return [0, 1] as [number, number];
		const times = calls.map((c) => new Date(c.timestamp).getTime());
		const endTimes = calls
			.filter((c) => c.latencyMs !== null)
			.map((c) => new Date(c.timestamp).getTime() + (c.latencyMs ?? 0));
		const min = d3.min(times) ?? 0;
		const max = Math.max(d3.max(times) ?? 1, d3.max(endTimes) ?? 1);
		return [min, max] as [number, number];
	});

	const sessionStart = $derived(timeExtent[0]);

	const xScale = $derived(
		d3.scaleLinear()
			.domain([0, timeExtent[1] - timeExtent[0]])
			.range([0, chartWidth])
			.nice()
	);

	const yScale = $derived(
		d3.scaleBand<string>()
			.domain(toolNames)
			.range([0, chartHeight])
			.padding(0.15)
	);

	function formatTime(ms: number): string {
		if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
		if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
		return `${Math.round(ms)}ms`;
	}

	function formatBytes(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}KB`;
		return `${n}B`;
	}
</script>

{#if calls.length > 0}
	<div class="w-full" bind:clientWidth={containerWidth}>
		<svg width={containerWidth} height={totalHeight} class="text-xs">
			<g transform="translate({margin.left},{margin.top})">
				<!-- Y axis: tool name labels -->
				{#each toolNames as name}
					<g transform="translate(0,{(yScale(name) ?? 0) + (yScale.bandwidth() / 2)})">
						<text
							x="-8"
							dy="0.32em"
							text-anchor="end"
							fill="currentColor"
							opacity="0.7"
							class="text-[10px]"
						>
							{name}
						</text>
					</g>
				{/each}

				<!-- X axis gridlines + ticks -->
				{#each xScale.ticks(6) as tick}
					<g transform="translate({xScale(tick)},0)">
						<line y2={chartHeight} stroke="currentColor" opacity="0.08" />
						<text
							y={chartHeight + 16}
							text-anchor="middle"
							fill="currentColor"
							opacity="0.5"
							class="text-[10px]"
						>
							{formatTime(tick)}
						</text>
					</g>
				{/each}

				<!-- Axis label -->
				<text
					x={chartWidth / 2}
					y={chartHeight + 34}
					text-anchor="middle"
					fill="currentColor"
					opacity="0.5"
					class="text-[10px]"
				>
					Session Time
				</text>

				<!-- Swim lane backgrounds -->
				{#each toolNames as name, i}
					<rect
						x="0"
						y={yScale(name) ?? 0}
						width={chartWidth}
						height={yScale.bandwidth()}
						fill={i % 2 === 0 ? 'currentColor' : 'transparent'}
						opacity="0.02"
					/>
				{/each}

				<!-- Tool call bars (known latency) -->
				{#each timedCalls as call}
					{@const x = xScale(new Date(call.timestamp).getTime() - sessionStart)}
					{@const y = (yScale(call.toolName) ?? 0) + (yScale.bandwidth() - BAR_HEIGHT) / 2}
					{@const w = Math.max(xScale(call.latencyMs!) - xScale(0), MIN_BAR_WIDTH)}
					{@const color = toolColorMap.get(call.toolName) ?? '#6b7280'}

					<rect
						{x}
						{y}
						width={w}
						height={BAR_HEIGHT}
						fill={color}
						opacity={call.failed ? 0.4 : 0.7}
						rx="2"
						stroke={call.failed ? '#ef4444' : 'none'}
						stroke-width={call.failed ? 1.5 : 0}
					>
						<title>{call.toolName}{call.failed ? ' (FAILED)' : ''}: {formatTime(call.latencyMs!)}, response {formatBytes(call.responseSize)}{call.error ? ` — ${call.error}` : ''}</title>
					</rect>

					<!-- Failed marker -->
					{#if call.failed}
						<text
							x={x + w / 2}
							y={y + BAR_HEIGHT / 2}
							text-anchor="middle"
							dy="0.35em"
							fill="#ef4444"
							class="text-[9px] font-bold"
						>
							✕
						</text>
					{/if}
				{/each}

				<!-- Unknown-latency calls (diamond markers) -->
				{#each untimedCalls as call}
					{@const x = xScale(new Date(call.timestamp).getTime() - sessionStart)}
					{@const cy = (yScale(call.toolName) ?? 0) + yScale.bandwidth() / 2}
					{@const color = toolColorMap.get(call.toolName) ?? '#6b7280'}

					<polygon
						points="{x},{cy - 5} {x + 5},{cy} {x},{cy + 5} {x - 5},{cy}"
						fill={color}
						opacity="0.4"
						stroke={call.failed ? '#ef4444' : color}
						stroke-width={call.failed ? 1.5 : 0.5}
					>
						<title>{call.toolName}{call.failed ? ' (FAILED)' : ''}: latency unknown, response {formatBytes(call.responseSize)}{call.error ? ` — ${call.error}` : ''}</title>
					</polygon>
				{/each}
			</g>
		</svg>
	</div>
{:else}
	<p class="text-sm text-muted-foreground">No tool call data.</p>
{/if}
