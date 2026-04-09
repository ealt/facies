<script lang="ts">
	import type { ToolCall } from '$lib/types.js';

	let { calls }: { calls: ToolCall[] } = $props();

	let expanded = $state(false);

	const failedCalls = $derived(
		calls
			.filter((c) => c.failed)
			.sort((a, b) => {
				const aTime = new Date(a.endTimestamp ?? a.timestamp).getTime();
				const bTime = new Date(b.endTimestamp ?? b.timestamp).getTime();
				return aTime - bTime;
			})
	);

	function formatTime(ts: string): string {
		try {
			const d = new Date(ts);
			return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
		} catch {
			return ts;
		}
	}

	function truncate(text: string, maxLen: number): string {
		if (text.length <= maxLen) return text;
		return text.slice(0, maxLen) + '\u2026';
	}
</script>

{#if failedCalls.length > 0}
	<div class="rounded-lg border border-border bg-card">
		<button
			onclick={() => expanded = !expanded}
			class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
		>
			<div class="flex items-center gap-2">
				<span class="transition-transform text-xs {expanded ? 'rotate-90' : ''}">{'\u25B6'}</span>
				<h3 class="text-sm font-medium">
					Failure Analysis
				</h3>
				<span class="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
					{failedCalls.length} failure{failedCalls.length !== 1 ? 's' : ''}
				</span>
			</div>
		</button>

		{#if expanded}
			<div class="border-t border-border/30 p-4">
				<div class="overflow-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-border text-left text-xs text-muted-foreground">
								<th class="pb-2 pr-3">Time</th>
								<th class="pb-2 pr-3">Tool</th>
								<th class="pb-2 pr-3">Error</th>
								<th class="pb-2">Preceding Input</th>
							</tr>
						</thead>
						<tbody>
							{#each failedCalls as call}
								<tr class="border-b border-border/30 hover:bg-muted/20">
									<td class="py-1.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
										{formatTime(call.endTimestamp ?? call.timestamp)}
									</td>
									<td class="py-1.5 pr-3 font-medium text-xs">
										{call.toolName}
									</td>
									<td class="py-1.5 pr-3 text-xs text-red-300">
										{call.error ? truncate(call.error, 120) : '\u2014'}
									</td>
									<td class="py-1.5 font-mono text-xs text-muted-foreground">
										{call.inputPreview ? truncate(call.inputPreview, 100) : call.inputKeys.length > 0 ? call.inputKeys.join(', ') : '\u2014'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</div>
{/if}
