<script setup lang="ts">
import type { Pantry } from '@pantry-finder/types'
import {
  countActiveFilters,
  getAllFoodTypes,
  pantryMatchesFilters,
  type PantryFilters,
} from '~/utils/pantry'

interface PantriesResponse {
  pantries: Pantry[]
  pagination: {
    page: number
    pageSize: number
    hasNextPage: boolean
    nextPage?: number
  }
}

interface ApiError {
  data?: { error?: string }
  statusCode?: number
}

// Auto-load more pages while filtered results stay below this threshold.
const MIN_FILTERED_RESULTS = 10

const route = useRoute()
const router = useRouter()
const api = useApi()

const initialLocation = String(route.query.location ?? '')
const initialRadius = String(route.query.radius ?? '5')

const loadedPantries = ref<Pantry[]>([])
const currentPage = ref(0)
const hasMorePages = ref(false)
const pending = ref(false)
const error = ref<unknown>(null)
const locationNotFound = ref(false)

// Each runSearch call gets a fresh token. Older in-flight requests check
// against the latest token and abort their writes if they're stale.
let searchToken = 0

const parseList = (v: unknown): string[] => {
  if (Array.isArray(v)) {
    return v.flatMap(x => (typeof x === 'string' ? x.split(',') : [])).filter(Boolean)
  }
  if (typeof v === 'string' && v) return v.split(',').filter(Boolean)
  return []
}

const filters = computed<PantryFilters>(() => ({
  day: parseList(route.query.day),
  foodType: parseList(route.query.foodType),
  openNow: route.query.openNow === 'true',
}))

const onUpdateFilters = (next: PantryFilters) => {
  const q: Record<string, string> = {}
  for (const [k, v] of Object.entries(route.query)) {
    if (typeof v === 'string') q[k] = v
  }
  if (next.day.length) q.day = next.day.join(',')
  else delete q.day
  if (next.foodType.length) q.foodType = next.foodType.join(',')
  else delete q.foodType
  if (next.openNow) q.openNow = 'true'
  else delete q.openNow
  router.replace({ path: '/search', query: q })
}

const filteredPantries = computed(() =>
  loadedPantries.value.filter(p => pantryMatchesFilters(p, filters.value)),
)
const activeFilterCount = computed(() => countActiveFilters(filters.value))

// Derive available food types from loaded pages so the filter list always
// reflects real data. Keep the active selection visible even if no loaded
// pantry currently includes it (so the user can still unselect it).
const allFoodTypes = computed(() => {
  const types = getAllFoodTypes(loadedPantries.value)
  const missing = filters.value.foodType.filter(f => !types.includes(f))
  if (missing.length) return [...types, ...missing].sort()
  return types
})

const showFilters = ref(true)

const radiusValue = computed(() => String(route.query.radius ?? initialRadius))

const fetchPage = async (
  page: number,
  token: number,
): Promise<PantriesResponse | null> => {
  const location = String(route.query.location ?? '')
  if (!location) return null
  try {
    const res = await api<PantriesResponse>('/pantries', {
      query: {
        location,
        radius: String(route.query.radius ?? '5'),
        page: String(page),
      },
    })
    if (token !== searchToken) return null
    return res
  } catch (e) {
    if (token !== searchToken) return null
    const err = e as ApiError
    if (err.statusCode === 404) locationNotFound.value = true
    else error.value = e
    return null
  }
}

const runSearch = async () => {
  const token = ++searchToken
  loadedPantries.value = []
  currentPage.value = 0
  hasMorePages.value = false
  error.value = null
  locationNotFound.value = false

  if (!route.query.location) return

  pending.value = true
  const first = await fetchPage(1, token)
  if (token !== searchToken) return

  if (first) {
    loadedPantries.value = first.pantries
    currentPage.value = first.pagination.page
    hasMorePages.value = first.pagination.hasNextPage

    while (
      token === searchToken
      && hasMorePages.value
      && filteredPantries.value.length < MIN_FILTERED_RESULTS
    ) {
      const next = await fetchPage(currentPage.value + 1, token)
      if (token !== searchToken) return
      if (!next) break
      loadedPantries.value = [...loadedPantries.value, ...next.pantries]
      currentPage.value = next.pagination.page
      hasMorePages.value = next.pagination.hasNextPage
    }
  }
  if (token === searchToken) pending.value = false
}

