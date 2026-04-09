<script lang="ts">
	import { computeTokenEconomics, computeLatencyPoints } from '$lib/analysis/token-tracker.js';
	import { computeContextDecomposition } from '$lib/analysis/context-decomposer.js';
	import { computeToolAnalysis } from '$lib/analysis/tool-analyzer.js';
	import { computeSubagentSummaries } from '$lib/analysis/subagent-analyzer.js';
	import { computeCompactionAnalysis } from '$lib/analysis/compaction-analyzer.js';
	import { buildConversationTree } from '$lib/analysis/conversation-builder.js';
	import TokenEconomicsView from '$lib/components/views/TokenEconomicsView.svelte';
	import ContextWindowView from '$lib/components/views/ContextWindowView.svelte';
	import ToolEffectivenessView from '$lib/components/views/ToolEffectivenessView.svelte';
	import CompactionView from '$lib/components/views/CompactionView.svelte';
	import ConversationView from '$lib/components/views/ConversationView.svelte';

	let { data } = $props();
	const detail = $derived(data.detail);

	type TabId = 'token-economics' | 'context-window' | 'tool-effectiveness' | 'compaction' | 'conversation' | 'events' | 'transcript' | 'api-calls' | 'tools' | 'subagents';
	let activeTab = $state<TabId>('token-economics');

	// Compute token economics from all API call groups (main + subagents)
	const allGroups = $derived([
		...detail.apiCallGroups,
		...detail.subagents.flatMap((s) => s.apiCallGroups),
	]);
	const turns = $derived(detail.events.filter((e) => e.event === 'UserPromptSubmit').length);
	const economics = $derived(computeTokenEconomics(allGroups, turns));
	// Tool analysis from event log
	const toolAnalysis = $derived(computeToolAnalysis(detail.events, allGroups));
	// Subagent summaries
	const subagentSummaries = $derived(computeSubagentSummaries(detail.subagents, detail.events));
	// Compaction analysis
	const compactionAnalysis = $derived(
		computeCompactionAnalysis(detail.transcriptRecords, detail.apiCallGroups, detail.events),
	);
	// Conversation tree
	const conversationTree = $derived(
		buildConversationTree(detail.transcriptRecords, detail.apiCallGroups, detail.toolResults, detail.subagents),
	);

	const tabs = $derived([
		{ id: 'token-economics' as const, label: 'Token Economics', count: detail.apiCallGroups.length },
		{ id: 'context-window' as const, label: 'Context Window', count: detail.apiCallGroups.length },
		{ id: 'tool-effectiveness' as const, label: 'Tool Effectiveness', count: toolAnalysis.totalCalls },
		{ id: 'compaction' as const, label: 'Compaction', count: compactionAnalysis.compactions.length },
		{ id: 'conversation' as const, label: 'Conversation', count: conversationTree.nodeCount },
		{ id: 'events' as const, label: 'Events', count: detail.events.length },
		{ id: 'transcript' as const, label: 'Transcript', count: detail.transcriptRecords.length },
		{ id: 'api-calls' as const, label: 'API Calls', count: detail.apiCallGroups.length },
		{ id: 'tools' as const, label: 'Tool Results', count: detail.toolResults.length },
		{ id: 'subagents' as const, label: 'Subagents', count: detail.subagents.length },
	]);
	// Context decomposition (main session only — subagent content appears as Agent tool results)
	const contextDecomp = $derived(
		computeContextDecomposition(detail.transcriptRecords, detail.apiCallGroups),
	);
	// Latency: compute per transcript scope (main + each subagent) and merge
	const latencyPoints = $derived.by(() => {
		const main = computeLatencyPoints(detail.transcriptRecords, detail.apiCallGroups);
		const sub = detail.subagents.flatMap((s) =>
			computeLatencyPoints(s.records, s.apiCallGroups),
		);
		const merged = [...main, ...sub]
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		// Re-index after merge
		merged.forEach((p, i) => p.index = i);
		return merged;
	});

	function getTabData() {
		switch (activeTab) {
			case 'events': return detail.events;
			case 'transcript': return detail.transcriptRecords;
			case 'api-calls': return detail.apiCallGroups;
			case 'tools': return detail.toolResults;
			case 'subagents': return detail.subagents;
			default: return null;
		}
	}
</script>

<div>
	{#if detail.warnings.length > 0}
		<div class="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
			<p class="text-sm font-medium text-yellow-200">Warnings</p>
			{#each detail.warnings as warning}
				<p class="text-xs text-yellow-300/80">{warning}</p>
			{/each}
		</div>
	{/if}

	{#if detail.skippedLines > 0}
		<div class="mb-4 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
			<p class="text-sm text-orange-200">
				Partial data — {detail.skippedLines} malformed line{detail.skippedLines > 1 ? 's' : ''} skipped.
				Session may be in progress or incomplete.
			</p>
		</div>
	{/if}

	<div class="mb-4">
		<select
			value={activeTab}
			onchange={(e) => { activeTab = (e.currentTarget as HTMLSelectElement).value as TabId; }}
			class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
		>
			{#each tabs as tab}
				<option value={tab.id}>{tab.label} ({tab.count})</option>
			{/each}
		</select>
	</div>

	{#if activeTab === 'token-economics'}
		<TokenEconomicsView {economics} {latencyPoints} />
	{:else if activeTab === 'context-window'}
		<ContextWindowView
			snapshots={contextDecomp.snapshots}
			timeline={contextDecomp.timeline}
			compactions={contextDecomp.compactions}
		/>
	{:else if activeTab === 'tool-effectiveness'}
		<ToolEffectivenessView analysis={toolAnalysis} {subagentSummaries} />
	{:else if activeTab === 'compaction'}
		<CompactionView analysis={compactionAnalysis} />
	{:else if activeTab === 'conversation'}
		<ConversationView tree={conversationTree} />
	{:else}
		<pre class="max-h-[calc(100vh-14rem)] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs font-mono leading-relaxed">{JSON.stringify(getTabData(), null, 2)}</pre>
	{/if}
</div>
