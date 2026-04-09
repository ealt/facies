<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex flex-col items-center justify-center py-20">
	<div class="rounded-lg border border-border bg-card p-8 text-center">
		<h1 class="text-4xl font-bold text-muted-foreground">{page.status}</h1>
		<p class="mt-2 text-lg text-muted-foreground">{page.error?.message ?? 'Something went wrong'}</p>
		<a href="/" class="mt-4 inline-block text-sm text-primary hover:underline">
			Back to overview
		</a>
	</div>
</div>
