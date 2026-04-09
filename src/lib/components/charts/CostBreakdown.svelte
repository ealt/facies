<script lang="ts">
	import type { ModelBreakdown } from '$lib/analysis/token-tracker.js';
	import { lookupPricing } from '$lib/pricing.js';
	import * as d3 from 'd3';

	let { perModel }: { perModel: ModelBreakdown[] } = $props();

	const height = 280;
	let containerWidth = $state(600);

	interface TreeNode {
		name: string;
		category?: string;
		model?: string;
		value?: number;
		children?: TreeNode[];
	}

	const categoryLabels: Record<string, string> = {
		input: 'Input',
		output: 'Output',
		cacheRead: 'Cache Read',
		cacheCreate: 'Cache Create',
	};

	const categoryColors: Record<string, string> = {
		input: '#ef4444',    // red
		output: '#3b82f6',   // blue
		cacheRead: '#22c55e', // green
		cacheCreate: '#eab308', // yellow
	};

	const treeData = $derived.by((): TreeNode => {
		const children: TreeNode[] = [];
		for (const m of perModel) {
			const pricing = lookupPricing(m.model);
			if (!pricing) continue;

			const cats: TreeNode[] = [];
			const inputCost = (m.inputTokens * pricing.input) / 1_000_000;
			const outputCost = (m.outputTokens * pricing.output) / 1_000_000;
			const cacheReadCost = (m.cacheReadTokens * pricing.cacheRead) / 1_000_000;
			const cacheCreateCost = (m.cacheCreateTokens * pricing.cacheCreate) / 1_000_000;

			if (inputCost > 0) cats.push({ name: 'Input', category: 'input', model: m.model, value: inputCost });
			if (outputCost > 0) cats.push({ name: 'Output', category: 'output', model: m.model, value: outputCost });
			if (cacheReadCost > 0) cats.push({ name: 'Cache Read', category: 'cacheRead', model: m.model, value: cacheReadCost });
			if (cacheCreateCost > 0) cats.push({ name: 'Cache Create', category: 'cacheCreate', model: m.model, value: cacheCreateCost });

			if (cats.length > 0) {
				children.push({ name: m.model, children: cats });
			}
		}
		return { name: 'Total', children };
	});

	type RectNode = d3.HierarchyRectangularNode<TreeNode>;

	const treemapRoot = $derived.by((): RectNode => {
		const root = d3.hierarchy(treeData)
			.sum((d) => d.value ?? 0)
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

		return d3.treemap<TreeNode>()
			.size([containerWidth, height])
			.paddingOuter(3)
			.paddingInner(2)
			.paddingTop(18)
			.round(true)(root);
	});

	const modelNodes = $derived(
		(treemapRoot.children ?? []).filter((d) => d.x1 - d.x0 > 0 && d.y1 - d.y0 > 0)
	);

	const leafNodes = $derived(
		treemapRoot.leaves().filter((d) => d.x1 - d.x0 > 2 && d.y1 - d.y0 > 2)
	);

	function formatCost(n: number): string {
		if (n >= 1) return `$${n.toFixed(2)}`;
		if (n >= 0.01) return `$${n.toFixed(3)}`;
		return `$${n.toFixed(4)}`;
	}

	function shortModel(name: string): string {
		return name
			.replace('claude-', '')
			.replace(/-\d{8}$/, '');
	}
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if treeData.children?.length === 0}
		<div class="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
			No cost data available (unknown model pricing)
		</div>
	{:else}
		<svg width={containerWidth} {height} class="text-xs">
			<!-- Model group backgrounds + labels -->
			{#each modelNodes as node}
				<g>
					<rect
						x={node.x0}
						y={node.y0}
						width={node.x1 - node.x0}
						height={node.y1 - node.y0}
						fill="none"
						stroke="currentColor"
						stroke-opacity="0.2"
						rx="2"
					/>
					{#if (node.x1 - node.x0) > 40}
						<text
							x={node.x0 + 4}
							y={node.y0 + 13}
							fill="currentColor"
							opacity="0.6"
							class="text-[10px] font-medium"
						>
							{shortModel(node.data.name)}
						</text>
					{/if}
				</g>
			{/each}

			<!-- Leaf rectangles -->
			{#each leafNodes as leaf}
				{@const w = leaf.x1 - leaf.x0}
				{@const h = leaf.y1 - leaf.y0}
				{@const d = leaf.data}
				<g>
					<rect
						x={leaf.x0}
						y={leaf.y0}
						width={w}
						height={h}
						fill={categoryColors[d.category ?? ''] ?? '#6b7280'}
						opacity="0.7"
						rx="1"
					>
						<title>{d.model} - {categoryLabels[d.category ?? '']}: {formatCost(d.value ?? 0)}</title>
					</rect>
					{#if w > 30 && h > 24}
						<text
							x={leaf.x0 + 4}
							y={leaf.y0 + 13}
							fill="white"
							class="text-[10px] font-medium"
						>
							{categoryLabels[d.category ?? '']}
						</text>
						<text
							x={leaf.x0 + 4}
							y={leaf.y0 + 24}
							fill="white"
							opacity="0.8"
							class="text-[9px]"
						>
							{formatCost(d.value ?? 0)}
						</text>
					{:else if w > 20 && h > 14}
						<text
							x={leaf.x0 + 3}
							y={leaf.y0 + 11}
							fill="white"
							class="text-[9px]"
						>
							{formatCost(d.value ?? 0)}
						</text>
					{/if}
				</g>
			{/each}
		</svg>

		<!-- Legend -->
		<div class="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
			{#each Object.entries(categoryColors) as [key, color]}
				<div class="flex items-center gap-1">
					<div class="h-2.5 w-2.5 rounded-sm" style="background-color: {color}; opacity: 0.7"></div>
					{categoryLabels[key]}
				</div>
			{/each}
		</div>
	{/if}
</div>
