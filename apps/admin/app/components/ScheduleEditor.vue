<script setup lang="ts">
import type { ScheduleDraft } from '@pantry-finder/shared'

// Editable list of schedule rows (pantry-level or one service's). Rows missing
// a day, start, or end are dropped by the API on save.
const rows = defineModel<ScheduleDraft[]>({ required: true })

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const addRow = () => { rows.value.push({ weekDay: '', startTime: '', endTime: '' }) }
const removeRow = (i: number) => rows.value.splice(i, 1)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="(row, i) in rows"
      :key="i"
      class="grid grid-cols-2 md:grid-cols-[9rem_7rem_7rem_1fr_auto_auto] gap-2 items-center"
    >
      <USelect v-model="row.weekDay" :items="WEEKDAYS" placeholder="Day" />
      <UInput v-model="row.startTime" placeholder="9:00 AM" />
      <UInput v-model="row.endTime" placeholder="12:00 PM" />
      <UInput v-model="row.notes" placeholder="Notes" />
      <UCheckbox v-model="row.everyOtherWeekIndicator" label="Every other week" />
      <UButton icon="i-lucide-x" color="error" variant="ghost" aria-label="Remove row" @click="removeRow(i)" />
    </div>
    <UButton
      label="Add time slot"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      class="self-start"
      @click="addRow"
    />
  </div>
</template>
