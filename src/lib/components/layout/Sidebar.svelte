<script lang="ts">
	import type { SessionSummary } from '$lib/types.js';
	import { page } from '$app/state';

	let { sessions }: { sessions: SessionSummary[] } = $props();

	const grouped = $derived.by(() => {
		const map = new Map<string, SessionSummary[]>();
		for (const s of sessions) {
			const project = s.project || 'unknown';
			const list = map.get(project);
			if (list) {
				list.push(s);
			} else {
				map.set(project, [s]);
			}
		}
		// Sort sessions within each project by startTime descending
		for (const list of map.values()) {
			list.sort((a, b) => b.startTime.localeCompare(a.startTime));
		}
		return map;
	});

	function formatDuration(ms: number): string {
		if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
		if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
		return `${(ms / 3_600_000).toFixed(1)}h`;
	}

	function isActive(sessionId: string): boolean {
		return page.url.pathname === `/session/${sessionId}`;
	}
</script>

<aside class="flex w-64 flex-col border-r border-border bg-sidebar">
	<div class="flex h-12 items-center border-b border-border px-4">
		<a href="/" class="text-lg font-semibold tracking-tight text-sidebar-foreground">Facies</a>
	</div>
	<nav class="flex-1 overflow-y-auto p-2">
		{#if sessions.length === 0}
			<p class="px-2 py-4 text-sm text-muted-foreground">No sessions found</p>
		{:else}
			{#each [...grouped] as [project, projectSessions]}
				<div class="mb-3">
					<h3 class="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{project}
					</h3>
					{#each projectSessions as session}
						<a
							href="/session/{session.sessionId}"
							class="mb-0.5 flex flex-col rounded-md px-2 py-1.5 text-sm transition-colors
								{isActive(session.sessionId)
									? 'bg-sidebar-accent text-sidebar-accent-foreground'
									: 'text-sidebar-foreground hover:bg-sidebar-accent/50'}"
						>
							<span class="truncate font-medium">{session.title ?? session.sessionId}</span>
							<span class="flex items-center gap-2 text-xs text-muted-foreground">
								<span>{session.model}</span>
								<span>&middot;</span>
								<span>{formatDuration(session.durationMs)}</span>
							</span>
						</a>
					{/each}
				</div>
			{/each}
		{/if}
	</nav>
</aside>
