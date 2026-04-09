<script lang="ts">
	import * as d3 from 'd3';

	let { thresholds }: { thresholds: number[] } = $props();

	const margin = { top: 20, right: 20, bottom: 40, left: 60 };
	const height = 200;

	let containerWidth = $state(400);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = height - margin.top - margin.bottom;

	const bins = $derived.by(() => {
		if (thresholds.length === 0) return [];
		const extent = d3.extent(thresholds) as [number, number];
		const histogram = d3.bin().domain(extent).thresholds(10);
		return histogram(thresholds);
	});

	const xScale = $derived.by(() => {
		if (thresholds.length === 0) {
			return d3.scaleLinear().domain([0, 1]).range([0, chartWidth]);
		}
		const extent = d3.extent(thresholds) as [number, number];
		return d3.scaleLinear().domain(extent).range([0, chartWidth]).nice();
	});

	const maxCount = $derived(d3.max(bins, (b) => b.length) || 1);

	const yScale = $derived(
		d3.scaleLinear()
			.domain([0, maxCount])
			.range([chartHeight, 0])
			.nice()
	);

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
		return String(n);
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if thresholds.length === 0}
		<div class="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
			No compaction data
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

				{#each bins as bin}
					{@const x0 = xScale(bin.x0 ?? 0)}
					{@const x1 = xScale(bin.x1 ?? 0)}
					{@const w = Math.max(x1 - x0 - 1, 1)}
					<rect
						x={x0}
						y={yScale(bin.length)}
						width={w}
						height={chartHeight - yScale(bin.length)}
						fill="#ef4444"
						opacity="0.5"
						rx="1"
					>
						<title>{formatTokens(bin.x0 ?? 0)}–{formatTokens(bin.x1 ?? 0)}: {bin.length} compaction{bin.length > 1 ? 's' : ''}</title>
					</rect>
				{/each}

				{#each xScale.ticks(5) as tick}
					<g transform="translate({xScale(tick)},{chartHeight})">
						<text y="16" text-anchor="middle" fill="currentColor" opacity="0.5" class="text-[10px]">
							{formatTokens(tick)}
						</text>
					</g>
				{/each}

				<text
					x={chartWidth / 2}
					y={chartHeight + 32}
					text-anchor="middle"
					fill="currentColor"
					opacity="0.4"
					class="text-[10px]"
				>
					Pre-compaction tokens
				</text>
			</g>
		</svg>
	{/if}
</div>
