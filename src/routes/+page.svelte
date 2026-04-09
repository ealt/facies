<script lang="ts">
	import OverviewDashboardView from '$lib/components/views/OverviewDashboardView.svelte';

	let { data } = $props();
</script>

<OverviewDashboardView sessions={data.sessions} />
