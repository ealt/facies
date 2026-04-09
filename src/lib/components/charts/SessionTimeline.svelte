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

	const margin = { top: 10, right: 20, bottom: 30, left: 20 };
	const gapWidth = 4; // px for collapsed dead-time gaps
	const minThickness = 4;
	const maxThickness = 40;

	let containerWidth = $state(600);

	// Parse sessions into time intervals
	interface TimeBlock {
		session: SessionSummary;
		start: number; // epoch ms
		end: number;
		lane: number;
		tokenRate: number; // tokens per ms
	}

	const blocks = $derived.by(() => {
		if (sessions.length === 0) return [];
		const parsed: TimeBlock[] = sessions
			.filter((s) => s.durationMs > 0)
			.map((s) => ({
				session: s,
				start: new Date(s.startTime).getTime(),
				end: new Date(s.startTime).getTime() + s.durationMs,
				lane: 0,
				tokenRate: (s.totalInputTokens + s.totalOutputTokens) / Math.max(s.durationMs, 1),
			}))
			.sort((a, b) => a.start - b.start);

		// Assign lanes for overlapping sessions (Gantt-style)
		const laneEnds: number[] = [];
		for (const b of parsed) {
			let assigned = false;
			for (let i = 0; i < laneEnds.length; i++) {
				if (b.start >= laneEnds[i]) {
					b.lane = i;
					laneEnds[i] = b.end;
					assigned = true;
					break;
				}
			}
			if (!assigned) {
				b.lane = laneEnds.length;
				laneEnds.push(b.end);
			}
		}
		return parsed;
	});

	// Build gap-collapsed x segments
	interface Segment {
		realStart: number;
		realEnd: number;
		pxStart: number;
		pxEnd: number;
	}

	const laneCount = $derived(blocks.length > 0 ? Math.max(...blocks.map((b) => b.lane)) + 1 : 1);

	const layout = $derived.by(() => {
		if (blocks.length === 0) return { segments: [] as Segment[], totalPx: 0 };

		// Merge all active intervals to find gaps
		const events: { time: number; type: 'start' | 'end' }[] = [];
		for (const b of blocks) {
			events.push({ time: b.start, type: 'start' });
			events.push({ time: b.end, type: 'end' });
		}
		events.sort((a, b) => a.time - b.time || (a.type === 'start' ? -1 : 1));

		const activeIntervals: { start: number; end: number }[] = [];
		let depth = 0;
		let intStart = 0;
		for (const e of events) {
			if (e.type === 'start') {
				if (depth === 0) intStart = e.time;
				depth++;
			} else {
				depth--;
				if (depth === 0) {
					activeIntervals.push({ start: intStart, end: e.time });
				}
			}
		}

		const chartWidth = Math.max(containerWidth - margin.left - margin.right, 100);
		const totalGaps = Math.max(activeIntervals.length - 1, 0);
		const usableWidth = chartWidth - totalGaps * gapWidth;
		const totalRealDuration = activeIntervals.reduce((s, i) => s + (i.end - i.start), 0);

		const segments: Segment[] = [];
		let px = 0;
		for (let i = 0; i < activeIntervals.length; i++) {
			const int = activeIntervals[i];
			const intDuration = int.end - int.start;
			const intWidth = totalRealDuration > 0 ? (intDuration / totalRealDuration) * usableWidth : usableWidth;
			segments.push({ realStart: int.start, realEnd: int.end, pxStart: px, pxEnd: px + intWidth });
			px += intWidth;
			if (i < activeIntervals.length - 1) px += gapWidth;
		}

		return { segments, totalPx: px };
	});

	// Map a real time to a pixel x
	function timeToPx(t: number): number {
		for (const seg of layout.segments) {
			if (t >= seg.realStart && t <= seg.realEnd) {
				const frac = (t - seg.realStart) / Math.max(seg.realEnd - seg.realStart, 1);
				return seg.pxStart + frac * (seg.pxEnd - seg.pxStart);
			}
		}
		// Clamp to edges
		if (layout.segments.length === 0) return 0;
		if (t < layout.segments[0].realStart) return layout.segments[0].pxStart;
		return layout.segments[layout.segments.length - 1].pxEnd;
	}

	// Thickness scale
	const thicknessScale = $derived.by(() => {
		if (blocks.length === 0) return d3.scaleLinear().domain([0, 1]).range([minThickness, maxThickness]);
		const maxRate = d3.max(blocks, (b) => b.tokenRate) || 1;
		return d3.scaleLinear().domain([0, maxRate]).range([minThickness, maxThickness]).clamp(true);
	});

	const height = $derived(margin.top + margin.bottom + laneCount * (maxThickness + 4));

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	function formatDuration(ms: number): string {
		if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
		if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
		return `${(ms / 3_600_000).toFixed(1)}h`;
	}

	function formatCost(n: number | null): string {
		if (n === null) return 'N/A';
		if (n >= 1) return `$${n.toFixed(2)}`;
		return `$${n.toFixed(3)}`;
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if blocks.length === 0}
		<div class="flex h-[80px] items-center justify-center text-sm text-muted-foreground">
			No session data
		</div>
	{:else}
		<svg width={containerWidth} {height} class="text-xs">
			<g transform="translate({margin.left},{margin.top})">
				<!-- Gap indicators -->
				{#each layout.segments as seg, i}
					{#if i > 0}
						{@const prevEnd = layout.segments[i - 1].pxEnd}
						<line
							x1={prevEnd + gapWidth / 2}
							y1={0}
							x2={prevEnd + gapWidth / 2}
							y2={height - margin.top - margin.bottom}
							stroke="currentColor"
							opacity="0.15"
							stroke-dasharray="2,2"
						/>
					{/if}
				{/each}

				<!-- Session blocks -->
				{#each blocks as b}
					{@const x1 = timeToPx(b.start)}
					{@const x2 = timeToPx(b.end)}
					{@const w = Math.max(x2 - x1, 2)}
					{@const h = thicknessScale(b.tokenRate)}
					{@const y = b.lane * (maxThickness + 4) + (maxThickness - h) / 2}
					<rect
						x={x1}
						y={y}
						width={w}
						height={h}
						fill={colorMap.get(b.session.project) ?? '#888'}
						opacity="0.75"
						rx="2"
					>
						<title>{b.session.title ?? b.session.sessionId}
{b.session.project} · {formatDuration(b.session.durationMs)}
{formatTokens(b.session.totalInputTokens + b.session.totalOutputTokens)} tokens · {formatCost(b.session.totalCost)}</title>
					</rect>
				{/each}

				<!-- Time labels at segment boundaries -->
				{#each layout.segments as seg, i}
					{#if i === 0 || i === layout.segments.length - 1}
						<text
							x={i === 0 ? seg.pxStart : seg.pxEnd}
							y={height - margin.top - margin.bottom + 14}
							text-anchor={i === 0 ? 'start' : 'end'}
							fill="currentColor"
							opacity="0.5"
							class="text-[10px]"
						>
							{d3.timeFormat('%b %d %H:%M')(new Date(i === 0 ? seg.realStart : seg.realEnd))}
						</text>
					{/if}
				{/each}
			</g>
		</svg>
	{/if}
</div>
