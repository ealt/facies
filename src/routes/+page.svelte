<script lang="ts">
	import OverviewDashboardView from '$lib/components/views/OverviewDashboardView.svelte';

	let { data } = $props();
</script>

<div>
	<h1 class="mb-6 text-2xl font-bold tracking-tight">Sessions</h1>
	<OverviewDashboardView sessions={data.sessions} />
</div>
