<script setup lang="ts">
import type { GetStatesResponseDto } from '@pantry-finder/shared'

const api = useApi()

const { data, error } = await useAsyncData(
  'states',
  () => api<GetStatesResponseDto>('/states'),
)

if (error.value) {
  throw createError({ statusCode: 500, statusMessage: 'Failed to load states.', fatal: true })
}

// Alphabetical by full state name; unknown codes sort by abbreviation.
const states = computed(() =>
  [...(data.value?.states ?? [])]
    .map(s => ({ ...s, fullName: US_STATES[s.stateSlug] ?? s.state }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName)),
)

const totalPantries = computed(() => states.value.reduce((sum, s) => sum + s.pantryCount, 0))
const totalCities = computed(() => states.value.reduce((sum, s) => sum + s.cityCount, 0))

usePageSeo({
  title: 'Browse Food Pantries by State & City',
  description: () =>
    `Browse ${totalPantries.value.toLocaleString()} free food pantries across ${totalCities.value.toLocaleString()} cities in the United States. Pick your state to see every covered city, with hours and contact info for each pantry.`,
  path: '/food-pantries',
})

const origin = useRequestURL().origin
useHead(() => ({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(buildBreadcrumbJsonLd([
        { name: 'Home', url: `${origin}/` },
        { name: 'Browse by City' },
      ])),
    },
  ],
}))
</script>

<template>
  <div class="min-h-[calc(100dvh-4rem-1px)] bg-[#f5f7f5] font-sans">
    <!-- Breadcrumb bar -->
    <div class="crumb-bar">
      <nav class="crumb-row" aria-label="Breadcrumb">
        <NuxtLink to="/" class="crumb-link">Home</NuxtLink>
        <span class="crumb-sep">›</span>
        <span class="crumb-current">Browse by City</span>
      </nav>
    </div>

    <!-- Header -->
    <div class="bg-white border-b border-[var(--border-soft)] px-6">
      <div class="max-w-[1100px] mx-auto pt-9 pb-8">
        <h1 class="font-serif text-[clamp(24px,3.5vw,34px)] font-bold text-gray-900 leading-tight mb-2">
          Browse Food Pantries by State &amp; City
        </h1>
        <p class="text-[15px] leading-[1.7] text-gray-600 max-w-[640px]">
          {{ totalPantries.toLocaleString() }} free food pantries across
          {{ totalCities.toLocaleString() }} cities. Pick your state to find every
          covered city near you — or
          <NuxtLink to="/search" class="btn-link-accent">search by address</NuxtLink> instead.
        </p>
      </div>
    </div>

    <!-- State grid -->
    <div class="max-w-[1100px] mx-auto px-6 pt-8 pb-16">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="s in states"
          :key="s.stateSlug"
          :to="statePath(s.stateSlug)"
          class="loc-tile"
        >
          <span>{{ s.fullName }}</span>
          <span class="loc-tile-count">
            {{ s.pantryCount.toLocaleString() }} {{ s.pantryCount === 1 ? 'pantry' : 'pantries' }}
            · {{ s.cityCount.toLocaleString() }} {{ s.cityCount === 1 ? 'city' : 'cities' }}
          </span>
        </NuxtLink>
      </div>
    </div>

    <Footer />
  </div>
</template>
