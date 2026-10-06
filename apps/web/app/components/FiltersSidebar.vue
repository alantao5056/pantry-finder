<script setup lang="ts">
import {
  ALL_DAYS,
  countActiveFilters,
  EMPTY_FILTERS,
  type PantryFilters,
} from '~/utils/pantry'

const props = defineProps<{
  modelValue: PantryFilters
  open: boolean
  foodTypes: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PantryFilters]
  toggle: []
}>()

const activeCount = computed(() => countActiveFilters(props.modelValue))

const update = (patch: Partial<PantryFilters>) => {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

const toggleOpenNow = () => update({ openNow: !props.modelValue.openNow })
const toggleDay = (d: string) => {
  const list = props.modelValue.day
  update({ day: list.includes(d) ? list.filter(x => x !== d) : [...list, d] })
}
const toggleFoodType = (f: string) => {
  const list = props.modelValue.foodType
  update({ foodType: list.includes(f) ? list.filter(x => x !== f) : [...list, f] })
}
const clearDays = () => update({ day: [] })
const clearFoodTypes = () => update({ foodType: [] })
const clearAll = () => emit('update:modelValue', { ...EMPTY_FILTERS })
</script>

<template>
  <aside
    :class="[
      'bg-[var(--cream-light)] border-r md:border-r-0 border-[var(--border-soft)] overflow-hidden',
      // Mobile: absolute drawer within the parent (main row)
      'absolute inset-y-0 left-0 w-[272px] z-40 transition-transform duration-300 ease-in-out',
      open ? 'translate-x-0' : '-translate-x-full',
      // Desktop: inline; width transitions between 272 and the 48px rail
      'md:static md:translate-x-0 md:transition-[width] md:flex-shrink-0',
      open ? 'md:w-[272px]' : 'md:w-12',
    ]"
  >
    <!-- Collapsed rail (desktop only): expand button + active filter count -->
    <div
      v-if="!open"
      class="hidden md:flex flex-col items-center gap-2 pt-1.5"
    >
      <button
        type="button"
        class="panel-toggle"
        aria-label="Show filters"
        title="Show filters"
        @click="emit('toggle')"
      >
        <UIcon name="i-lucide-chevrons-right" class="size-[18px]" />
      </button>
      <span v-if="activeCount > 0" class="count-badge">{{ activeCount }}</span>
    </div>

    <div
      class="w-[272px] p-5 md:pt-1.5 h-full overflow-y-auto"
      :class="{ 'md:hidden': !open }"
      :aria-hidden="!open"
      :inert="!open"
    >
      <!-- Header -->
      <div class="flex justify-between items-center mb-5">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="size-[15px] text-[var(--green-dark)]" />
          <span class="font-bold text-[14px] text-[var(--green-dark)]">Filters</span>
          <span v-if="activeCount > 0" class="count-badge">{{ activeCount }}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            v-if="activeCount > 0"
            type="button"
            class="bg-transparent border-none text-[var(--accent-text)] hover:text-[var(--accent)] text-[12px] font-semibold"
            @click="clearAll"
          >Clear all</button>
          <button
            type="button"
            class="panel-toggle -mr-1.5"
            aria-label="Hide filters"
            title="Hide filters"
            @click="emit('toggle')"
          >
            <UIcon name="i-lucide-chevrons-left" class="size-[18px]" />
          </button>
        </div>
      </div>

      <!-- Open Now toggle -->
      <div class="mb-5 toggle-row">
        <span class="toggle-label">Open Right Now</span>
        <button
          type="button"
          role="switch"
          :aria-checked="modelValue.openNow"
          class="toggle-track"
          @click="toggleOpenNow"
        >
          <span class="toggle-knob" />
        </button>
      </div>

      <!-- Day filter -->
      <div class="mb-5">
        <label class="block text-[13px] font-semibold text-gray-700 mb-2.5">Open Day</label>
        <div class="flex flex-col gap-1.5">
          <button
            type="button"
            :class="['filter-btn', { 'is-active': modelValue.day.length === 0 }]"
            @click="clearDays"
          >Any day</button>
          <button
            v-for="d in ALL_DAYS"
            :key="d"
            type="button"
            :class="['filter-btn', { 'is-active': modelValue.day.includes(d) }]"
            @click="toggleDay(d)"
          >
            <span>{{ d }}</span>
            <UIcon
              v-if="modelValue.day.includes(d)"
              name="i-lucide-check"
              class="size-[14px]"
            />
          </button>
        </div>
      </div>

      <!-- Food Type filter -->
      <div>
        <label class="block text-[13px] font-semibold text-gray-700 mb-2.5">Food Type</label>
        <div class="flex flex-col gap-1.5">
          <button
            type="button"
            :class="['filter-btn', { 'is-active': modelValue.foodType.length === 0 }]"
            @click="clearFoodTypes"
          >All types</button>
          <button
            v-for="f in foodTypes"
            :key="f"
            type="button"
            :class="['filter-btn text-[12px]', { 'is-active': modelValue.foodType.includes(f) }]"
            @click="toggleFoodType(f)"
          >
            <span>{{ f }}</span>
            <UIcon
              v-if="modelValue.foodType.includes(f)"
              name="i-lucide-check"
              class="size-[13px] shrink-0"
            />
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