onMounted(() => {
  // Collapse the filters sidebar by default on mobile (drawer would otherwise
  // cover the content on initial load).
  if (window.matchMedia('(max-width: 767px)').matches) {
    showFilters.value = false
  }
  runSearch()
})
watch(
  [() => route.query.location, () => route.query.radius],
  () => { runSearch() },
)

const onSearch = (location: string, radius: string) => {
  router.replace({ path: '/search', query: { ...route.query, location, radius } })
}

const clearFilters = () => {
  onUpdateFilters({ day: [], foodType: [], openNow: false })
}

const refresh = () => runSearch()

const isLocationNotFound = computed(() => locationNotFound.value)
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col bg-cream font-sans overflow-hidden">
    <!-- Top search bar -->
    <div class="bg-white border-b border-cream-dark px-6 py-3 flex-shrink-0">
      <div class="max-w-[1120px] mx-auto">
        <SearchBar
          :initial-address="initialLocation"
          :initial-radius="initialRadius"
          @submit="onSearch"
        />
      </div>
    </div>

    <!-- Main row: full-width sidebar + content, each scrolling on its own -->
    <div class="flex-1 flex relative min-h-0 overflow-hidden">
      <ClientOnly>
        <!-- Mobile backdrop -->
        <div
          v-if="route.query.location && showFilters"
          class="md:hidden absolute inset-0 bg-black/40 z-30"
          aria-hidden="true"
          @click="showFilters = false"
        />
        <FiltersSidebar
          v-if="route.query.location"
          :model-value="filters"
          :open="showFilters"
          :food-types="allFoodTypes"
          @update:model-value="onUpdateFilters"
          @close="showFilters = false"
        />
      </ClientOnly>

      <!-- Content column -->
      <div class="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <!-- Results header (only spans content area width, per design) -->
        <ClientOnly>
          <div
            v-if="route.query.location"
            class="bg-white border-b border-cream-dark px-6 py-3.5 flex items-center gap-3 flex-wrap flex-shrink-0"
          >
            <button
              type="button"
              class="btn-secondary btn--sm gap-1.5"
              @click="showFilters = !showFilters"
            >
              <UIcon name="i-lucide-sliders-horizontal" class="size-[14px]" />
              {{ showFilters ? 'Hide' : 'Show' }} Filters
              <span
                v-if="activeFilterCount > 0"
                class="ml-1 bg-forest-700 text-white rounded-full text-[11px] font-semibold px-1.5"
              >{{ activeFilterCount }}</span>
            </button>
            <span class="text-[14px] text-gray-500">
              <template v-if="pending && loadedPantries.length === 0">
                Searching for pantries…
              </template>
              <template v-else-if="error && loadedPantries.length === 0">
                <span class="text-red-700">Could not load pantries.</span>
              </template>
              <template v-else>
                <span class="font-bold text-gray-900">{{ filteredPantries.length }}</span>
                {{ filteredPantries.length === 1 ? 'pantry' : 'pantries' }} found within
                <span class="font-semibold text-forest-700">{{ radiusValue }} miles</span>
              </template>
            </span>
          </div>
          <template #fallback>
            <div
              v-if="route.query.location"
              class="bg-white border-b border-cream-dark px-6 py-3.5 text-[14px] text-gray-500 flex-shrink-0"
            >
              Searching for pantries…
            </div>
          </template>
        </ClientOnly>

        <!-- Scrollable list area -->
        <div class="flex-1 overflow-y-auto">
          <!-- No location yet -->
          <div
            v-if="!route.query.location"
            class="text-center px-6 h-full flex flex-col items-center justify-center"
          >
            <div class="w-16 h-16 bg-forest-50 rounded-full flex items-center justify-center mb-4">
              <UIcon name="i-lucide-search" class="size-7 text-forest-400" />
            </div>
            <h3 class="font-serif text-[22px] text-gray-900 mb-2">Enter an address to begin</h3>
            <p class="text-gray-500 text-[15px]">Type a city, address, or ZIP code above to find pantries near you.</p>
          </div>

          <ClientOnly v-else>
            <!-- Loading -->
            <div
              v-if="pending && loadedPantries.length === 0"
              class="flex items-center justify-center py-20 text-gray-500 gap-3"
            >
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-forest-500" />
              <span class="text-[15px]">Loading pantries…</span>
            </div>

            <!-- Error: location not geocoded -->
            <div
              v-else-if="isLocationNotFound"
              class="text-center py-16 px-6"
            >
              <div class="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <UIcon name="i-lucide-map-pin-off" class="size-7 text-yellow-500" />
              </div>
              <h3 class="font-serif text-[22px] text-gray-900 mb-2">We couldn't find that address</h3>
              <p class="text-gray-500 text-[15px]">Try entering a city, ZIP code, or a more complete street address.</p>
            </div>

            <!-- Error: other -->
            <div
              v-else-if="error && loadedPantries.length === 0"
              class="text-center py-16 px-6"
            >
              <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <UIcon name="i-lucide-alert-circle" class="size-7 text-red-500" />
              </div>
              <h3 class="font-serif text-[22px] text-gray-900 mb-2">Something went wrong</h3>
              <p class="text-gray-500 text-[15px] mb-5">We hit an error fetching pantries. Please try again.</p>
              <button
                class="bg-forest-700 hover:bg-forest-800 text-white rounded-lg px-5 py-2 text-[14px] font-medium transition-colors"
                @click="refresh()"
              >Retry</button>
            </div>

            <!-- Empty: no pantries within radius -->
            <div
              v-else-if="loadedPantries.length === 0"
              class="text-center py-16 px-6"
            >
              <div class="w-16 h-16 bg-forest-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <UIcon name="i-lucide-search" class="size-7 text-forest-400" />
              </div>
              <h3 class="font-serif text-[22px] text-gray-900 mb-2">No pantries found</h3>
              <p class="text-gray-500 text-[15px]">Try increasing the search radius or entering a different location.</p>
            </div>

            <!-- Empty: filters too restrictive -->
            <div
              v-else-if="filteredPantries.length === 0"
              class="text-center py-20 px-6"
            >
              <div class="w-[72px] h-[72px] bg-[#f0faf4] border-2 border-[#b8e8cc] rounded-full flex items-center justify-center mx-auto mb-5">
                <span class="text-[32px] leading-none">🌿</span>
              </div>
              <h3 class="font-serif text-[24px] font-semibold text-[var(--text-dark)] mb-2.5">No pantries match your filters</h3>
              <p class="text-[var(--text-soft)] text-[15px] leading-relaxed max-w-[360px] mx-auto mb-6">
                Try adjusting your filters or increasing the search radius.
              </p>
              <button
                type="button"
                class="btn-primary"
                @click="clearFilters"
              >Clear Filters</button>
            </div>

            <!-- Results grid -->
            <div
              v-else
              class="px-6 py-5"
            >
              <div
                class="grid gap-[18px]"
                style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));"
              >
                <PantryCard
                  v-for="p in filteredPantries"
                  :key="p.id"
                  :pantry="p"
                />
              </div>
              <div
                v-if="pending"
                class="flex items-center justify-center py-6 text-gray-500 gap-2 text-[13px]"
              >
                <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-forest-500" />
                <span>Loading more pantries…</span>
              </div>
            </div>

            <template #fallback>
              <div class="flex items-center justify-center py-20 text-gray-500 gap-3">
                <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-forest-500" />
                <span class="text-[15px]">Loading pantries…</span>
              </div>
            </template>
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
