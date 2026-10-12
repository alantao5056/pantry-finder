<script setup lang="ts">
import type { EditValue, ScheduleDraft } from '@pantry-finder/shared'

// Read-only rendering of a target's value: text, a schedule list, or a list of
// food offerings.
const props = defineProps<{ value: EditValue | null | undefined }>()

const offerings = computed(() =>
  Array.isArray(props.value) && typeof props.value[0] === 'string' ? (props.value as string[]) : null,
)
const schedules = computed(() =>
  Array.isArray(props.value) && !offerings.value ? (props.value as ScheduleDraft[]) : null,
)

const scheduleLine = (s: ScheduleDraft) =>
  `${s.weekDay} ${s.startTime} – ${s.endTime}${s.everyOtherWeekIndicator ? ' (every other week)' : ''}`
</script>

<template>
  <span v-if="value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)" class="text-(--ui-text-dimmed)">—</span>
  <p v-else-if="offerings" class="text-sm">{{ offerings.join(', ') }}</p>
  <ul v-else-if="schedules" class="text-sm flex flex-col gap-0.5">
    <li v-for="(s, i) in schedules" :key="i">
      {{ scheduleLine(s) }}
      <span v-if="s.notes" class="text-(--ui-text-muted)">· {{ s.notes }}</span>
    </li>
  </ul>
  <p v-else class="text-sm whitespace-pre-wrap">{{ value }}</p>
</template>
