<script setup lang="ts">
import type { ScheduleDraft, TargetValue } from '@pantry-finder/shared'

// Editable value of a mapping target: the schedule editor for hours, a text
// box otherwise.
const value = defineModel<TargetValue>({ required: true })

const schedules = computed({
  get: () => value.value as ScheduleDraft[],
  set: (v) => { value.value = v },
})
const text = computed({
  get: () => value.value as string,
  set: (v) => { value.value = v },
})
</script>

<template>
  <ScheduleEditor v-if="Array.isArray(value)" v-model="schedules" />
  <UTextarea v-else v-model="text" :rows="1" autoresize class="w-full" />
</template>
