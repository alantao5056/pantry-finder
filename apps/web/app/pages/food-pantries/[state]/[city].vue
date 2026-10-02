<script setup lang="ts">
import type { Pantry, GetCityPantriesResponseDto, GetCitiesResponseDto } from '@pantry-finder/shared'

// Nuxt reuses the page component when only params/query change (e.g. the
// "More Cities" chips navigate city → city within this same file), so setup —
// and everything below that captures the params — would not re-run. Keying by
// fullPath remounts the page per URL instead.
definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const api = useApi()

const rawState = String(route.params.state)
const rawCity = String(route.params.city)
const stateSlug = rawState.toLowerCase()
const citySlug = rawCity.toLowerCase()

// Upgrade mixed-case URLs (/TX/Austin) to the lowercase canonical with a real 301.
if (rawState !== stateSlug || rawCity !== citySlug) {
  await navigateTo(
    { path: cityPath(stateSlug, citySlug), query: route.query },
    { redirectCode: 301, replace: true },
  )
}

// Dynamic [state] segment: unknown state codes hard-404 before any API call.
// fatal: true so the error page also renders on client-side navigation.
const stateFullName = US_STATES[stateSlug]
if (!stateFullName) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

// ?page must be a positive integer; anything else 404s rather than soft-200ing
// a duplicate of page 1. Out-of-range pages 404 via the API below.
const page = route.query.page === undefined ? 1 : Number(route.query.page)
if (!Number.isInteger(page) || page < 1) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const { data, error } = await useAsyncData(
  `city-${stateSlug}-${citySlug}-p${page}`,
  () => api<GetCityPantriesResponseDto>(`/states/${stateSlug}/cities/${citySlug}`, {
    query: { page },
  }),
)

if (error.value) {
  const status = (error.value as { statusCode?: number }).statusCode
  // Rate-limited by the API (rateLimitBrowse): surface it as a 429, not a 500.
  if (status === 429) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests', fatal: true })
  }
  throw createError({
    statusCode: status === 404 ? 404 : 500,
    statusMessage: status === 404 ? 'City not found' : 'Failed to load pantries.',
    fatal: true,
  })
}

// Other covered cities in the same state, by pantry count, for the
// "More cities" section (current city excluded).
const { data: stateCities } = await useAsyncData(
  `state-cities-top-${stateSlug}`,
  () => api<GetCitiesResponseDto>(`/states/${stateSlug}/cities`, { query: { limit: 11 } }),
)
const moreCities = computed(() =>
  (stateCities.value?.cities ?? []).filter(c => c.citySlug !== citySlug).slice(0, 10),
)

const cityName = computed(() => data.value?.city ?? '')
const stateAbbr = computed(() => data.value?.state ?? stateSlug.toUpperCase())
const pantries = computed(() => data.value?.pantries ?? [])
const pantryCount = computed(() => data.value?.pantryCount ?? 0)
const totalPages = computed(() => data.value?.totalPages ?? 1)
const foodTypes = computed(() => getAllFoodTypes(pantries.value))
const openTodayCount = computed(
  () => pantries.value.filter(p => isOpenToday(p.schedules)).length,
)

// --- SEO ------------------------------------------------------------------

const basePath = cityPath(stateSlug, citySlug)
// Page 1's canonical is the clean URL; deeper pages self-canonicalize so
// every indexed URL serves distinct content.
const canonicalPath = page > 1 ? `${basePath}?page=${page}` : basePath

usePageSeo({
  title: () => {
    const suffix = page > 1 ? ` — Page ${page}` : ''
    return `Food Pantries in ${cityName.value}, ${stateAbbr.value}${suffix}`
  },
  description: () => {
    const names = pantries.value.slice(0, 2).map(p => p.name).join(', ')
    const lead = `Find ${pantryCount.value} free food ${pantryCount.value === 1 ? 'pantry' : 'pantries'} in ${cityName.value}, ${stateFullName}.`
    const detail = names
      ? ` See hours, available food, and contact info for ${names}${pantryCount.value > 2 ? ', and more' : ''}.`
      : ' See hours, available food, and contact info for each pantry.'
    return (lead + detail).slice(0, 160)
  },
  path: canonicalPath,
})

