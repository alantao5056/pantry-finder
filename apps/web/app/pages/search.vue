<script setup lang="ts">
import type { Pantry } from '@pantry-finder/shared'
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
  data?: {
    error?: string
    message?: string
    requiresAuth?: boolean
    retryAfter?: number
  }
  statusCode?: number
}

interface RateLimitState {
  message: string
  requiresAuth: boolean
  retryAfter: number
}

// Auto-load more pages while filtered results stay below this threshold.
const MIN_FILTERED_RESULTS = 10

const route = useRoute()
const router = useRouter()
const api = useApi()
const { isLoggedIn } = useAuth()
const { show: showAuthModal } = useAuthModal()

usePageSeo({
  title: 'Search Food Pantries',
  description:
    'Search free food pantries near your address. Filter by food type and distance, then view hours, available food, and contact details for each location.',
  path: '/search',
})

const initialLocation = String(route.query.location ?? '')
const initialRadius = String(route.query.radius ?? '5')

const loadedPantries = ref<Pantry[]>([])
const currentPage = ref(0)
const hasMorePages = ref(false)
const pending = ref(false)
const error = ref<unknown>(null)
const locationNotFound = ref(false)
const rateLimited = ref<RateLimitState | null>(null)
// Set when the API refuses anonymous search (runtime switch, 401 auth_required).
const authRequired = ref<string | null>(null)
const lastSearchSucceeded = ref(false)
const selectedPantry = ref<Pantry | null>(null)

// List ⇄ map view. `mapSelectedId` is the pin highlighted on the map (distinct
// from `selectedPantry`, which drives the detail popup modal). `?view=map` (the
// footer's Map View link) opens straight into the map.
const viewMode = ref<'list' | 'map'>(route.query.view === 'map' ? 'map' : 'list')
const mapSelectedId = ref<string | null>(null)

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
    if (err.statusCode === 404) {
      locationNotFound.value = true
    } else if (err.statusCode === 401) {
      authRequired.value = err.data?.message ?? 'Please sign in to search for pantries.'
    } else if (err.statusCode === 429) {
      rateLimited.value = {
        message: err.data?.message ?? 'You have reached the search limit. Please try again later.',
        requiresAuth: !!err.data?.requiresAuth,
        retryAfter: err.data?.retryAfter ?? 0,
      }
    } else {
      error.value = e
    }
    return null
  }
}

