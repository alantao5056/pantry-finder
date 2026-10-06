<script setup lang="ts">
// Centered logo + serif heading + muted message paragraph(s), with a slot for
// extra content (buttons, links). Shared by the blank search state and the
// Add-a-Pantry submission success state.
const props = defineProps<{
  title: string
  message?: string | string[]
}>()

const messages = computed(() =>
  Array.isArray(props.message) ? props.message : props.message ? [props.message] : [],
)
</script>

<template>
  <div class="flex flex-col items-center text-center">
    <img src="/logo.png" alt="PantryFinder logo" class="w-20 h-20 object-contain mb-4" />
    <h3 class="text-[22px] text-gray-900 mb-2">{{ title }}</h3>
    <p
      v-for="(m, i) in messages"
      :key="i"
      class="text-gray-500 text-[15px]"
      :class="{ 'mt-2': i > 0 }"
    >{{ m }}</p>
    <slot />
  </div>
</template>
