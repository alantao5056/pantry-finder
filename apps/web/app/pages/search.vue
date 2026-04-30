<script setup lang="ts">
import type { Pantry } from '@pantry-finder/types'

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

const route = useRoute()
const router = useRouter()
const api = useApi()

const initialAddress = String(route.query.address ?? '')
const initialRadius = String(route.query.radius ?? '5')

const { data, pending, error, refresh } = await useFetch<PantriesResponse>(
  '/pantries',
  {
    $fetch: api,
    query: computed(() => ({
      address: route.query.address as string | undefined,
      radius: route.query.radius as string | undefined,
    })),
    immediate: !!route.query.address,
    watch: [() => route.query.address, () => route.query.radius],
    lazy: true,
    server: false,
  }
)

const onSearch = (address: string, radius: string) => {
  router.replace({ path: '/search', query: { address, radius } })
}

const isAddressNotFound = computed(() => {
  const e = error.value as ApiError | null
  return e?.statusCode === 404
})

const radiusValue = computed(() => String(route.query.radius ?? initialRadius))
</script>

<template>
  <div class="min-h-screen bg-cream font-sans flex flex-col">
    <!-- Top search bar (sits below the fixed Navbar) -->
    <div class="bg-white border-b border-cream-dark pt-20 pb-4 px-6">
      <div class="max-w-[1200px] mx-auto">
        <SearchBar
          variant="light"
          :initial-address="initialAddress"
          :initial-radius="initialRadius"
          @submit="onSearch"
        />
      </div>
    </div>

    <!-- Results header -->
    <ClientOnly>
      <div
        v-if="route.query.address"
        class="bg-white border-b border-cream-dark px-6 py-3.5"
      >
        <div class="max-w-[1200px] mx-auto text-[14px] text-gray-500">
          <template v-if="pending && !data">
            Searching for pantries…
          </template>
          <template v-else-if="error">
            <span class="text-red-700">Could not load pantries.</span>
          </template>
          <template v-else-if="data">
            <span class="font-bold text-gray-900">{{ data.pantries.length }}</span>
            {{ data.pantries.length === 1 ? 'pantry' : 'pantries' }} found within
            <span class="font-semibold text-forest-700">{{ radiusValue }} miles</span>
          </template>
        </div>
      </div>
      <template #fallback>
        <div
          v-if="route.query.address"
          class="bg-white border-b border-cream-dark px-6 py-3.5"
        >
          <div class="max-w-[1200px] mx-auto text-[14px] text-gray-500">
            Searching for pantries…
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- Content -->
    <div class="max-w-[1200px] w-full mx-auto px-6 py-6 flex-1">
      <!-- No address yet -->
      <div
        v-if="!route.query.address"
        class="text-center py-16"
      >
        <div
          class="w-16 h-16 bg-forest-50 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <UIcon name="i-lucide-search" class="size-7 text-forest-400" />
        </div>
        <h3 class="font-serif text-[22px] text-gray-900 mb-2">Enter an address to begin</h3>
        <p class="text-gray-500 text-[15px]">Type a city, address, or ZIP code above to find pantries near you.</p>
      </div>

      <ClientOnly v-else>
        <!-- Loading -->
        <div
          v-if="pending && !data"
          class="flex items-center justify-center py-20 text-gray-500 gap-3"
        >
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-forest-500" />
          <span class="text-[15px]">Loading pantries…</span>
        </div>

        <!-- Error: address not geocoded -->
        <div
          v-else-if="isAddressNotFound"
          class="text-center py-16"
        >
          <div
            class="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <UIcon name="i-lucide-map-pin-off" class="size-7 text-yellow-500" />
          </div>
          <h3 class="font-serif text-[22px] text-gray-900 mb-2">We couldn't find that address</h3>
          <p class="text-gray-500 text-[15px]">Try entering a city, ZIP code, or a more complete street address.</p>
        </div>

        <!-- Error: other -->
        <div
          v-else-if="error"
          class="text-center py-16"
        >
          <div
            class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <UIcon name="i-lucide-alert-circle" class="size-7 text-red-500" />
          </div>
          <h3 class="font-serif text-[22px] text-gray-900 mb-2">Something went wrong</h3>
          <p class="text-gray-500 text-[15px] mb-5">We hit an error fetching pantries. Please try again.</p>
          <button
            class="bg-forest-700 hover:bg-forest-800 text-white rounded-lg px-5 py-2 text-[14px] font-medium transition-colors"
            @click="refresh()"
          >Retry</button>
        </div>

        <!-- Empty -->
        <div
          v-else-if="data && data.pantries.length === 0"
          class="text-center py-16"
        >
          <div
            class="w-16 h-16 bg-forest-50 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <UIcon name="i-lucide-search" class="size-7 text-forest-400" />
          </div>
          <h3 class="font-serif text-[22px] text-gray-900 mb-2">No pantries found</h3>
          <p class="text-gray-500 text-[15px]">Try increasing the search radius or entering a different location.</p>
        </div>

        <!-- Results grid -->
        <div
          v-else-if="data"
          class="grid gap-[18px]"
          style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));"
        >
          <PantryCard v-for="p in data.pantries" :key="p.id" :pantry="p" />
        </div>

        <template #fallback>
          <div class="flex items-center justify-center py-20 text-gray-500 gap-3">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-forest-500" />
            <span class="text-[15px]">Loading pantries…</span>
          </div>
        </template>
      </ClientOnly>
    </div>

    <Footer />
  </div>
</template>
