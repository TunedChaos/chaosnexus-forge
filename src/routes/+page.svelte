<script lang="ts">
  import DualEditor from "$lib/components/DualEditor.svelte";
  import UnsavedChangesModal from "$lib/components/UnsavedChangesModal.svelte";
</script>

<div class="h-full w-full">
  <DualEditor />
  <UnsavedChangesModal />
</div>
