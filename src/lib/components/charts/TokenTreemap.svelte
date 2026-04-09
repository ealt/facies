<script lang="ts">
	import type { SessionSummary } from '$lib/types.js';
	import * as d3 from 'd3';

	let {
		sessions,
		colorMap,
		groupBy,
	}: {
		sessions: SessionSummary[];
		colorMap: Map<string, string>;
		groupBy: string | null;
	} = $props();

	const margin = { top: 0, right: 0, bottom: 0, left: 0 };
	const height = 240;

	let containerWidth = $state(600);
	const chartWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 100));

	interface TreeNode {
		name: string;
		value?: number;
		children?: TreeNode[];
		session?: SessionSummary;
		project?: string;
	}

	const rootData = $derived.by((): TreeNode => {
		const validSessions = sessions.filter((s) => s.totalInputTokens + s.totalOutputTokens > 0);

		if (!groupBy || groupBy === '') {
			return {
				name: 'root',
				children: validSessions.map((s) => ({
					name: s.title ?? s.sessionId,
					value: s.totalInputTokens + s.totalOutputTokens,
					session: s,
					project: s.project,
				})),
			};
		}

		// Group sessions
		const groups = new Map<string, SessionSummary[]>();
		for (const s of validSessions) {
			const key = groupBy === 'project' ? s.project : groupBy === 'model' ? s.model : s.project;
			const list = groups.get(key);
			if (list) list.push(s);
			else groups.set(key, [s]);
		}

		return {
			name: 'root',
			children: [...groups.entries()].map(([key, groupSessions]) => ({
				name: key,
				children: groupSessions.map((s) => ({
					name: s.title ?? s.sessionId,
					value: s.totalInputTokens + s.totalOutputTokens,
					session: s,
					project: s.project,
				})),
			})),
		};
	});

	const treemapLayout = $derived.by(() => {
		const root = d3.hierarchy(rootData)
			.sum((d) => d.value ?? 0)
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

		d3.treemap<TreeNode>()
			.size([chartWidth, height])
			.padding(groupBy ? 2 : 1)
			.paddingTop(groupBy ? 16 : 1)
			.round(true)(root);

		return root;
	});

	const leaves = $derived(treemapLayout.leaves());

	// Group-level nodes (only when grouped)
	const groupNodes = $derived.by(() => {
		if (!groupBy) return [];
		return treemapLayout.children ?? [];
	});

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	function truncate(s: string, len: number): string {
		return s.length > len ? s.slice(0, len - 1) + '\u2026' : s;
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if leaves.length === 0}
		<div class="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
			No token data
		</div>
	{:else}
		<svg width={containerWidth} {height} class="text-xs">
			<!-- Group outlines when grouped -->
			{#each groupNodes as g}
				{@const gd = g as d3.HierarchyRectangularNode<TreeNode>}
				<rect
					x={gd.x0}
					y={gd.y0}
					width={gd.x1 - gd.x0}
					height={gd.y1 - gd.y0}
					fill="none"
					stroke="currentColor"
					opacity="0.15"
					rx="2"
				/>
				{#if gd.x1 - gd.x0 > 40}
					<text
						x={gd.x0 + 4}
						y={gd.y0 + 12}
						fill="currentColor"
						opacity="0.5"
						class="text-[10px] font-medium"
					>
						{truncate(gd.data.name, Math.floor((gd.x1 - gd.x0 - 8) / 6))}
					</text>
				{/if}
			{/each}

			<!-- Leaf cells -->
			{#each leaves as leaf}
				{@const ld = leaf as d3.HierarchyRectangularNode<TreeNode>}
				{@const w = ld.x1 - ld.x0}
				{@const h = ld.y1 - ld.y0}
				{@const project = ld.data.project ?? ld.parent?.data.name ?? ''}
				<rect
					x={ld.x0}
					y={ld.y0}
					width={w}
					height={h}
					fill={colorMap.get(project) ?? '#888'}
					opacity="0.65"
					rx="1"
				>
					<title>{ld.data.name}
{project} · {formatTokens(ld.value ?? 0)} tokens</title>
				</rect>
				{#if w > 40 && h > 16}
					<text
						x={ld.x0 + 3}
						y={ld.y0 + 12}
						fill="white"
						class="text-[10px]"
						style="pointer-events: none;"
					>
						{truncate(ld.data.name, Math.floor((w - 6) / 6))}
					</text>
				{/if}
				{#if w > 40 && h > 28}
					<text
						x={ld.x0 + 3}
						y={ld.y0 + 24}
						fill="white"
						opacity="0.7"
						class="text-[9px]"
						style="pointer-events: none;"
					>
						{formatTokens(ld.value ?? 0)}
					</text>
				{/if}
			{/each}
		</svg>
	{/if}
</div>
