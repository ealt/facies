<script lang="ts">
	import type {
		ConversationTree,
		ConversationNode,
		UserPromptNode,
		ToolResultNode,
		AssistantResponseNode,
		SystemEventNode,
		SubagentNode,
		MetaNode,
	} from '$lib/analysis/conversation-builder.js';

	let { tree }: { tree: ConversationTree } = $props();

	let selectedNodeId = $state<string | null>(null);
	let collapsedNodes = $state(new Set<string>());

	// Flatten visible nodes for rendering (respecting collapsed state)
	const visibleNodes = $derived.by(() => {
		const result: ConversationNode[] = [];
		function walk(nodes: ConversationNode[]) {
			for (const node of nodes) {
				result.push(node);
				if (!collapsedNodes.has(node.id) && node.children.length > 0) {
					walk(node.children);
				}
			}
		}
		walk(tree.roots);
		return result;
	});

	const selectedNode = $derived(
		visibleNodes.find((n) => n.id === selectedNodeId) ?? null,
	);

	function toggleCollapse(id: string) {
		const next = new Set(collapsedNodes);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsedNodes = next;
	}

	function selectNode(id: string) {
		selectedNodeId = selectedNodeId === id ? null : id;
	}

	// --- Display helpers ---

	function nodeIcon(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt': return node.isCompactSummary ? '\u{1F4E6}' : '\u{1F464}';
			case 'tool-result': return node.isError ? '\u{274C}' : '\u{1F527}';
			case 'assistant': return node.isSynthetic ? '\u{26A0}' : '\u{1F916}';
			case 'system': {
				if (node.subtype === 'compact_boundary') return '\u{1F5DC}';
				if (node.subtype === 'api_error') return '\u{26A0}';
				if (node.subtype === 'turn_duration') return '\u{23F1}';
				return '\u{2699}';
			}
			case 'subagent': return '\u{1F9E9}';
			case 'meta': return '\u{1F4CB}';
		}
	}

	function nodeLabel(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt':
				if (node.isCompactSummary) return 'Compaction Summary';
				return truncate(node.content, 80);
			case 'tool-result':
				return `${node.toolName} ${node.isError ? '(error)' : 'result'}`;
			case 'assistant': {
				if (node.textBlocks.length > 0) {
					return truncate(node.textBlocks.map((b) => b.text).join(' '), 80);
				}
				if (node.toolUseBlocks.length > 0) {
					const names = node.toolUseBlocks.map((b) => b.name);
					return `Tool calls: ${names.join(', ')}`;
				}
				if (node.thinkingBlocks.length > 0) return 'Thinking...';
				return 'Assistant response';
			}
			case 'system': {
				if (node.subtype === 'compact_boundary' && node.preTokens !== null) {
					return `Compaction (${formatTokens(node.preTokens)} tokens)`;
				}
				if (node.subtype === 'turn_duration' && node.durationMs !== null) {
					return `Turn duration: ${formatDuration(node.durationMs)}`;
				}
				if (node.subtype === 'api_error' && node.errorMessage) {
					return `API error: ${node.errorMessage}`;
				}
				return `System: ${node.subtype}`;
			}
			case 'subagent':
				return `Subagent: ${node.agentType} (${node.agentId})`;
			case 'meta':
				return node.label;
		}
	}

	function nodeBadge(node: ConversationNode): string | null {
		if (node.kind === 'assistant') {
			const input = (node.usage.input_tokens ?? 0)
				+ (node.usage.cache_read_input_tokens ?? 0)
				+ (node.usage.cache_creation_input_tokens ?? 0);
			const output = node.usage.output_tokens ?? 0;
			if (input + output > 0) {
				return `${formatTokens(input)} in / ${formatTokens(output)} out`;
			}
		}
		return null;
	}

	function nodeColorClass(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt': return 'border-l-blue-500';
			case 'tool-result': return node.isError ? 'border-l-red-500' : 'border-l-emerald-500';
			case 'assistant': return 'border-l-purple-500';
			case 'system': {
				if (node.subtype === 'compact_boundary') return 'border-l-yellow-500';
				if (node.subtype === 'api_error') return 'border-l-red-500';
				return 'border-l-gray-500';
			}
			case 'subagent': return 'border-l-cyan-500';
			case 'meta': return 'border-l-gray-500';
		}
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(Math.round(n));
	}

	function formatDuration(ms: number): string {
		if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
		if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
		if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
		return `${Math.round(ms)}ms`;
	}

	function formatTime(ts: string): string {
		try {
			const d = new Date(ts);
			return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
		} catch {
			return ts;
		}
	}

	function truncate(s: string, max: number): string {
		const clean = s.replace(/\n/g, ' ').trim();
		return clean.length > max ? clean.slice(0, max) + '\u2026' : clean;
	}
</script>

