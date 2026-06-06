<script setup lang="ts">
import type { Pantry } from '@pantry-finder/shared'

defineProps<{
  pantries: Pantry[]
  selectedId?: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <div class="flex flex-col gap-2.5 p-4">
    <div class="text-[12px] font-bold text-[var(--text-soft)] uppercase tracking-[0.06em] py-1">
      {{ pantries.length }} {{ pantries.length === 1 ? 'location' : 'locations' }}
    </div>
    <button
      v-for="p in pantries"
      :key="p.id"
      type="button"
      class="map-list-card"
      :class="{ 'is-selected': p.id === selectedId }"
      @click="emit('select', p.id)"
    >
      <div class="flex justify-between items-start gap-2 mb-1.5">
        <span
          class="font-serif font-semibold text-[14px] leading-[1.3]"
          :class="p.id === selectedId ? 'text-[#ea580c]' : 'text-[var(--text-dark)]'"
        >{{ p.name }}</span>
        <span
          v-if="isOpenToday(p.schedules)"
          class="shrink-0 bg-green-100 text-[var(--green-dark)] text-[10px] font-bold px-[7px] py-0.5 rounded-full"
        >OPEN</span>
      </div>
      <div class="text-[12px] text-[var(--text-soft)] mb-1">{{ p.address }}</div>
      <div
        v-if="p.distance !== undefined"
        class="text-[12px] text-[var(--green-mid)] font-semibold flex items-center gap-1"
      >
        <UIcon name="i-lucide-navigation" class="size-3" />
        {{ p.distance.toFixed(1) }} mi
      </div>
    </button>
  </div>
</template>
