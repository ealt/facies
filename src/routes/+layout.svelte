<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/layout/Header.svelte';
	import { page } from '$app/state';

	let { data, children } = $props();

	const isHomePage = $derived(page.url.pathname === '/');

	const activeSession = $derived.by(() => {
		const match = page.url.pathname.match(/^\/session\/(.+)/);
		if (!match) return null;
		return data.sessions.find((s: { sessionId: string }) => s.sessionId === match[1]) ?? null;
	});
</script>

{#if isHomePage}
	<div class="min-h-screen bg-background text-foreground">
		<Header session={null} />
		<main class="p-6">
			{@render children()}
		</main>
	</div>
{:else}
	<div class="flex h-screen flex-col bg-background text-foreground">
		<Header session={activeSession} />
		<main class="flex-1 overflow-auto p-6">
			{@render children()}
		</main>
	</div>
{/if}
