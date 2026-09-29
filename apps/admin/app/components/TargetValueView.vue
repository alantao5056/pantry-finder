<script setup lang="ts">
import type { ScheduleDraft, TargetValue } from '@pantry-finder/shared'

// Read-only rendering of a mapping target's value: text, or a schedule list.
defineProps<{ value: TargetValue | null | undefined }>()

const scheduleLine = (s: ScheduleDraft) =>
  `${s.weekDay} ${s.startTime} – ${s.endTime}${s.everyOtherWeekIndicator ? ' (every other week)' : ''}`
</script>

<template>
  <span v-if="value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)" class="text-(--ui-text-dimmed)">—</span>
  <ul v-else-if="Array.isArray(value)" class="text-sm flex flex-col gap-0.5">
    <li v-for="(s, i) in value" :key="i">
      {{ scheduleLine(s) }}
      <span v-if="s.notes" class="text-(--ui-text-muted)">· {{ s.notes }}</span>
    </li>
  </ul>
  <p v-else class="text-sm whitespace-pre-wrap">{{ value }}</p>
</template>
