<script lang="ts">
	import type { SessionSummary } from '$lib/types.js';

	let { data } = $props();
	const sessions: SessionSummary[] = $derived(data.sessions);

	function formatDuration(ms: number): string {
		if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
		if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
		return `${(ms / 3_600_000).toFixed(1)}h`;
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}
</script>

<div>
	<h1 class="mb-6 text-2xl font-bold tracking-tight">Sessions</h1>

	{#if sessions.length === 0}
		<div class="rounded-lg border border-border bg-card p-8 text-center">
			<p class="text-muted-foreground">No sessions found.</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Ensure Claude Code logging hooks are configured and <code class="text-xs">~/.claude/logs/</code> contains session data.
			</p>
		</div>
	{:else}
		<div class="rounded-lg border border-border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-muted/50">
						<th class="px-4 py-2 text-left font-medium">Session</th>
						<th class="px-4 py-2 text-left font-medium">Model</th>
						<th class="px-4 py-2 text-right font-medium">Duration</th>
						<th class="px-4 py-2 text-right font-medium">Turns</th>
						<th class="px-4 py-2 text-right font-medium">Input</th>
						<th class="px-4 py-2 text-right font-medium">Output</th>
						<th class="px-4 py-2 text-right font-medium">Tools</th>
						<th class="px-4 py-2 text-right font-medium">Compactions</th>
					</tr>
				</thead>
				<tbody>
					{#each sessions as session}
						<tr class="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
							<td class="px-4 py-2">
								<a href="/session/{session.sessionId}" class="font-medium text-primary hover:underline">
									{session.title ?? session.sessionId}
								</a>
								<div class="text-xs text-muted-foreground">{session.project}</div>
							</td>
							<td class="px-4 py-2">
								<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{session.model}</span>
							</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{formatDuration(session.durationMs)}</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{session.turns}</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{formatTokens(session.totalInputTokens)}</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{formatTokens(session.totalOutputTokens)}</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{session.toolCallCount}</td>
							<td class="px-4 py-2 text-right font-mono text-xs">{session.compactionCount}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
