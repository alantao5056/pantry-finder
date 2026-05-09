<script setup lang="ts">
import type { Pantry } from '@pantry-finder/types'

const props = defineProps<{
  pantry: Pantry
}>()

const openNow = computed(() => isOpenNow(props.pantry.schedules))
const openToday = computed(() => isOpenToday(props.pantry.schedules))
const days = computed(() => getScheduleDays(props.pantry.schedules))
const allFoods = computed(() => getUniqueFoods(props.pantry.services))
const visibleFoods = computed(() => allFoods.value.slice(0, 4))
const extraFoods = computed(() => Math.max(0, allFoods.value.length - 4))
const hasSchedules = computed(() => props.pantry.schedules.length > 0)

const allServices = computed(() => getUniqueServices(props.pantry.services))
const visibleServices = computed(() => allServices.value.slice(0, 3))
const extraServices = computed(() => Math.max(0, allServices.value.length - 3))

const loveCount = 1
</script>

<template>
  <div
    class="bg-white rounded-[18px] border border-cream-muted overflow-hidden transition-all duration-200 shadow-[0_2px_12px_rgba(28,69,50,0.06)] hover:shadow-[0_8px_32px_rgba(28,69,50,0.12)] hover:-translate-y-0.5 flex flex-col"
  >
    <!-- Color accent bar -->
    <div class="h-1 shrink-0" style="background: linear-gradient(90deg, #1C4532, #52B788)" />

    <div class="px-[22px] pt-5 pb-4 flex-1">
      <!-- Header: name + status -->
      <div class="flex justify-between items-start gap-3 mb-2.5">
        <h3 class="font-serif text-[18px] text-gray-900 leading-snug flex-1">{{ pantry.name }}</h3>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <span
            v-if="openNow"
            class="bg-green-100 text-green-900 text-[11px] font-bold px-2.5 py-0.5 rounded-full tracking-wide"
          >OPEN NOW</span>
          <span
            v-else-if="openToday"
            class="bg-yellow-100 text-yellow-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
          >OPEN TODAY</span>
          <span
            v-else-if="hasSchedules"
            class="bg-gray-100 text-gray-500 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
          >CLOSED TODAY</span>
        </div>
      </div>

      <!-- Address -->
      <div
        class="flex items-start text-gray-500 text-[13px]"
        :class="pantry.distance !== undefined ? 'mb-1' : 'mb-3'"
      >
        <span class="shrink-0 w-[18px] flex justify-center mt-0.5">
          <UIcon name="i-lucide-map-pin" class="size-3" />
        </span>
        <span class="leading-snug">{{ pantry.address }}</span>
      </div>

      <!-- Distance -->
      <div
        v-if="pantry.distance !== undefined"
        class="flex items-center text-[12px] text-forest-400 font-semibold mb-2.5"
      >
        <span class="shrink-0 w-[18px] flex justify-center leading-none">📍</span>
        <span>{{ pantry.distance.toFixed(1) }} miles away</span>
      </div>

      <!-- Hours summary -->
      <div
        v-if="days.length > 0"
        class="flex items-start gap-1.5 text-[13px] text-gray-600 mb-3"
      >
        <UIcon name="i-lucide-clock" class="size-3.5 shrink-0 mt-0.5" />
        <div>
          <span v-for="(s, i) in days.slice(0, 2)" :key="i">
            <span v-if="i > 0"> • </span>{{ s.weekDay.slice(0, 3) }} {{ s.start }}–{{ s.end }}
          </span>
          <span v-if="days.length > 2" class="text-gray-400"> +{{ days.length - 2 }} more</span>
        </div>
      </div>

      <!-- Phone -->
      <div
        v-if="pantry.phone"
        class="flex items-center gap-1.5 text-[13px] text-gray-600 mb-3"
      >
        <UIcon name="i-lucide-phone" class="size-3.5" />
        {{ pantry.phone }}
      </div>

      <!-- Food chips -->
      <div v-if="visibleFoods.length > 0" class="mb-2.5">
        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Available Food
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="f in visibleFoods"
            :key="f"
            class="bg-forest-50 text-forest-700 text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1"
          >
            <span class="inline-flex justify-center w-4 shrink-0 text-[12px]">{{ foodEmoji(f) }}</span>{{ f }}
          </span>
          <span
            v-if="extraFoods > 0"
            class="bg-gray-100 text-gray-500 text-[11px] px-2 py-0.5 rounded-full"
          >+{{ extraFoods }} more</span>
        </div>
      </div>

      <!-- Services Offered -->
      <div v-if="visibleServices.length > 0">
        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Services Offered
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="(s, i) in visibleServices"
            :key="i"
            class="text-[11px] font-medium px-2 py-0.5 rounded-full border"
            :class="serviceColorClasses(s.category)"
          >{{ s.name }}</span>
          <span
            v-if="extraServices > 0"
            class="bg-gray-100 text-gray-500 text-[11px] px-2 py-0.5 rounded-full"
          >+{{ extraServices }} more</span>
        </div>
      </div>
    </div>

    <!-- Footer: love count -->
    <div class="px-[22px] pb-3.5 flex items-center gap-1.5 shrink-0">
      <UIcon name="i-heroicons-heart-solid" class="size-3.5 text-rose-600" />
      <span class="text-[13px] font-semibold text-rose-600">{{ loveCount }}</span>
      <span class="text-[12px] text-gray-400">loves</span>
    </div>
  </div>
</template>