const runSearch = async () => {
  const token = ++searchToken
  loadedPantries.value = []
  selectedPantry.value = null
  mapSelectedId.value = null
  currentPage.value = 0
  hasMorePages.value = false
  error.value = null
  locationNotFound.value = false
  rateLimited.value = null
  authRequired.value = null
  lastSearchSucceeded.value = false

  if (!route.query.location) return

  pending.value = true
  const first = await fetchPage(1, token)
  if (token !== searchToken) return

  if (first) {
    loadedPantries.value = first.pantries
    currentPage.value = first.pagination.page
    hasMorePages.value = first.pagination.hasNextPage
    lastSearchSucceeded.value = true

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
// Re-run a search that was refused for being anonymous once the user signs in.
watch(isLoggedIn, (loggedIn) => {
  if (loggedIn && authRequired.value) runSearch()
})

const onSearch = (location: string, radius: string) => {
  const sameLocation = location === String(route.query.location ?? '')
  const sameRadius = radius === String(route.query.radius ?? '5')
  if (sameLocation && sameRadius) {
    // URL won't change, so the watcher won't fire. Only re-run if the last
    // attempt failed (e.g. rate-limited before sign-in) — successful results
    // should not be re-fetched on a redundant button click.
    if (!lastSearchSucceeded.value) runSearch()
    return
  }
  router.replace({ path: '/search', query: { ...route.query, location, radius } })
}

const clearFilters = () => {
  onUpdateFilters({ day: [], foodType: [], openNow: false })
}

const refresh = () => runSearch()

const isLocationNotFound = computed(() => locationNotFound.value)

// The results grid (and thus the map) only shows once a search produced at least
// one matching pantry and isn't in an error / rate-limit / not-found state.
const resultsReady = computed(() =>
  !locationNotFound.value
  && !rateLimited.value
  && !authRequired.value
  && !(error.value && loadedPantries.value.length === 0)
  && filteredPantries.value.length > 0,
)
// When true, the content area becomes a non-scrolling flex row so the map can
// fill its height and the side list scrolls on its own.
const mapActive = computed(() => viewMode.value === 'map' && resultsReady.value)
</script>

<template>
  <div class="h-[calc(100dvh-4rem-1px)] flex flex-col bg-[var(--cream-light)] font-sans overflow-hidden">
    <!-- Top search bar -->
    <div class="bg-white border-b border-[var(--border-soft)] px-6 py-3 flex-shrink-0">
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
            class="bg-white border-b border-[var(--border-soft)] px-6 py-3.5 flex items-center gap-3 flex-wrap flex-shrink-0"
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

            <!-- List / Map view toggle -->
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
              <template v-if="pending && loadedPantries.length === 0">
                Searching for pantries…
              </template>
              <template v-else-if="authRequired && loadedPantries.length === 0">
                <span class="text-red-700">Sign in to search.</span>
              </template>
              <template v-else-if="rateLimited && loadedPantries.length === 0">
                <span class="text-red-700">Search limit reached.</span>
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
              class="bg-white border-b border-[var(--border-soft)] px-6 py-3.5 text-[14px] text-gray-500 flex-shrink-0"
            >
              Searching for pantries…
            </div>
          </template>
        </ClientOnly>

        <!-- Scrollable list area (becomes a flex row in map view so the map
             fills its height and the side list scrolls independently) -->
        <div
          class="flex-1 min-h-0"
          :class="mapActive ? 'flex overflow-hidden' : 'overflow-y-auto'"
        >
          <!-- No location yet -->
          <div
            v-if="!route.query.location"
            class="px-6 h-full flex items-center justify-center"
          >
            <LogoMessage
              title="Enter an address to begin"
              message="Type a city, address, or ZIP code above to find pantries near you."
            />
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

            <!-- Anonymous search disabled: sign in required -->
            <div
              v-else-if="authRequired"
              class="search-state"
            >
              <LogoMessage title="Sign in to search pantries" :message="authRequired">
                <button type="button" class="btn-primary search-state-action" @click="showAuthModal('login')">Sign In</button>
              </LogoMessage>
            </div>

            <!-- Rate limit reached -->
            <div
              v-else-if="rateLimited"
              class="text-center px-6 h-full flex flex-col items-center"
            >
              <div style="flex: 2 1 0" />
              <div class="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mb-4">
                <UIcon name="i-lucide-clock" class="size-7 text-yellow-600" />
              </div>
              <h3 class="font-serif text-[22px] text-gray-900 mb-2">You've hit the search limit</h3>
              <p class="text-gray-500 text-[15px] max-w-[420px]">{{ rateLimited.message }}</p>
              <div style="flex: 3 1 0" />
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
              class="search-state"
            >
              <LogoMessage
                title="No pantries match your filters"
                message="Try adjusting your filters or increasing the search radius."
              >
                <button type="button" class="btn-primary search-state-action" @click="clearFilters">Clear Filters</button>
              </LogoMessage>
            </div>

            <!-- Results: list grid -->
            <div
              v-else-if="viewMode === 'list'"
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
                  @select="selectedPantry = $event"
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

            <!-- Results: map view (map + compact side list) -->
            <div
              v-else
              class="flex-1 flex min-h-0 w-full"
            >
              <PantryMap
                :pantries="filteredPantries"
                :selected-id="mapSelectedId"
                class="flex-1 min-w-0"
                @select="selectedPantry = $event"
              />
              <div class="hidden md:block w-[300px] shrink-0 overflow-y-auto border-l border-[var(--border-soft)] bg-[var(--cream-light)]">
                <PantryMapList
                  :pantries="filteredPantries"
                  :selected-id="mapSelectedId"
                  @select="mapSelectedId = $event"
                />
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

    <ClientOnly>
      <PantryPopup
        v-if="selectedPantry"
        :pantry="selectedPantry"
        @close="selectedPantry = null"
      />
    </ClientOnly>
  </div>
</template>
