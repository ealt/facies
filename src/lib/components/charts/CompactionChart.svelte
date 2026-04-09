<script lang="ts">
	import type { CompactionEvent } from '$lib/types.js';
	import * as d3 from 'd3';

	let { compactions, contextSizePoints, sessionStartTime, sessionEndTime }: {
		compactions: CompactionEvent[];
		contextSizePoints: Array<{ timestamp: string; totalTokens: number }>;
		sessionStartTime: string;
		sessionEndTime: string;
	} = $props();

	const margin = { top: 12, right: 20, bottom: 28, left: 60 };
	const HEIGHT = 120;

	let containerWidth = $state(600);

	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));
	const chartHeight = $derived(HEIGHT - margin.top - margin.bottom);

	// Time extent spans the full session duration (not just API call range)
	const timeExtent = $derived.by(() => {
		const start = new Date(sessionStartTime).getTime();
		const end = new Date(sessionEndTime).getTime();
		if (isNaN(start) || isNaN(end) || start >= end) {
			// Fallback to API call range
			if (contextSizePoints.length === 0) return [0, 1] as [number, number];
			const times = contextSizePoints.map((p) => new Date(p.timestamp).getTime());
			return [d3.min(times)!, d3.max(times)!] as [number, number];
		}
		return [start, end] as [number, number];
	});

	const xScale = $derived(
		d3.scaleLinear()
			.domain(timeExtent)
			.range([0, chartWidth]),
	);

	const maxTokens = $derived.by(() => {
		// Include both API call totals and compaction preTokens for accurate Y scale
		const apiMax = contextSizePoints.length > 0
			? d3.max(contextSizePoints, (p) => p.totalTokens) ?? 0
			: 0;
		const compactionMax = compactions.length > 0
			? d3.max(compactions, (c) => c.preTokens) ?? 0
			: 0;
		return Math.max(apiMax, compactionMax, 1);
	});

	const yScale = $derived(
		d3.scaleLinear()
			.domain([0, maxTokens])
			.range([chartHeight, 0]),
	);

	// Area path for the sparkline fill
	const areaPath = $derived.by(() => {
		if (contextSizePoints.length === 0) return '';
		const area = d3.area<{ timestamp: string; totalTokens: number }>()
			.x((d) => xScale(new Date(d.timestamp).getTime()))
			.y0(chartHeight)
			.y1((d) => yScale(d.totalTokens))
			.curve(d3.curveStepAfter);
		return area(contextSizePoints) ?? '';
	});

	// Line path for the sparkline stroke
	const linePath = $derived.by(() => {
		if (contextSizePoints.length === 0) return '';
		const line = d3.line<{ timestamp: string; totalTokens: number }>()
			.x((d) => xScale(new Date(d.timestamp).getTime()))
			.y((d) => yScale(d.totalTokens))
			.curve(d3.curveStepAfter);
		return line(contextSizePoints) ?? '';
	});

	// Compaction positions on the x-axis
	const compactionPositions = $derived(
		compactions.map((c) => ({
			x: xScale(new Date(c.timestamp).getTime()),
			preTokens: c.preTokens,
			postTokens: c.postTokens,
			tokensFreed: c.tokensFreed,
			timestamp: c.timestamp,
		})),
	);

	// Compute peak tokens per segment (between compactions)
	// Segments ending at a compaction use preTokens (authoritative) as the peak
	const segmentPeaks = $derived.by(() => {
		if (contextSizePoints.length === 0 && compactions.length === 0) return [];
		const boundaries = [
			timeExtent[0],
			...compactions.map((c) => new Date(c.timestamp).getTime()),
			timeExtent[1],
		];
		const peaks: Array<{ x: number; peakTokens: number }> = [];
		for (let i = 0; i < boundaries.length - 1; i++) {
			const start = boundaries[i];
			const end = boundaries[i + 1];
			const midX = xScale((start + end) / 2);

			// If this segment ends at a compaction, use preTokens as the peak
			// (authoritative value from compactMetadata)
			if (i < compactions.length) {
				peaks.push({ x: midX, peakTokens: compactions[i].preTokens });
			} else {
				// Last segment (after final compaction): use max from API calls
				const segmentPoints = contextSizePoints.filter((p) => {
					const t = new Date(p.timestamp).getTime();
					return t >= start && t <= end;
				});
				if (segmentPoints.length > 0) {
					const peak = d3.max(segmentPoints, (p) => p.totalTokens) ?? 0;
					peaks.push({ x: midX, peakTokens: peak });
				}
			}
		}
		return peaks;
	});

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(Math.round(n));
	}

	function formatTime(ts: string): string {
		const d = new Date(ts);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
</script>

{#if contextSizePoints.length > 0}
	<div class="w-full" bind:clientWidth={containerWidth}>
		<svg width={containerWidth} height={HEIGHT} class="text-xs">
			<defs>
				<linearGradient id="sparkline-gradient" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3" />
					<stop offset="100%" stop-color="#3b82f6" stop-opacity="0.05" />
				</linearGradient>
			</defs>

			<g transform="translate({margin.left},{margin.top})">
				<!-- Y axis: a few token reference lines -->
				{#each yScale.ticks(3) as tick}
					<g transform="translate(0,{yScale(tick)})">
						<line x2={chartWidth} stroke="currentColor" opacity="0.06" />
						<text
							x="-6"
							dy="0.32em"
							text-anchor="end"
							fill="currentColor"
							opacity="0.4"
							class="text-[9px]"
						>
							{formatTokens(tick)}
						</text>
					</g>
				{/each}

				<!-- Sparkline fill -->
				<path d={areaPath} fill="url(#sparkline-gradient)" />

				<!-- Sparkline stroke -->
				<path d={linePath} fill="none" stroke="#3b82f6" stroke-width="1.5" opacity="0.8" />

				<!-- Compaction dividers -->
				{#each compactionPositions as cp}
					<line
						x1={cp.x}
						y1="0"
						x2={cp.x}
						y2={chartHeight}
						stroke="#a855f7"
						stroke-width="1.5"
						stroke-dasharray="4,3"
						opacity="0.8"
					>
						<title>Compaction at {formatTime(cp.timestamp)}: {formatTokens(cp.preTokens)}{cp.postTokens != null ? ` → ~${formatTokens(cp.postTokens)}` : ''}</title>
					</line>
					<!-- Small diamond marker at the top -->
					<polygon
						points="{cp.x},{-2} {cp.x + 4},{3} {cp.x},{8} {cp.x - 4},{3}"
						fill="#a855f7"
						opacity="0.9"
					/>
				{/each}

				<!-- Segment peak labels -->
				{#each segmentPeaks as seg}
					<text
						x={seg.x}
						y={-2}
						text-anchor="middle"
						fill="currentColor"
						opacity="0.5"
						class="text-[9px]"
					>
						peak {formatTokens(seg.peakTokens)}
					</text>
				{/each}

				<!-- X axis: time ticks -->
				{#each xScale.ticks(5) as tick}
					<text
						x={xScale(tick)}
						y={chartHeight + 16}
						text-anchor="middle"
						fill="currentColor"
						opacity="0.4"
						class="text-[9px]"
					>
						{formatTime(new Date(tick).toISOString())}
					</text>
				{/each}
			</g>
		</svg>
	</div>
{:else}
	<p class="text-sm text-muted-foreground">No context size data.</p>
{/if}
