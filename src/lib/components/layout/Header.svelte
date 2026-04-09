<script lang="ts">
	import type { SessionSummary } from '$lib/types.js';

	let { session }: { session: SessionSummary | null } = $props();

	function formatDuration(ms: number): string {
		if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
		if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
		return `${(ms / 3_600_000).toFixed(1)}h`;
	}
</script>

<header class="flex h-12 items-center border-b border-border bg-background px-4">
	{#if session}
		<div class="flex items-center gap-3">
			<a
				href="/"
				class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				title="Back to sessions"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M15 18l-6-6 6-6" />
				</svg>
			</a>
			<h2 class="font-medium">{session.title ?? session.sessionId}</h2>
			<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
				{session.model}
			</span>
			<span class="text-sm text-muted-foreground">
				{formatDuration(session.durationMs)}
			</span>
			<span class="text-sm text-muted-foreground">
				{session.totalInputTokens.toLocaleString()} input &middot;
				{session.totalOutputTokens.toLocaleString()} output
			</span>
		</div>
	{:else}
		<a href="/" class="text-lg font-semibold tracking-tight">Facies</a>
	{/if}
</header>
