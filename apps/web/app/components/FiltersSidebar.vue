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
  close: []
}>()

const activeCount = computed(() => countActiveFilters(props.modelValue))

const update = (patch: Partial<PantryFilters>) => {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

const toggleOpenNow = () => update({ openNow: !props.modelValue.openNow })
const setDay = (d: string) => update({ day: props.modelValue.day === d ? '' : d })
const setFoodType = (f: string) => update({ foodType: props.modelValue.foodType === f ? '' : f })
const clearAll = () => emit('update:modelValue', { ...EMPTY_FILTERS })
</script>

<template>
  <aside
    :class="[
      'bg-white border-r border-cream-dark overflow-hidden',
      // Mobile: absolute drawer within the parent (main row)
      'absolute inset-y-0 left-0 w-[272px] z-40 transition-transform duration-300 ease-in-out',
      open ? 'translate-x-0' : '-translate-x-full',
      // Desktop: inline; width transitions between 272 and 0
      'md:static md:translate-x-0 md:transition-[width] md:flex-shrink-0',
      open ? 'md:w-[272px]' : 'md:w-0',
    ]"
    :aria-hidden="!open"
  >
    <div class="w-[272px] p-5 h-full overflow-y-auto">
      <!-- Header -->
      <div class="flex justify-between items-center mb-5">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="size-[15px] text-forest-700" />
          <span class="font-bold text-[14px] text-forest-700">Filters</span>
          <span
            v-if="activeCount > 0"
            class="bg-forest-700 text-white rounded-full text-[11px] font-semibold px-2 py-[1px]"
          >{{ activeCount }}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            v-if="activeCount > 0"
            type="button"
            class="bg-transparent border-none text-amber-600 hover:text-amber-700 text-[12px] font-semibold"
            @click="clearAll"
          >Clear all</button>
          <button
            type="button"
            class="md:hidden p-1 -mr-1 text-gray-500 hover:text-gray-700 rounded"
            aria-label="Close filters"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-[18px]" />
          </button>
        </div>
      </div>

      <!-- Open Now toggle -->
      <div class="mb-5 px-4 py-3.5 bg-cream rounded-xl">
        <div class="flex justify-between items-center">
          <span class="text-[14px] font-medium text-gray-900">Open Right Now</span>
          <button
            type="button"
            role="switch"
            :aria-checked="modelValue.openNow"
            :class="[
              'relative w-[42px] h-6 rounded-full border-none transition-colors',
              modelValue.openNow ? 'bg-forest-700' : 'bg-gray-300',
            ]"
            @click="toggleOpenNow"
          >
            <span
              :class="[
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-[left]',
                modelValue.openNow ? 'left-[18px]' : 'left-0.5',
              ]"
            />
          </button>
        </div>
      </div>

      <!-- Day filter -->
      <div class="mb-5">
        <label class="block text-[13px] font-semibold text-gray-700 mb-2.5">Open Day</label>
        <div class="flex flex-col gap-1.5">
          <button
            type="button"
            :class="[
              'px-3 py-2 rounded-lg border-[1.5px] text-[13px] text-left transition-colors',
              !modelValue.day
                ? 'border-forest-700 bg-forest-50 text-forest-700 font-semibold'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
            ]"
            @click="setDay('')"
          >Any day</button>
          <button
            v-for="d in ALL_DAYS"
            :key="d"
            type="button"
            :class="[
              'px-3 py-2 rounded-lg border-[1.5px] text-[13px] text-left flex justify-between items-center transition-colors',
              modelValue.day === d
                ? 'border-forest-700 bg-forest-50 text-forest-700 font-semibold'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
            ]"
            @click="setDay(d)"
          >
            <span>{{ d }}</span>
            <UIcon
              v-if="modelValue.day === d"
              name="i-lucide-check"
              class="size-[14px] text-forest-700"
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
            :class="[
              'px-3 py-2 rounded-lg border-[1.5px] text-[13px] text-left transition-colors',
              !modelValue.foodType
                ? 'border-forest-700 bg-forest-50 text-forest-700 font-semibold'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
            ]"
            @click="setFoodType('')"
          >All types</button>
          <button
            v-for="f in foodTypes"
            :key="f"
            type="button"
            :class="[
              'px-3 py-2 rounded-lg border-[1.5px] text-[12px] text-left flex justify-between items-center gap-2 transition-colors',
              modelValue.foodType === f
                ? 'border-forest-700 bg-forest-50 text-forest-700 font-semibold'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
            ]"
            @click="setFoodType(f)"
          >
            <span>{{ f }}</span>
            <UIcon
              v-if="modelValue.foodType === f"
              name="i-lucide-check"
              class="size-[13px] text-forest-700 shrink-0"
            />
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