const origin = useRequestURL().origin
useHead(() => {
  if (!data.value) return {}
  return {
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify(buildBreadcrumbJsonLd([
          { name: 'Home', url: `${origin}/` },
          { name: 'Browse by City', url: `${origin}/food-pantries` },
          { name: stateFullName, url: `${origin}${statePath(stateSlug)}` },
          { name: `${cityName.value}, ${stateAbbr.value}` },
        ])),
      },
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify(buildCollectionJsonLd({
          name: `Food Pantries in ${cityName.value}, ${stateAbbr.value}`,
          description: `Free food pantries in ${cityName.value}, ${stateFullName}.`,
          url: `${origin}${canonicalPath}`,
          items: pantries.value.map(p => ({
            name: p.name,
            url: `${origin}${pantryPath(p)}`,
          })),
          totalCount: pantryCount.value,
          startPosition: (data.value.page - 1) * data.value.pageSize + 1,
        })),
      },
    ],
  }
})

// --- Pagination -----------------------------------------------------------

// Real hrefs (not buttons) so crawlers can follow deep pages. Page 1 links to
// the clean URL to avoid a ?page=1 duplicate.
const pageTarget = (p: number) =>
  p === 1 ? basePath : { path: basePath, query: { page: String(p) } }

// Numbered window: 1 … (current±1) … last, deduped and in order.
const pageNumbers = computed(() => {
  const total = totalPages.value
  const current = page
  const wanted = new Set([1, current - 1, current, current + 1, total])
  const pages = [...wanted].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (const [i, p] of pages.entries()) {
    if (i > 0 && p - pages[i - 1]! > 1) out.push('…')
    out.push(p)
  }
  return out
})

// The map popup's "View Details" opens in a new tab so the map view (zoom,
// position) is preserved. Client-only: the button only exists after hydration.
const onMapSelect = (pantry: Pantry) => {
  window.open(pantryPath(pantry), '_blank', 'noopener')
}

