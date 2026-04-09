<script lang="ts">
	import type { SessionSummary } from '$lib/types.js';
	import * as d3 from 'd3';

	let {
		sessions,
		colorMap,
	}: {
		sessions: SessionSummary[];
		colorMap: Map<string, string>;
	} = $props();

	const margin = { top: 20, right: 60, bottom: 40, left: 60 };
	const height = 240;

	let containerWidth = $state(600);
	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	// Build cumulative data sorted by endTime
	interface CumPoint {
		time: Date;
		cumInput: number;
		cumOutput: number;
		cumCost: number;
		session: SessionSummary;
	}

	const points = $derived.by(() => {
		const now = new Date();
		const sorted = [...sessions]
			.filter((s) => s.hasTranscript !== false)
			.map((s) => ({
				session: s,
				endTime: s.endTime ? new Date(s.endTime) : now,
			}))
			.sort((a, b) => a.endTime.getTime() - b.endTime.getTime());

		let cumInput = 0;
		let cumOutput = 0;
		let cumCost = 0;
		const pts: CumPoint[] = [{ time: sorted.length > 0 ? sorted[0].endTime : now, cumInput: 0, cumOutput: 0, cumCost: 0, session: sorted[0]?.session }];

		for (const s of sorted) {
			cumInput += s.session.totalInputTokens;
			cumOutput += s.session.totalOutputTokens;
			cumCost += s.session.totalCost ?? 0;
			pts.push({ time: s.endTime, cumInput, cumOutput, cumCost, session: s.session });
		}
		return pts;
	});

	const xScale = $derived(
		d3.scaleTime()
			.domain(d3.extent(points, (p) => p.time) as [Date, Date])
			.range([0, chartWidth]),
	);

	const maxTokens = $derived(d3.max(points, (p) => p.cumInput + p.cumOutput) || 1);
	const yTokenScale = $derived(
		d3.scaleLinear().domain([0, maxTokens]).range([chartHeight, 0]).nice(),
	);

	const maxCost = $derived(d3.max(points, (p) => p.cumCost) || 1);
	const yCostScale = $derived(
		d3.scaleLinear().domain([0, maxCost]).range([chartHeight, 0]).nice(),
	);

	// Step area generators
	const inputArea = $derived(
		d3.area<CumPoint>()
			.x((d) => xScale(d.time))
			.y0(chartHeight)
			.y1((d) => yTokenScale(d.cumInput))
			.curve(d3.curveStepAfter),
	);

	const totalArea = $derived(
		d3.area<CumPoint>()
			.x((d) => xScale(d.time))
			.y0((d) => yTokenScale(d.cumInput))
			.y1((d) => yTokenScale(d.cumInput + d.cumOutput))
			.curve(d3.curveStepAfter),
	);

	const costLine = $derived(
		d3.line<CumPoint>()
			.x((d) => xScale(d.time))
			.y((d) => yCostScale(d.cumCost))
			.curve(d3.curveStepAfter),
	);

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
		return String(n);
	}

	function formatCost(n: number): string {
		if (n >= 1) return `$${n.toFixed(2)}`;
		if (n >= 0.01) return `$${n.toFixed(3)}`;
		return `$${n.toFixed(4)}`;
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if points.length <= 1}
		<div class="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
			No session data
		</div>
	{:else}
		<svg width={containerWidth} {height} class="text-xs">
			<g transform="translate({margin.left},{margin.top})">
				<!-- Y-axis gridlines (tokens) -->
				{#each yTokenScale.ticks(5) as tick}
					<g transform="translate(0,{yTokenScale(tick)})">
						<line x2={chartWidth} stroke="currentColor" opacity="0.1" />
						<text x="-8" dy="0.32em" text-anchor="end" fill="currentColor" opacity="0.5" class="text-[10px]">
							{formatTokens(tick)}
						</text>
					</g>
				{/each}

				<!-- Stacked areas -->
				<path d={inputArea(points)} fill="#3b82f6" opacity="0.4" />
				<path d={totalArea(points)} fill="#22c55e" opacity="0.4" />

				<!-- Cost line (right axis) -->
				<path d={costLine(points)} fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.8" />

				<!-- Right y-axis (cost) -->
				{#each yCostScale.ticks(5) as tick}
					<text
						x={chartWidth + 8}
						y={yCostScale(tick)}
						dy="0.32em"
						text-anchor="start"
						fill="#f59e0b"
						opacity="0.6"
						class="text-[10px]"
					>
						{formatCost(tick)}
					</text>
				{/each}

				<!-- X-axis labels -->
				{#each xScale.ticks(6) as tick}
					<text
						x={xScale(tick)}
						y={chartHeight + 20}
						text-anchor="middle"
						fill="currentColor"
						opacity="0.5"
						class="text-[10px]"
					>
						{d3.timeFormat('%b %d')(tick)}
					</text>
				{/each}
			</g>
		</svg>

		<div class="mt-1 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
			<span class="flex items-center gap-1">
				<span class="inline-block h-2 w-2 rounded-sm bg-blue-500 opacity-70"></span> Input tokens
			</span>
			<span class="flex items-center gap-1">
				<span class="inline-block h-2 w-2 rounded-sm bg-green-500 opacity-70"></span> Output tokens
			</span>
			<span class="flex items-center gap-1">
				<span class="inline-block h-2 w-2 rounded-sm bg-amber-500 opacity-70"></span> Cost
			</span>
		</div>
	{/if}
</div>
