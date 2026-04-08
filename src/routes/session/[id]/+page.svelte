<script lang="ts">
	import { computeTokenEconomics, computeLatencyPoints } from '$lib/analysis/token-tracker.js';
	import TokenEconomicsView from '$lib/components/views/TokenEconomicsView.svelte';

	let { data } = $props();
	const detail = $derived(data.detail);

	let activeTab = $state<'token-economics' | 'events' | 'transcript' | 'api-calls' | 'tools' | 'subagents'>('token-economics');

	const tabs = $derived([
		{ id: 'token-economics' as const, label: 'Token Economics', count: detail.apiCallGroups.length },
		{ id: 'events' as const, label: 'Events', count: detail.events.length },
		{ id: 'transcript' as const, label: 'Transcript', count: detail.transcriptRecords.length },
		{ id: 'api-calls' as const, label: 'API Calls', count: detail.apiCallGroups.length },
		{ id: 'tools' as const, label: 'Tool Results', count: detail.toolResults.length },
		{ id: 'subagents' as const, label: 'Subagents', count: detail.subagents.length },
	]);

	// Compute token economics from all API call groups (main + subagents)
	const allGroups = $derived([
		...detail.apiCallGroups,
		...detail.subagents.flatMap((s) => s.apiCallGroups),
	]);
	const turns = $derived(detail.events.filter((e) => e.event === 'UserPromptSubmit').length);
	const economics = $derived(computeTokenEconomics(allGroups, turns));
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

	<div class="mb-4 flex gap-1 overflow-x-auto border-b border-border">
		{#each tabs as tab}
			<button
				onclick={() => activeTab = tab.id}
				class="whitespace-nowrap px-3 py-2 text-sm transition-colors
					{activeTab === tab.id
						? 'border-b-2 border-primary font-medium text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
			>
				{tab.label}
				<span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{tab.count}</span>
			</button>
		{/each}
	</div>

	{#if activeTab === 'token-economics'}
		<TokenEconomicsView {economics} {latencyPoints} />
	{:else}
		<pre class="max-h-[calc(100vh-14rem)] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs font-mono leading-relaxed">{JSON.stringify(getTabData(), null, 2)}</pre>
	{/if}
</div>
