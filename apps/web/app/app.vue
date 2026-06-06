<script setup lang="ts">
// gtag.js measurement id comes from runtime config (NUXT_PUBLIC_GA_MEASUREMENT_ID) so
// it's resolved at runtime rather than baked at build time, and shares a single source
// with the API's GA_MEASUREMENT_ID. Scripts are only injected when an id is configured.
const gaId = useRuntimeConfig().public.gaMeasurementId

// Global title template: pages set a bare title and this appends the brand suffix.
// Function form (only valid via useHead, not the serializable nuxt.config head) so
// pages with no title fall back to plain "PantryFinder" instead of " - PantryFinder".
useHead({
  titleTemplate: (titleChunk?: string) =>
    titleChunk ? `${titleChunk} - PantryFinder` : 'PantryFinder',
  script: gaId
    ? [
        // Kept high priority so it lands early in <head> as Google recommends.
        { src: `https://www.googletagmanager.com/gtag/js?id=${gaId}`, async: true, tagPriority: 'high' },
        {
          innerHTML: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${gaId}');`,
          tagPriority: 'high',
        },
      ]
    : [],
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
