<script lang="ts">
	import type { CompactionAnalysis } from '$lib/analysis/compaction-analyzer.js';
	import CompactionChart from '$lib/components/charts/CompactionChart.svelte';

	let { analysis }: { analysis: CompactionAnalysis } = $props();

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(Math.round(n));
	}

	function formatPct(n: number): string {
		return `${(n * 100).toFixed(1)}%`;
	}

	function formatCost(n: number): string {
		return `$${n.toFixed(4)}`;
	}

	function formatTime(ts: string): string {
		try {
			const d = new Date(ts);
			return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
		} catch {
			return ts;
		}
	}

	function formatDuration(ms: number): string {
		if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
		if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
		if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
		return `${Math.round(ms)}ms`;
	}

	// Expanded card state
	let expandedCards = $state(new Set<number>());

	function toggleCard(idx: number) {
		const next = new Set(expandedCards);
		if (next.has(idx)) next.delete(idx);
		else next.add(idx);
		expandedCards = next;
	}
</script>

<div class="space-y-6">
	<!-- Summary metrics -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Compactions</div>
			<div class="text-lg font-semibold">{analysis.compactions.length}</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Avg Pre-Compaction Size</div>
			<div class="text-lg font-semibold">
				{analysis.avgPreTokens !== null ? formatTokens(analysis.avgPreTokens) : '\u2014'}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">
				Avg Tokens Freed
				<span class="ml-1 text-[9px] text-muted-foreground" title="Post-compaction size is inferred from the next API call">~</span>
			</div>
			<div class="text-lg font-semibold">
				{analysis.avgTokensFreed !== null ? `~${formatTokens(analysis.avgTokensFreed)}` : '\u2014'}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs text-muted-foreground">Avg Recovery Turns</div>
			<div class="text-lg font-semibold">
				{analysis.avgRecoveryTurns !== null ? analysis.avgRecoveryTurns.toFixed(1) : '\u2014'}
			</div>
		</div>
	</div>

	<!-- Session compaction timeline -->
	{#if analysis.contextSizePoints.length > 0}
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-3 text-sm font-medium">Session Compaction Timeline</h3>
			<CompactionChart
				compactions={analysis.compactions}
				contextSizePoints={analysis.contextSizePoints}
				sessionStartTime={analysis.sessionStartTime}
				sessionEndTime={analysis.sessionEndTime}
			/>
			{#if analysis.compactions.length > 0}
				<div class="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
					<span class="flex items-center gap-1">
						<span class="inline-block h-2 w-4 rounded-sm bg-blue-500/30 border border-blue-500/50"></span>
						Context size
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-0 border-l-2 border-dashed border-purple-500/80"></span>
						Compaction
					</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Per-compaction detail cards -->
	{#if analysis.compactions.length > 0}
		<div class="space-y-3">
			<h3 class="text-sm font-medium">Compaction Details</h3>
			{#each analysis.compactions as comp, idx}
				{@const expanded = expandedCards.has(idx)}
				{@const freedPct = comp.tokensFreed !== null && comp.preTokens > 0
					? comp.tokensFreed / comp.preTokens
					: null}
				{@const barPct = comp.postTokens !== null && comp.preTokens > 0
					? Math.min(comp.postTokens / comp.preTokens, 1)
					: null}
				{@const isUnresolved = comp.postTokens === null}

				<div class="rounded-lg border border-border bg-card">
					<button
						onclick={() => toggleCard(idx)}
						class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
					>
						<div class="flex items-center gap-3">
							<span class="transition-transform text-xs {expanded ? 'rotate-90' : ''}">{'\u25B6'}</span>
							<h4 class="text-sm font-medium">Compaction #{idx + 1}</h4>
							<span class="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
								{comp.trigger}
							</span>
						</div>
						<div class="flex items-center gap-4 text-xs text-muted-foreground">
							<span>{formatTokens(comp.preTokens)}</span>
							<span>{'\u2192'}</span>
							<span>{comp.postTokens !== null ? `~${formatTokens(comp.postTokens)}` : '\u2014'}</span>
							{#if freedPct !== null}
								<span class="text-green-400">(~{formatPct(freedPct)} freed)</span>
							{/if}
						</div>
					</button>

					{#if expanded}
						<div class="border-t border-border/30 px-4 py-3 space-y-4">
							<!-- Before/After bar visualization -->
							<div class="space-y-2">
								<div>
									<div class="flex justify-between text-xs mb-1">
										<span class="text-muted-foreground">Before</span>
										<span class="font-mono">{formatTokens(comp.preTokens)} tokens</span>
									</div>
									<div class="h-3 w-full rounded bg-blue-500/30 border border-blue-500/20"></div>
								</div>
								<div>
									<div class="flex justify-between text-xs mb-1">
										<span class="text-muted-foreground">
											After
											<span class="text-[9px] text-muted-foreground" title="Inferred from the next API call's total input tokens">~</span>
										</span>
										<span class="font-mono">
											{comp.postTokens !== null ? `~${formatTokens(comp.postTokens)}` : '\u2014'}
										</span>
									</div>
									{#if barPct !== null}
										<div class="h-3 w-full rounded bg-muted/30 border border-border/30">
											<div
												class="h-full rounded bg-blue-500/30 border-r border-blue-500/40"
												style="width: {barPct * 100}%"
											></div>
										</div>
									{:else}
										<div class="h-3 w-full rounded bg-muted/20 border border-border/20"></div>
									{/if}
								</div>
								{#if comp.tokensFreed !== null && freedPct !== null}
									<div class="text-xs text-green-400">
										Freed: ~{formatTokens(comp.tokensFreed)} tokens (~{formatPct(freedPct)})
									</div>
								{/if}
							</div>

							<!-- Metrics grid -->
							<div class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
								<div>
									<span class="text-muted-foreground">Time</span>
									<div class="font-mono">{formatTime(comp.timestamp)}</div>
								</div>
								<div>
									<span class="text-muted-foreground">Time since session start</span>
									<div class="font-mono">
										{comp.elapsedMs !== null ? formatDuration(comp.elapsedMs) : '\u2014'}
									</div>
								</div>
								<div>
									<span class="text-muted-foreground">Turns before</span>
									<div class="font-mono">{comp.turnsBefore}</div>
								</div>
								<div>
									<span class="text-muted-foreground">Cache rate before</span>
									<div class="font-mono">
										{comp.cacheRateBefore !== null ? formatPct(comp.cacheRateBefore) : '\u2014'}
									</div>
								</div>
								<div>
									<span class="text-muted-foreground">Cache rate after</span>
									<div class="font-mono">
										{comp.cacheRateAfter !== null ? formatPct(comp.cacheRateAfter) : '\u2014'}
									</div>
								</div>
								<div>
									<span class="text-muted-foreground">Recovery turns</span>
									<div class="font-mono">
										{#if isUnresolved}
											unavailable — session ended
										{:else if comp.recoveryTurns !== null}
											{comp.recoveryTurns} turn{comp.recoveryTurns !== 1 ? 's' : ''} to >80%
										{:else}
											did not recover
										{/if}
									</div>
								</div>
								{#if comp.cacheRateBefore !== null && comp.cacheRateAfter !== null}
									<div>
										<span class="text-muted-foreground">Cache rate change</span>
										<div class="font-mono {comp.cacheRateAfter < comp.cacheRateBefore ? 'text-red-400' : 'text-green-400'}">
											{formatPct(comp.cacheRateBefore)} {'\u2192'} {formatPct(comp.cacheRateAfter)}
										</div>
									</div>
								{/if}
								{#if comp.firstPostCompactionCost !== null}
									<div>
										<span class="text-muted-foreground">First post-compaction call cost</span>
										<div class="font-mono text-yellow-400">{formatCost(comp.firstPostCompactionCost)}</div>
									</div>
								{/if}
								{#if comp.avgPreCompactionCost !== null}
									<div>
										<span class="text-muted-foreground">Avg pre-compaction call cost</span>
										<div class="font-mono">{formatCost(comp.avgPreCompactionCost)}</div>
									</div>
								{/if}
							</div>

							<!-- Data accuracy note -->
							<div class="text-[10px] text-muted-foreground/60 border-t border-border/20 pt-2">
								"Before" is exact (from compactMetadata.preTokens).
								"After" is inferred from the next API call's total input tokens.
								"Freed" is the difference.
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Empty state -->
	{#if analysis.compactions.length === 0}
		<div class="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
			No compaction events in this session.
		</div>
	{/if}
</div>