// List ⇄ map view, mirroring search.vue. SSR always renders 'list' so the
// crawlable grid + pagination stay in the HTML; map is a client-side toggle.
const viewMode = ref<'list' | 'map'>('list')
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
        <NuxtLink :to="statePath(stateSlug)" class="crumb-link">{{ stateFullName }}</NuxtLink>
        <span class="crumb-sep">›</span>
        <span class="crumb-current">{{ cityName }}, {{ stateAbbr }}</span>
      </nav>
    </div>

    <!-- Header -->
    <div class="bg-white border-b border-[var(--border-soft)] px-6">
      <div class="max-w-[1100px] mx-auto pt-5 pb-4">
        <h1 class="font-serif text-[clamp(24px,3.5vw,34px)] font-bold text-gray-900 leading-tight mb-2">
          Food Pantries in {{ cityName }}, {{ stateAbbr }}
        </h1>
        <p class="text-[15px] leading-[1.7] text-gray-600 max-w-[680px]">
          {{ pantryCount.toLocaleString() }} free food
          {{ pantryCount === 1 ? 'pantry' : 'pantries' }} in {{ cityName }},
          {{ stateFullName }}<template v-if="totalPages === 1 && openTodayCount > 0">
            — {{ openTodayCount }} open today</template>.
          <template v-if="foodTypes.length > 0">
            Available food includes {{ foodTypes.slice(0, 4).join(', ').toLowerCase() }}.
          </template>
          Know your address? <NuxtLink to="/search" class="btn-link-accent">Search by distance</NuxtLink> instead.
        </p>
      </div>
    </div>

    <!-- List / Map view toggle bar -->
    <div class="bg-white border-b border-[var(--border-soft)] px-6 py-3.5">
      <div class="max-w-[1100px] mx-auto flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="view-toggle-btn"
            :class="{ 'is-active': viewMode === 'list' }"
            @click="viewMode = 'list'"
          >
            <UIcon name="i-lucide-list" class="size-[14px]" />
            List
          </button>
          <button
            type="button"
            class="view-toggle-btn"
            :class="{ 'is-active': viewMode === 'map' }"
            @click="viewMode = 'map'"
          >
            <UIcon name="i-lucide-map" class="size-[14px]" />
            Map
          </button>
        </div>

        <span class="text-[14px] text-gray-500">
          <span class="font-bold text-gray-900">{{ pantryCount.toLocaleString() }}</span>
          {{ pantryCount === 1 ? 'pantry' : 'pantries' }} in
          <span class="font-semibold text-forest-700">{{ cityName }}, {{ stateAbbr }}</span>
          <template v-if="totalPages > 1"> — page {{ page }} of {{ totalPages }}</template>
        </span>
      </div>
    </div>

    <!-- List view -->
    <div v-if="viewMode === 'list'" class="px-6">
      <div class="max-w-[1100px] mx-auto pt-5 pb-16">
        <!-- Pantry cards -->
        <div
          class="grid gap-[18px]"
          style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));"
        >
          <NuxtLink
            v-for="p in pantries"
            :key="p.id"
            :to="pantryPath(p)"
            class="block no-underline"
            :aria-label="`View details for ${p.name}`"
          >
            <PantryCard :pantry="p" class="h-full" />
          </NuxtLink>
        </div>

        <!-- Pagination -->
        <nav
          v-if="totalPages > 1"
          class="flex items-center justify-center gap-2 mt-10 flex-wrap"
          aria-label="Pagination"
        >
          <NuxtLink
            v-if="page > 1"
            :to="pageTarget(page - 1)"
            class="page-link"
            rel="prev"
          >‹ Prev</NuxtLink>
          <template v-for="(p, i) in pageNumbers" :key="i">
            <span v-if="p === '…'" class="text-gray-400 px-1">…</span>
            <NuxtLink
              v-else
              :to="pageTarget(p)"
              class="page-link"
              :class="p === page ? 'is-active' : ''"
              :aria-current="p === page ? 'page' : undefined"
            >{{ p }}</NuxtLink>
          </template>
          <NuxtLink
            v-if="page < totalPages"
            :to="pageTarget(page + 1)"
            class="page-link"
            rel="next"
          >Next ›</NuxtLink>
        </nav>

        <!-- More cities in this state -->
        <section v-if="moreCities.length > 0" class="mt-12">
          <h2 class="font-serif text-[20px] font-bold text-gray-900 mb-4">
            More Cities in {{ stateFullName }}
          </h2>
          <div class="flex flex-wrap gap-2">
            <NuxtLink
              v-for="c in moreCities"
              :key="c.citySlug"
              :to="cityPath(c.stateSlug, c.citySlug)"
              class="btn-pill no-underline"
            >{{ c.city }} ({{ c.pantryCount }})</NuxtLink>
            <NuxtLink :to="statePath(stateSlug)" class="btn-pill no-underline font-semibold">
              All {{ stateFullName }} cities →
            </NuxtLink>
          </div>
        </section>
      </div>
    </div>

    <!-- Map view -->
    <div v-else class="px-6">
      <div class="max-w-[1100px] mx-auto py-5">
        <div class="detail-card overflow-hidden">
          <ClientOnly>
            <PantryMap
              :pantries="pantries"
              class="w-full h-[70dvh] min-h-[400px] block"
              @select="onMapSelect"
            />
            <template #fallback>
              <div class="w-full h-[70dvh] min-h-[400px] bg-[var(--green-light)]" />
            </template>
          </ClientOnly>
        </div>
      </div>
    </div>

    <Footer />
  </div>
</template>