<div class="flex h-[calc(100vh-14rem)] gap-4">
	<!-- Tree panel -->
	<div class="flex-1 min-w-0 overflow-auto rounded-lg border border-border bg-card">
		{#if tree.roots.length === 0}
			<div class="p-8 text-center text-muted-foreground">
				No conversation records in this session.
			</div>
		{:else}
			<div class="p-2">
				{#each visibleNodes as node}
					{@const isCollapsed = collapsedNodes.has(node.id)}
					{@const hasChildren = node.children.length > 0}
					{@const isSelected = node.id === selectedNodeId}

					<div
						role="button"
						tabindex="0"
						onclick={() => selectNode(node.id)}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node.id); } }}
						class="flex w-full items-start gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors cursor-pointer
							hover:bg-muted/30
							{isSelected ? 'bg-muted/50 ring-1 ring-primary/30' : ''}"
						style="padding-left: {node.depth * 16 + 8}px"
					>
						<!-- Collapse toggle -->
						{#if hasChildren}
							<button
								onclick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
								class="mt-0.5 flex-shrink-0 text-[10px] text-muted-foreground hover:text-foreground transition-transform {isCollapsed ? '' : 'rotate-90'}"
							>
								{'\u25B6'}
							</button>
						{:else}
							<span class="mt-0.5 w-3 flex-shrink-0"></span>
						{/if}

						<!-- Icon -->
						<span class="mt-0.5 flex-shrink-0 text-[11px]">{nodeIcon(node)}</span>

						<!-- Content -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate font-mono text-foreground/80">{nodeLabel(node)}</span>
								{#if nodeBadge(node)}
									<span class="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
										{nodeBadge(node)}
									</span>
								{/if}
							</div>
							<div class="text-[9px] text-muted-foreground/60">{formatTime(node.timestamp)}</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Detail panel -->
	<div class="w-[45%] flex-shrink-0 overflow-auto rounded-lg border border-border bg-card">
		{#if selectedNode}
			<div class="p-4 space-y-4">
				<!-- Header -->
				<div class="flex items-center gap-2 border-b border-border/30 pb-3">
					<span class="text-base">{nodeIcon(selectedNode)}</span>
					<div>
						<h3 class="text-sm font-medium">{nodeKindLabel(selectedNode)}</h3>
						<div class="text-[10px] text-muted-foreground">{formatTime(selectedNode.timestamp)}</div>
					</div>
				</div>

				<!-- Node-specific detail -->
				{#if selectedNode.kind === 'user-prompt'}
					{@const node = selectedNode as UserPromptNode}
					{#if node.isCompactSummary}
						<div class="rounded bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 text-xs text-yellow-300">
							Compaction summary — injected by the framework after context compaction.
						</div>
					{/if}
					<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
						<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/90">{node.content}</pre>
					</div>

				{:else if selectedNode.kind === 'tool-result'}
					{@const node = selectedNode as ToolResultNode}
					<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
						<div><span class="text-muted-foreground">Tool</span><div class="font-mono">{node.toolName}</div></div>
						<div><span class="text-muted-foreground">tool_use_id</span><div class="font-mono text-[10px]">{node.toolUseId}</div></div>
						<div><span class="text-muted-foreground">Status</span><div class="font-mono {node.isError ? 'text-red-400' : 'text-green-400'}">{node.isError ? 'Error' : 'Success'}</div></div>
						{#if node.sourceFile}
							<div class="col-span-2"><span class="text-muted-foreground">Source</span><div class="font-mono text-[10px]">{node.sourceFile.filePath} (lines {node.sourceFile.startLine}\u2013{node.sourceFile.startLine + node.sourceFile.numLines - 1} of {node.sourceFile.totalLines})</div></div>
						{/if}
					</div>
					<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
						<pre class="max-h-96 overflow-auto whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">{node.content}</pre>
					</div>

				{:else if selectedNode.kind === 'assistant'}
					{@const node = selectedNode as AssistantResponseNode}
					<!-- Metadata -->
					<div class="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
						<div><span class="text-muted-foreground">Model</span><div class="font-mono">{node.model}</div></div>
						<div><span class="text-muted-foreground">Stop reason</span><div class="font-mono">{node.stopReason ?? '\u2014'}</div></div>
						{#if node.messageId}
							<div><span class="text-muted-foreground">Message ID</span><div class="font-mono text-[10px] truncate" title={node.messageId}>{node.messageId}</div></div>
						{/if}
					</div>

					<!-- Token usage -->
					{@const input = (node.usage.input_tokens ?? 0) + (node.usage.cache_read_input_tokens ?? 0) + (node.usage.cache_creation_input_tokens ?? 0)}
					{@const cacheRead = node.usage.cache_read_input_tokens ?? 0}
					{@const cacheCreate = node.usage.cache_creation_input_tokens ?? 0}
					{@const output = node.usage.output_tokens ?? 0}
					<div class="rounded bg-muted/20 border border-border/30 p-2 text-xs">
						<div class="grid grid-cols-4 gap-2">
							<div><span class="text-muted-foreground">Input</span><div class="font-mono">{formatTokens(input)}</div></div>
							<div><span class="text-muted-foreground">Output</span><div class="font-mono">{formatTokens(output)}</div></div>
							<div><span class="text-muted-foreground">Cache read</span><div class="font-mono">{formatTokens(cacheRead)}</div></div>
							<div><span class="text-muted-foreground">Cache create</span><div class="font-mono">{formatTokens(cacheCreate)}</div></div>
						</div>
					</div>

					<!-- Content blocks -->
					{#if node.thinkingBlocks.length > 0}
						<div>
							<h4 class="mb-1 text-xs font-medium text-muted-foreground">Thinking</h4>
							{#each node.thinkingBlocks as block}
								<div class="border-l-2 border-l-amber-500/50 pl-3 mb-2">
									<pre class="max-h-64 overflow-auto whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/60 italic">{block.thinking}</pre>
								</div>
							{/each}
						</div>
					{/if}

					{#if node.textBlocks.length > 0}
						<div>
							<h4 class="mb-1 text-xs font-medium text-muted-foreground">Text</h4>
							{#each node.textBlocks as block}
								<div class="border-l-2 border-l-purple-500/50 pl-3 mb-2">
									<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/90">{block.text}</pre>
								</div>
							{/each}
						</div>
					{/if}

					{#if node.toolUseBlocks.length > 0}
						<div>
							<h4 class="mb-1 text-xs font-medium text-muted-foreground">Tool Calls</h4>
							{#each node.toolUseBlocks as block}
								<div class="rounded border border-border/30 bg-muted/10 p-2 mb-2">
									<div class="flex items-center gap-2 mb-1">
										<span class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">{block.name}</span>
										<span class="text-[9px] font-mono text-muted-foreground">{block.id}</span>
									</div>
									<pre class="max-h-48 overflow-auto whitespace-pre-wrap text-[10px] font-mono leading-relaxed text-foreground/70">{JSON.stringify(block.input, null, 2)}</pre>
								</div>
							{/each}
						</div>
					{/if}

				{:else if selectedNode.kind === 'system'}
					{@const node = selectedNode as SystemEventNode}
					<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
						<div><span class="text-muted-foreground">Subtype</span><div class="font-mono">{node.subtype}</div></div>
						{#if node.preTokens !== null}
							<div><span class="text-muted-foreground">Pre-compaction tokens</span><div class="font-mono">{formatTokens(node.preTokens)}</div></div>
						{/if}
						{#if node.durationMs !== null}
							<div><span class="text-muted-foreground">Duration</span><div class="font-mono">{formatDuration(node.durationMs)}</div></div>
						{/if}
						{#if node.errorMessage}
							<div><span class="text-muted-foreground">Error</span><div class="font-mono text-red-400">{node.errorMessage}</div></div>
						{/if}
					</div>
					{#if node.content}
						<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
							<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">{node.content}</pre>
						</div>
					{/if}

				{:else if selectedNode.kind === 'subagent'}
					{@const node = selectedNode as SubagentNode}
					<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
						<div><span class="text-muted-foreground">Agent ID</span><div class="font-mono">{node.agentId}</div></div>
						<div><span class="text-muted-foreground">Type</span><div class="font-mono">{node.agentType}</div></div>
					</div>
					{#if node.description}
						<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
							<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">{node.description}</pre>
						</div>
					{/if}
					<div class="rounded bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300">
						{node.children.length} inner node{node.children.length !== 1 ? 's' : ''} — expand in the tree to browse.
					</div>

				{:else if selectedNode.kind === 'meta'}
					{@const node = selectedNode as MetaNode}
					<div class="text-xs">
						<span class="text-muted-foreground">Type: </span>
						<span class="font-mono">{node.recordType}</span>
					</div>
					<div class="border-l-2 {nodeColorClass(selectedNode)} pl-3">
						<pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">{node.label}</pre>
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				Select a node to view details
			</div>
		{/if}
	</div>
</div>

<!-- Summary bar -->
<div class="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
	<span>{tree.nodeCount} nodes</span>
	{#if tree.orphanCount > 0}
		<span class="text-yellow-400">{tree.orphanCount} orphaned</span>
	{/if}
	<span class="flex items-center gap-1"><span class="text-blue-400">{'\u{1F464}'}</span> User</span>
	<span class="flex items-center gap-1"><span class="text-purple-400">{'\u{1F916}'}</span> Assistant</span>
	<span class="flex items-center gap-1"><span class="text-emerald-400">{'\u{1F527}'}</span> Tool result</span>
	<span class="flex items-center gap-1"><span class="text-cyan-400">{'\u{1F9E9}'}</span> Subagent</span>
	<span class="flex items-center gap-1"><span class="text-yellow-400">{'\u{1F5DC}'}</span> Compaction</span>
	<span class="flex items-center gap-1"><span>{'\u{2699}'}</span> System</span>
</div>

<script lang="ts" module>
	function nodeKindLabel(node: ConversationNode): string {
		switch (node.kind) {
			case 'user-prompt': return node.isCompactSummary ? 'Compaction Summary' : 'User Prompt';
			case 'tool-result': return `Tool Result: ${node.toolName}`;
			case 'assistant': return 'Assistant Response';
			case 'system': return `System Event (${node.subtype})`;
			case 'subagent': return `Subagent: ${node.agentType}`;
			case 'meta': return `Metadata (${node.recordType})`;
		}
	}
</script>
