<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="bg-neutral-50 min-h-screen font-sans text-gray-800">
	{@render children()}
</div>
