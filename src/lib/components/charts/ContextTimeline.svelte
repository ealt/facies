<script lang="ts">
	import type { ContextSnapshot, ContextCategory } from '$lib/types.js';
	import type { CompactionMarker } from '$lib/analysis/context-decomposer.js';
	import * as d3 from 'd3';

	let { snapshots, compactions, mode = 'cumulative', onSelect }: {
		snapshots: ContextSnapshot[];
		compactions: CompactionMarker[];
		mode?: 'cumulative' | 'incremental';
		onSelect?: (index: number | null) => void;
	} = $props();

	const margin = { top: 20, right: 20, bottom: 40, left: 70 };
	const height = 350;

	let containerWidth = $state(600);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	const CATEGORIES: ContextCategory[] = [
		'system', 'compacted_summary', 'user', 'assistant_text',
		'assistant_thinking', 'tool_results', 'subagent_overhead',
	];

	const COLORS: Record<ContextCategory, string> = {
		system: '#6b7280',
		user: '#3b82f6',
		assistant_text: '#22c55e',
		assistant_thinking: '#9ca3af',
		tool_results: '#f97316',
		subagent_overhead: '#a855f7',
		compacted_summary: '#f59e0b',
	};

	const LABELS: Record<ContextCategory, string> = {
		system: 'System',
		user: 'User Messages',
		assistant_text: 'Assistant Text',
		assistant_thinking: 'Assistant Thinking',
		tool_results: 'Tool Results',
		subagent_overhead: 'Subagent Overhead',
		compacted_summary: 'Compacted Summary',
	};

	// Compute incremental deltas for incremental mode
	const incrementalData = $derived.by(() => {
		if (mode !== 'incremental') return [];
		return snapshots.map((snap, i) => {
			const cats = {} as Record<ContextCategory, number>;
			for (const cat of CATEGORIES) {
				if (i === 0) {
					cats[cat] = snap.categories[cat];
				} else {
					cats[cat] = Math.max(0, snap.categories[cat] - snapshots[i - 1].categories[cat]);
				}
			}
			return { ...snap, categories: cats, totalTokens: Object.values(cats).reduce((a, b) => a + b, 0) };
		});
	});

	const chartData = $derived(mode === 'incremental' ? incrementalData : snapshots);

	// Only show categories that have data
	const activeCategories = $derived(
		CATEGORIES.filter((cat) =>
			chartData.some((s) => s.categories[cat] > 0),
		),
	);

	const maxY = $derived(d3.max(chartData, (s) => s.totalTokens) || 1);

	// Cumulative mode: stacked area
	const stackGen = $derived(
		d3.stack<ContextSnapshot>()
			.keys(activeCategories)
			.value((d, key) => d.categories[key as ContextCategory])
			.order(d3.stackOrderNone)
			.offset(d3.stackOffsetNone),
	);

	const stackedData = $derived(stackGen(chartData as ContextSnapshot[]));

	const xScale = $derived(
		d3.scaleLinear()
			.domain([0, Math.max(chartData.length - 1, 1)])
			.range([0, chartWidth]),
	);

	const yScale = $derived(
		d3.scaleLinear()
			.domain([0, maxY])
			.range([chartHeight, 0])
			.nice(),
	);

	// Cumulative: area paths
	const areaGen = $derived(
		d3.area<d3.SeriesPoint<ContextSnapshot>>()
			.x((_, i) => xScale(i))
			.y0((d) => yScale(d[0]))
			.y1((d) => yScale(d[1]))
			.curve(d3.curveMonotoneX),
	);

	const areaPaths = $derived(
		stackedData.map((series) => ({
			key: series.key as ContextCategory,
			d: areaGen(series) || '',
			color: COLORS[series.key as ContextCategory],
		})),
	);

	// Incremental: bar widths
	const barWidth = $derived(
		chartData.length > 1
			? Math.max(1, chartWidth / chartData.length - 2)
			: chartWidth * 0.5,
	);

	// Axes
	const xTicks = $derived(
		xScale.ticks(Math.min(chartData.length, 10)).filter(Number.isInteger),
	);
	const yTicks = $derived(yScale.ticks(6));

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(Math.round(n));
	}

	// Hover state
	let hoverIdx = $state<number | null>(null);
	const hoverSnapshot = $derived(
		hoverIdx !== null && hoverIdx >= 0 && hoverIdx < chartData.length
			? chartData[hoverIdx]
			: null,
	);

	function handleMouseMove(event: MouseEvent) {
		const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
		const x = event.clientX - rect.left;
		const idx = Math.round(xScale.invert(x));
		hoverIdx = Math.max(0, Math.min(idx, chartData.length - 1));
	}

	function handleMouseLeave() {
		hoverIdx = null;
	}

	function handleClick() {
		if (hoverIdx !== null) onSelect?.(hoverIdx);
	}
