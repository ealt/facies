<script lang="ts">
	import '../app.css';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import { page } from '$app/state';

	let { data, children } = $props();

	const activeSession = $derived.by(() => {
		const match = page.url.pathname.match(/^\/session\/(.+)/);
		if (!match) return null;
		return data.sessions.find((s: { sessionId: string }) => s.sessionId === match[1]) ?? null;
	});
</script>

<div class="flex h-screen flex-col bg-background text-foreground">
	<div class="flex flex-1 overflow-hidden">
		<Sidebar sessions={data.sessions} />
		<div class="flex flex-1 flex-col overflow-hidden">
			<Header session={activeSession} />
			<main class="flex-1 overflow-auto p-6">
				{@render children()}
			</main>
		</div>
	</div>
</div>
