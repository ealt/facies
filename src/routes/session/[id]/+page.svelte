<script lang="ts">
	let { data } = $props();
	const detail = $derived(data.detail);

	let activeTab = $state<'events' | 'transcript' | 'api-calls' | 'tools' | 'subagents'>('transcript');

	const tabs = $derived([
		{ id: 'events' as const, label: 'Events', count: detail.events.length },
		{ id: 'transcript' as const, label: 'Transcript', count: detail.transcriptRecords.length },
		{ id: 'api-calls' as const, label: 'API Calls', count: detail.apiCallGroups.length },
		{ id: 'tools' as const, label: 'Tool Results', count: detail.toolResults.length },
		{ id: 'subagents' as const, label: 'Subagents', count: detail.subagents.length },
	]);

	function getTabData() {
		switch (activeTab) {
			case 'events': return detail.events;
			case 'transcript': return detail.transcriptRecords;
			case 'api-calls': return detail.apiCallGroups;
			case 'tools': return detail.toolResults;
			case 'subagents': return detail.subagents;
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

	<div class="mb-4 flex gap-1 border-b border-border">
		{#each tabs as tab}
			<button
				onclick={() => activeTab = tab.id}
				class="px-3 py-2 text-sm transition-colors
					{activeTab === tab.id
						? 'border-b-2 border-primary font-medium text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
			>
				{tab.label}
				<span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{tab.count}</span>
			</button>
		{/each}
	</div>

	<pre class="max-h-[calc(100vh-14rem)] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs font-mono leading-relaxed">{JSON.stringify(getTabData(), null, 2)}</pre>
</div>
