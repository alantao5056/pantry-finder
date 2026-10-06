<script setup lang="ts">
import type { GetCitiesResponseDto } from '@pantry-finder/shared'

// Nuxt reuses the page component when only params change (state → state
// navigation renders this same file), so setup would not re-run and the
// captured params would go stale. Keying by fullPath remounts per URL.
definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const api = useApi()

const rawState = String(route.params.state)
const stateSlug = rawState.toLowerCase()

// Upgrade mixed-case URLs (/TX) to the lowercase canonical with a real 301.
if (rawState !== stateSlug) {
  await navigateTo(statePath(stateSlug), { redirectCode: 301, replace: true })
}

// Dynamic [state] segment — anything that isn't a known state code
// (/food-pantries/foo, …) must hard-404 without an API round-trip.
// fatal: true so the error page also renders on client-side navigation.
const stateFullName = US_STATES[stateSlug]
if (!stateFullName) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const { data, error } = await useAsyncData(
  `state-cities-${stateSlug}`,
  () => api<GetCitiesResponseDto>(`/states/${stateSlug}/cities`),
)

if (error.value) {
  const status = (error.value as { statusCode?: number }).statusCode
  // Rate-limited by the API (rateLimitBrowse): surface it as a 429, not a 500.
  if (status === 429) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests', fatal: true })
  }
  // 404 from the API = no covered cities in this state.
  throw createError({
    statusCode: status === 404 ? 404 : 500,
    statusMessage: status === 404 ? 'No pantries found in this state' : 'Failed to load cities.',
    fatal: true,
  })
}

const cities = computed(() =>
  [...(data.value?.cities ?? [])].sort((a, b) => a.city.localeCompare(b.city)),
)
const totalPantries = computed(() =>
  cities.value.reduce((sum, c) => sum + c.pantryCount, 0),
)

usePageSeo({
  title: `Food Pantries in ${stateFullName}`,
  description: () =>
    `Find ${totalPantries.value.toLocaleString()} free food pantries across ${cities.value.length.toLocaleString()} cities in ${stateFullName}. Pick your city to see hours, available food, and contact info for each pantry.`,
  path: statePath(stateSlug),
})

const origin = useRequestURL().origin
useHead(() => ({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(buildBreadcrumbJsonLd([
        { name: 'Home', url: `${origin}/` },
        { name: 'Browse by City', url: `${origin}/food-pantries` },
        { name: stateFullName },
      ])),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(buildCollectionJsonLd({
        name: `Food Pantries in ${stateFullName}`,
        description: `Cities in ${stateFullName} with free food pantries.`,
        url: `${origin}${statePath(stateSlug)}`,
        items: cities.value.slice(0, 100).map(c => ({
          name: `Food Pantries in ${c.city}, ${c.state}`,
          url: `${origin}${cityPath(c.stateSlug, c.citySlug)}`,
        })),
        totalCount: cities.value.length,
      })),
    },
  ],
}))
</script>

<template>
  <div class="min-h-[calc(100dvh-4rem-1px)] bg-[var(--cream-light)] font-sans">
    <!-- Breadcrumb bar -->
    <div class="crumb-bar">
      <nav class="crumb-row" aria-label="Breadcrumb">
        <NuxtLink to="/" class="crumb-link">Home</NuxtLink>
        <span class="crumb-sep">›</span>
        <NuxtLink to="/food-pantries" class="crumb-link">Browse by City</NuxtLink>
        <span class="crumb-sep">›</span>
        <span class="crumb-current">{{ stateFullName }}</span>
      </nav>
    </div>

    <!-- Header -->
    <div class="bg-white border-b border-[var(--border-soft)] px-6">
      <div class="max-w-[1100px] mx-auto pt-9 pb-8">
        <h1 class="text-[clamp(24px,3.5vw,34px)] font-bold text-gray-900 leading-tight mb-2">
          Food Pantries in {{ stateFullName }}
        </h1>
        <p class="text-[15px] leading-[1.7] text-gray-600 max-w-[640px]">
          {{ totalPantries.toLocaleString() }} free food
          {{ totalPantries === 1 ? 'pantry' : 'pantries' }} across
          {{ cities.length.toLocaleString() }}
          {{ cities.length === 1 ? 'city' : 'cities' }} in {{ stateFullName }}.
          Pick your city below, or
          <NuxtLink to="/search" class="btn-link-accent">search by address</NuxtLink>
          to sort by distance.
        </p>
      </div>
    </div>

    <!-- City list -->
    <div class="max-w-[1100px] mx-auto px-6 pt-8 pb-16">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="c in cities"
          :key="c.citySlug"
          :to="cityPath(c.stateSlug, c.citySlug)"
          class="loc-tile"
        >
          <span>{{ c.city }}</span>
          <span class="loc-tile-count">
            {{ c.pantryCount.toLocaleString() }} {{ c.pantryCount === 1 ? 'pantry' : 'pantries' }}
          </span>
        </NuxtLink>
      </div>
    </div>

    <FooterSimple />
  </div>
</template>
