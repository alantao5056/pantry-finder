<!-- Logo + wordmark shared by the full Footer and FooterSimple (which passes `small`). -->
<script setup lang="ts">
defineProps<{ small?: boolean }>()
</script>

<template>
  <div class="flex items-center gap-2">
    <img
      src="/logo.png"
      alt="PantryFinder logo"
      class="object-contain"
      :class="small ? 'w-7 h-7' : 'w-9 h-9'"
    />
    <span
      class="font-semibold text-white"
      :class="small ? 'text-[16px]' : 'text-[18px]'"
    >PantryFinder</span>
  </div>
</template>
