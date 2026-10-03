<script setup lang="ts">
import type { CrawlRunSummary } from '@pantry-finder/shared'

defineProps<{ run: CrawlRunSummary }>()
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <UBadge :label="run.status" :color="CRAWL_RUN_STATUS_COLORS[run.status]" variant="subtle" />
    <UBadge v-if="run.stale" label="stale" color="error" variant="outline" />
    <UBadge
      v-else-if="run.abortRequested && run.status === 'running'"
      label="stopping"
      color="neutral"
      variant="outline"
    />
  </div>
</template>
