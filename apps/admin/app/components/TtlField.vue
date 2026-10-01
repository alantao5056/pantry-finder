<script setup lang="ts">
import { MAX_CACHE_TTL_MINUTES, MIN_CACHE_TTL_MINUTES } from '@pantry-finder/shared'

// One cache TTL on the Settings page: minutes in, with the readable duration beside it.
defineProps<{ label: string; description: string; defaultMinutes: number }>()
const minutes = defineModel<number>({ required: true })
</script>

<template>
  <UFormField
    :label="`${label} (minutes)`"
    :description="description"
    :hint="`default ${formatDuration(defaultMinutes * 60)}`"
  >
    <div class="flex items-center gap-3">
      <UInputNumber v-model="minutes" :min="MIN_CACHE_TTL_MINUTES" :max="MAX_CACHE_TTL_MINUTES" class="w-40" />
      <span class="text-sm text-(--ui-text-muted)">= {{ formatDuration((minutes ?? 0) * 60) }}</span>
    </div>
  </UFormField>
</template>
