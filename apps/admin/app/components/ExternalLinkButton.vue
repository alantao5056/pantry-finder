<script setup lang="ts">
// Small outlined button that opens an external page in a new tab.
defineProps<{ to: string; label: string }>()
</script>

<template>
  <UButton :to="to" target="_blank" :label="label" icon="i-lucide-external-link" size="xs" color="neutral" variant="outline" />
</template>
