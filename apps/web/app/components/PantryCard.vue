<script setup lang="ts">
import type { Pantry } from '@pantry-finder/types'

const props = defineProps<{
  pantry: Pantry
}>()

const emit = defineEmits<{
  select: [pantry: Pantry]
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

const { isLoggedIn } = useAuth()
const { show: showAuthModal } = useAuthModal()
const { isHearted, toggleHeart } = useHearts()

const hearted = computed(() => isHearted(props.pantry.id))
const hovered = ref(false)
const localCount = ref(props.pantry.heartCount ?? 0)

watch(hearted, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    localCount.value += newVal ? 1 : -1
  }
})

const onHeartClick = async () => {
  if (!isLoggedIn.value) {
    showAuthModal('login')
    return
  }
  await toggleHeart(props.pantry.id)
}

const onCardKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('select', props.pantry)
  }
}
</script>

<template>
  <div
    class="bg-white rounded-[20px] border-[1.5px] border-[var(--border-soft)] overflow-hidden transition-all duration-200 shadow-[0_2px_12px_rgba(28,69,50,0.06)] hover:shadow-[0_8px_32px_rgba(28,69,50,0.12)] hover:-translate-y-0.5 flex flex-col"
    role="button"
    tabindex="0"
    :aria-label="`View details for ${pantry.name}`"
    @click="emit('select', pantry)"
    @keydown="onCardKeydown"
  >
    <!-- Color accent bar -->
    <div class="h-1 shrink-0 bg-linear-to-r from-[var(--text-dark)] via-[var(--green-dark)] to-[var(--green-mid)]" />

    <div class="px-5 py-[18px] flex-1">
      <!-- Header: name + status -->
      <div class="flex justify-between items-start gap-2.5 mb-2">
        <h3 class="font-serif text-[18px] font-semibold text-[var(--text-dark)] leading-[1.3] flex-1">{{ pantry.name }}</h3>
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
        class="flex items-start text-[var(--text-mid)] text-[13px]"
        :class="pantry.distance !== undefined ? 'mb-1' : 'mb-2.5'"
      >
        <span class="shrink-0 w-[18px] h-[1.4em] flex items-center justify-center">
          <UIcon name="i-lucide-map-pin" class="size-3 text-[var(--green-mid)]" />
        </span>
        <span class="leading-[1.4]">{{ pantry.address }}</span>
      </div>

      <!-- Distance -->
      <div
        v-if="pantry.distance !== undefined"
        class="flex items-start text-[12px] text-[var(--text-mid)] font-semibold mb-2.5"
      >
        <span class="shrink-0 w-[18px] h-[1.4em] flex items-center justify-center">
          <UIcon name="i-lucide-navigation" class="size-3 text-[var(--green-mid)]" />
        </span>
        <span class="leading-[1.4]">{{ pantry.distance.toFixed(1) }} miles away</span>
      </div>

      <div
        v-if="days.length > 0 || visibleFoods.length > 0 || visibleServices.length > 0"
        class="h-px bg-[var(--border-soft)] mt-1.5 mb-3"
      />

      <!-- Hours summary -->
      <div
        v-if="days.length > 0"
        class="flex items-start gap-[5px] text-[12px] text-[var(--text-mid)] mb-3 leading-[1.5]"
      >
        <UIcon name="i-lucide-clock" class="size-3 shrink-0 mt-0.5 text-[var(--green-mid)]" />
        <div>
          <span v-for="(s, i) in days.slice(0, 2)" :key="i">
            <span v-if="i > 0"> • </span>{{ s.weekDay.slice(0, 3) }} {{ s.start }}–{{ s.end }}
          </span>
          <span v-if="days.length > 2" class="text-gray-400"> +{{ days.length - 2 }} more</span>
        </div>
      </div>

      <!-- Food chips -->
      <div v-if="visibleFoods.length > 0" class="mb-2.5">
        <div class="text-[10px] font-bold text-[var(--text-soft)] uppercase tracking-[0.6px] mb-1.5">
          Available Food
        </div>
        <div class="flex flex-wrap gap-[5px]">
          <span
            v-for="f in visibleFoods"
            :key="f"
            class="bg-[var(--green-light)] text-[var(--green-dark)] border border-[var(--green-soft)] text-[11px] font-medium px-2 py-[3px] rounded-full inline-flex items-center gap-1"
          >
            <span class="inline-flex justify-center w-4 shrink-0 text-[12px]">{{ foodEmoji(f) }}</span>{{ f }}
          </span>
          <span
            v-if="extraFoods > 0"
            class="bg-[var(--cream-light)] text-[var(--text-soft)] text-[11px] px-2 py-[3px] rounded-full"
          >+{{ extraFoods }} more</span>
        </div>
      </div>

      <!-- Services Offered -->
      <div v-if="visibleServices.length > 0">
        <div class="text-[10px] font-bold text-[var(--text-soft)] uppercase tracking-[0.6px] mb-1.5">
          Services Offered
        </div>
        <div class="flex flex-wrap gap-[5px]">
          <span
            v-for="(s, i) in visibleServices"
            :key="i"
            class="text-[11px] font-medium px-[9px] py-[3px] rounded-full border"
            :class="serviceColorClasses(s.category)"
          >{{ s.name }}</span>
          <span
            v-if="extraServices > 0"
            class="bg-[var(--cream-light)] text-[var(--text-soft)] text-[11px] px-2 py-[3px] rounded-full"
          >+{{ extraServices }} more</span>
        </div>
      </div>
    </div>

    <!-- Footer: love count -->
    <div class="px-5 pb-3.5 flex items-center gap-1.5 shrink-0">
      <button
        class="flex items-center gap-1.5 transition-transform active:scale-90"
        :aria-label="hearted ? 'Unheart pantry' : 'Heart pantry'"
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
        @click.stop="onHeartClick"
      >
        <UIcon
          :name="(hearted || hovered) ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
          class="size-3.5 transition-colors text-rose-600"
        />
        <span class="text-[13px] font-semibold transition-colors text-rose-600">{{ localCount }}</span>
      </button>
      <span class="text-[12px] text-gray-400">loves</span>
    </div>
  </div>
</template>
