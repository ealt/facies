<script lang="ts">
	import type { SubagentSummary } from '$lib/types.js';

	let { summaries }: { summaries: SubagentSummary[] } = $props();

	let expandedIds = $state(new Set<string>());

	function toggleExpand(id: string) {
		const next = new Set(expandedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedIds = next;
	}

	function formatDuration(ms: number | null): string {
		if (ms === null) return '\u2014';
		if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
		if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
		return `${ms}ms`;
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	function formatCost(c: number | null): string {
		if (c === null) return '\u2014';
		if (c < 0.01) return `$${c.toFixed(4)}`;
		return `$${c.toFixed(2)}`;
	}

	function agentTypeLabel(type: string): string {
		switch (type) {
			case 'Explore': return 'Explore';
			case 'Plan': return 'Plan';
			case 'general-purpose': return 'General';
			default: return type || 'Unknown';
		}
	}

	function agentTypeBadgeClass(type: string): string {
		switch (type) {
			case 'Explore': return 'bg-cyan-500/20 text-cyan-300';
			case 'Plan': return 'bg-purple-500/20 text-purple-300';
			case 'general-purpose': return 'bg-blue-500/20 text-blue-300';
			default: return 'bg-muted text-muted-foreground';
		}
	}

	function truncate(text: string, maxLen: number): string {
		if (text.length <= maxLen) return text;
		return text.slice(0, maxLen) + '\u2026';
	}
</script>

{#if summaries.length > 0}
	<div class="space-y-3">
		{#each summaries as sub}
			{@const isExpanded = expandedIds.has(sub.agentId)}
			<div class="rounded-lg border border-border bg-card">
				<!-- Card header -->
				<div class="flex items-start justify-between gap-3 p-4">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="rounded px-1.5 py-0.5 text-[10px] font-medium {agentTypeBadgeClass(sub.agentType)}">
								{agentTypeLabel(sub.agentType)}
							</span>
							<span class="truncate text-sm font-medium">{sub.description || sub.agentId}</span>
						</div>
						<div class="mt-1 text-xs text-muted-foreground">
							Duration: {formatDuration(sub.durationMs)}
						</div>
					</div>
				</div>

				<!-- Metrics row -->
				<div class="grid grid-cols-2 gap-2 border-t border-border/30 px-4 py-3 sm:grid-cols-4">
					<div>
						<div class="text-[10px] text-muted-foreground">Tool Calls</div>
						<div class="font-mono text-sm">{sub.internalToolCalls}</div>
					</div>
					<div>
						<div class="text-[10px] text-muted-foreground">Tokens (in/out)</div>
						<div class="font-mono text-sm">
							{formatTokens(sub.totalInputTokens)} / {formatTokens(sub.totalOutputTokens)}
						</div>
					</div>
					<div>
						<div class="text-[10px] text-muted-foreground">Cost</div>
						<div class="font-mono text-sm">
							{formatCost(sub.totalCost)}{#if sub.costIsLowerBound}<span class="ml-0.5 text-[10px] text-yellow-400" title="Some API calls used unknown models — cost is a lower bound">+</span>{/if}
						</div>
					</div>
					<div>
						<div class="text-[10px] text-muted-foreground">~Context Overhead</div>
						<div class="font-mono text-sm">
							{sub.contextOverheadTokens !== null ? `~${formatTokens(sub.contextOverheadTokens)} tokens` : '\u2014'}
						</div>
					</div>
				</div>

				<!-- Last assistant message (expandable) -->
				{#if sub.lastAssistantMessage}
					<div class="border-t border-border/30 px-4 py-3">
						<button
							onclick={() => toggleExpand(sub.agentId)}
							class="flex w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
						>
							<span class="transition-transform {isExpanded ? 'rotate-90' : ''}">\u25B6</span>
							Final Output
						</button>
						{#if isExpanded}
							<pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-3 text-xs leading-relaxed">{sub.lastAssistantMessage}</pre>
						{:else}
							<p class="mt-1 font-mono text-xs text-muted-foreground">
								{truncate(sub.lastAssistantMessage, 200)}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">No subagents were spawned in this session.</p>
{/if}
