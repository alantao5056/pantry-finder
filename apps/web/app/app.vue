<script setup lang="ts">
// Global title template: pages set a bare title and this appends the brand suffix.
// Function form (only valid via useHead, not the serializable nuxt.config head) so
// pages with no title fall back to plain "PantryFinder" instead of " — PantryFinder".
useHead({
  titleTemplate: (titleChunk?: string) =>
    titleChunk ? `${titleChunk} — PantryFinder` : 'PantryFinder',
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
