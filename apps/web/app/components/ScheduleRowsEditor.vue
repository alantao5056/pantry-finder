<script lang="ts">
// Shape of one editable schedule row → maps to SubmissionScheduleSchema on submit.
export interface ScheduleRow {
  weekDay: string
  start: string
  end: string
  notes: string
  everyOtherWeek: boolean
}
</script>

<script setup lang="ts">
// Repeatable schedule-row editor, shared by the pantry-level "Operating Hours"
// and each service's own schedules on the Add-a-Pantry form. The editor owns
// add/remove; parents just bind a (possibly empty) array via v-model.
const rows = defineModel<ScheduleRow[]>({ required: true })

const props = withDefaults(defineProps<{ addLabel?: string; showErrors?: boolean }>(), {
  addLabel: 'Add another time slot',
  showErrors: false,
})

// Day / opens / closes are all required once a row exists.
const rowIncomplete = (row: ScheduleRow) =>
  props.showErrors && (!row.weekDay || !row.start || !row.end)

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HOURS = [
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM',
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM',
  '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM',
]

const addRow = () =>
  rows.value.push({ weekDay: '', start: '', end: '', notes: '', everyOtherWeek: false })
const removeRow = (i: number) => rows.value.splice(i, 1)
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div
      v-for="(row, i) in rows"
      :key="i"
      class="rounded-[12px] border p-3"
      style="border-color: var(--border-soft); background: var(--surface-subtle);"
    >
      <div class="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2.5">
        <select v-model="row.weekDay" class="form-select" :class="{ 'has-error': showErrors && !row.weekDay }" aria-label="Day">
          <option value="">Day</option>
          <option v-for="d in WEEKDAYS" :key="d" :value="d">{{ d }}</option>
        </select>
        <select v-model="row.start" class="form-select" :class="{ 'has-error': showErrors && !row.start }" aria-label="Opens">
          <option value="">Opens</option>
          <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
        </select>
        <select v-model="row.end" class="form-select" :class="{ 'has-error': showErrors && !row.end }" aria-label="Closes">
          <option value="">Closes</option>
          <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
        </select>
        <button
          type="button"
          aria-label="Remove time slot"
          class="btn-icon w-9 h-9 rounded-[10px] shrink-0 justify-self-end"
          style="border: 1.5px solid var(--danger-border); background: var(--danger-wash); color: var(--danger);"
          @click="removeRow(i)"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>

      <p v-if="rowIncomplete(row)" class="field-error mt-1.5">Day, open, and close times are required.</p>

      <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 mt-2.5 items-center">
        <input v-model="row.notes" type="text" placeholder="Notes (optional)" class="form-input" />
        <label class="check-pill" :class="{ 'is-checked': row.everyOtherWeek }">
          <input v-model="row.everyOtherWeek" type="checkbox" class="accent-[var(--green-dark)] w-3.5 h-3.5" />
          Every other week
        </label>
      </div>
    </div>

    <button
      type="button"
      class="inline-flex items-center gap-2 px-[18px] py-2.5 rounded-[10px] text-[13px] font-semibold self-start"
      style="border: 1.5px dashed var(--green-soft); background: var(--green-light); color: var(--green-dark);"
      @click="addRow"
    >
      <span class="text-base leading-none">+</span> {{ props.addLabel }}
    </button>
  </div>
</template>