</script>

<div bind:clientWidth={containerWidth} class="relative">
	<svg width={containerWidth} {height}>
		<g transform="translate({margin.left},{margin.top})">
			{#if mode === 'cumulative'}
				<!-- Stacked areas -->
				{#each areaPaths as { d, color }}
					<path {d} fill={color} opacity="0.8" />
				{/each}
			{:else}
				<!-- Stacked bars for incremental mode -->
				{#each stackedData as series}
					{@const color = COLORS[series.key as ContextCategory]}
					{#each series as point, i}
						{@const barH = yScale(point[0]) - yScale(point[1])}
						{#if barH > 0}
							<rect
								x={xScale(i) - barWidth / 2}
								y={yScale(point[1])}
								width={barWidth}
								height={barH}
								fill={color}
								opacity="0.8"
							/>
						{/if}
					{/each}
				{/each}
			{/if}

			<!-- Compaction markers -->
			{#each compactions as comp}
				{@const x = xScale(comp.snapshotIndex)}
				<line
					x1={x} y1={0} x2={x} y2={chartHeight}
					stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,3"
					opacity="0.7"
				/>
				<text
					x={x + 4} y={12}
					fill="#ef4444" font-size="9" opacity="0.9"
				>
					{formatTokens(comp.preTokens)} → {comp.postTokens !== null ? `~${formatTokens(comp.postTokens)}` : '?'}
				</text>
			{/each}

			<!-- Hover line -->
			{#if hoverIdx !== null}
				{@const x = xScale(hoverIdx)}
				<line
					x1={x} y1={0} x2={x} y2={chartHeight}
					stroke="white" stroke-width="1" opacity="0.4"
				/>
			{/if}

			<!-- Invisible overlay for mouse tracking -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<rect
				width={chartWidth} height={chartHeight}
				fill="transparent"
				onmousemove={handleMouseMove}
				onmouseleave={handleMouseLeave}
				onclick={handleClick}
			/>

			<!-- X axis -->
			<g transform="translate(0,{chartHeight})">
				<line x1={0} y1={0} x2={chartWidth} y2={0} stroke="currentColor" opacity="0.2" />
				{#each xTicks as tick}
					<g transform="translate({xScale(tick)},0)">
						<line y2={4} stroke="currentColor" opacity="0.3" />
						<text y={16} text-anchor="middle" fill="currentColor" font-size="10" opacity="0.6">
							{tick}
						</text>
					</g>
				{/each}
				<text
					x={chartWidth / 2} y={32}
					text-anchor="middle" fill="currentColor" font-size="11" opacity="0.5"
				>
					API Call
				</text>
			</g>

			<!-- Y axis -->
			<g>
				{#each yTicks as tick}
					<g transform="translate(0,{yScale(tick)})">
						<line x2={chartWidth} stroke="currentColor" opacity="0.07" />
						<text
							x={-8} text-anchor="end" dominant-baseline="middle"
							fill="currentColor" font-size="10" opacity="0.6"
						>
							{formatTokens(tick)}
						</text>
					</g>
				{/each}
				<text
					transform="translate(-55,{chartHeight / 2}) rotate(-90)"
					text-anchor="middle" fill="currentColor" font-size="11" opacity="0.5"
				>
					{mode === 'cumulative' ? 'Context Tokens' : 'Tokens Added'}
				</text>
			</g>
		</g>
	</svg>

	<!-- Hover tooltip -->
	{#if hoverSnapshot}
		<div
			class="absolute top-0 right-0 rounded-lg border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur-sm"
		>
			<div class="mb-1.5 font-medium">
				API Call {hoverSnapshot.apiCallIndex}
				{#if mode === 'cumulative'}
					&mdash; {formatTokens(hoverSnapshot.totalTokens)} total
				{:else}
					&mdash; +{formatTokens(hoverSnapshot.totalTokens)}
				{/if}
			</div>
			{#each activeCategories as cat}
				{#if hoverSnapshot.categories[cat] > 0}
					<div class="flex items-center gap-2 py-0.5">
						<span
							class="inline-block h-2 w-2 rounded-sm"
							style="background-color: {COLORS[cat]}"
						></span>
						<span class="text-muted-foreground">~{LABELS[cat]}:</span>
						<span class="font-mono">{formatTokens(hoverSnapshot.categories[cat])}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Legend -->
	<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
		{#each activeCategories as cat}
			<div class="flex items-center gap-1">
				<span
					class="inline-block h-2 w-2 rounded-sm"
					style="background-color: {COLORS[cat]}"
				></span>
				{LABELS[cat]}
			</div>
		{/each}
	</div>
</div>
