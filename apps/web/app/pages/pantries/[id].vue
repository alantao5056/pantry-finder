<script setup lang="ts">
import type { Pantry, Service } from '@pantry-finder/shared'

const DAY_ORDER = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

const route = useRoute()
const router = useRouter()
const api = useApi()

// The route param is the canonical "<slug>-<id>", but we tolerate legacy bare
// "<id>" params too. The id is the authoritative lookup key.
const id = computed(() => extractPantryId(String(route.params.id)))

const { data: pantry, pending, error } = await useAsyncData(
  `pantry-${id.value}`,
  () => api<Pantry>(`/pantries/${id.value}`),
  { watch: [id] },
)

// Rate-limited by the API (rateLimitBrowse): a real 429 instead of the
// "Pantry not found" fallback below.
if ((error.value as { statusCode?: number } | null)?.statusCode === 429) {
  throw createError({ statusCode: 429, statusMessage: 'Too many requests', fatal: true })
}

// Upgrade bare-id or stale-slug URLs to the canonical slug URL with a real 301
// (avoids duplicate-content). Only runs for found pantries; the canonical param
// is stable, so this can't loop.
if (pantry.value && !isCanonicalPantryParam(String(route.params.id), pantry.value)) {
  await navigateTo(pantryPath(pantry.value), { redirectCode: 301, replace: true })
}

usePageSeo({
  title: () => (pantry.value ? pantry.value.name : 'Pantry'),
  description: () => {
    if (!pantry.value) return 'Find free food pantries near you on PantryFinder.'
    if (pantry.value.about) return pantry.value.about.slice(0, 160)
    return `Hours, available food, and contact info for ${pantry.value.name} at ${pantry.value.address}.`
  },
  path: () => (pantry.value ? pantryPath(pantry.value) : `/pantries/${route.params.id}`),
})

// Per-pantry LocalBusiness JSON-LD. The url/@id matches the canonical detail URL
// (same origin usePageSeo uses for the canonical link) so the node is self-consistent.
const origin = useRequestURL().origin
useHead(() => {
  if (!pantry.value) return {}
  const ld = buildPantryJsonLd(pantry.value, `${origin}${pantryPath(pantry.value)}`)
  return {
    script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(ld) }],
  }
})

const { isLoggedIn } = useAuth()
const { show: showAuthModal } = useAuthModal()
const { isHearted, toggleHeart } = useHearts()

const openNow = computed(() => (pantry.value ? isOpenNow(pantry.value.schedules) : false))
const openToday = computed(() => (pantry.value ? isOpenToday(pantry.value.schedules) : false))
const allFoods = computed(() => (pantry.value ? getUniqueFoods(pantry.value.services) : []))
const uniqueServices = computed(() => (pantry.value ? getUniqueServices(pantry.value.services) : []))

const hearted = computed(() => (pantry.value ? isHearted(pantry.value.id) : false))
const localCount = ref(pantry.value?.heartCount ?? 0)

watch(hearted, (newVal, oldVal) => {
  if (newVal !== oldVal) localCount.value += newVal ? 1 : -1
})
watch(() => pantry.value?.heartCount, (count) => {
  localCount.value = count ?? 0
})

const onHeartClick = async () => {
  if (!pantry.value) return
  if (!isLoggedIn.value) {
    showAuthModal('login')
    return
  }
  await toggleHeart(pantry.value.id)
}

// Follow is not wired to a backend yet — this toggle is presentational only.
const following = ref(false)
watch(() => pantry.value?.id, () => { following.value = false })

const goBack = () => {
  if (import.meta.client && window.history.length > 1) router.back()
  else router.push('/search')
}

const mapsUrl = computed(() =>
  pantry.value
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pantry.value.address)}`
    : '#',
)
const shareUrl = computed(() =>
  pantry.value ? `${origin}${pantryPath(pantry.value)}` : '',
)
const reportUrl = computed(() => {
  if (!pantry.value) return '#'
  const subject = `PantryFinder update: ${pantry.value.name}`
  const body = `Pantry: ${pantry.value.name}\nAddress: ${pantry.value.address}\n\nWhat needs to be corrected?\n`
  return `mailto:support@pantryfinder.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
})
// Group the top-level pantry schedules by day, in week order.
const schedulesByDay = computed(() => {
  if (!pantry.value) return []
  return DAY_ORDER
    .map(day => ({ day, slots: pantry.value!.schedules.filter(s => s.weekDay === day && s.start) }))
    .filter(group => group.slots.length > 0)
})

const dayBadgeStyle = (day: string) => {
  const color = dayColor(day)
  return { color, backgroundColor: `${color}14` }
}

const serviceSchedulesByDay = (service: Service) => {
  const valid = service.schedules.filter(s => (s.weekDay && s.start) || s.notes)
  return DAY_ORDER
    .map(day => ({ day, slots: valid.filter(s => s.weekDay === day && s.start) }))
    .filter(group => group.slots.length > 0)
}
const serviceNoDayNote = (service: Service) =>
  service.schedules.find(s => !s.weekDay && s.notes)?.notes
const serviceFoods = (service: Service) => [...new Set(service.food)]
const serviceProgram = (service: Service) =>
  service.program && service.program !== service.category ? service.program : service.category

const serviceDotClass = (category: string) => {
  if (category === 'Food Program') return 'bg-[var(--green-mid)]'
  if (category === 'Healthcare Screenings/Referrals') return 'bg-blue-500'
  if (category === 'Housing Assistance') return 'bg-orange-500'
  if (category === 'Tax/Financial Support') return 'bg-violet-500'
  return 'bg-gray-500'
}
const serviceTextClass = (category: string) => {
  if (category === 'Food Program') return 'text-[var(--green-dark)]'
  if (category === 'Healthcare Screenings/Referrals') return 'text-blue-700'
  if (category === 'Housing Assistance') return 'text-orange-700'
  if (category === 'Tax/Financial Support') return 'text-violet-700'
  return 'text-gray-700'
}
</script>

<template>
  <div class="min-h-[calc(100dvh-4rem-1px)] bg-[#f5f7f5] font-sans">
    <!-- Loading -->
    <div
      v-if="pending && !pantry"
      class="flex items-center justify-center py-24 text-gray-500 gap-3"
    >
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-forest-500" />
      <span class="text-[15px]">Loading pantry…</span>
    </div>

    <!-- Found -->
    <div v-else-if="pantry">
      <!-- Breadcrumb bar -->
      <div class="bg-white border-b border-[var(--border-soft)] px-6">
        <div class="max-w-[1100px] mx-auto h-11 flex items-center gap-2 text-[13px] text-gray-400">
          <button
            type="button"
            class="flex items-center gap-1.5 text-[var(--text-mid)] font-medium hover:text-[var(--green-dark)] transition-colors"
            @click="goBack"
          >
            <UIcon name="i-lucide-arrow-left" class="size-3.5" />
            Back to results
          </button>
          <span class="text-gray-300">›</span>
          <NuxtLink to="/search" class="text-gray-400 no-underline hover:text-[var(--green-dark)]">
            Food Pantries
          </NuxtLink>
          <span class="text-gray-300">›</span>
          <span class="text-gray-700 font-medium truncate max-w-[280px]">{{ pantry.name }}</span>
        </div>
      </div>

      <!-- Hero card -->
      <div class="bg-white border-b border-[var(--border-soft)]">
        <div class="max-w-[1100px] mx-auto px-6 pt-8 pb-7">
          <div class="flex items-start gap-5">
            <div class="hidden sm:flex shrink-0 w-[68px] h-[68px] rounded-[18px] items-center justify-center font-serif text-[28px] font-bold text-[var(--green-dark)] border-2 border-[#c8e8d4] shadow-[0_4px_16px_rgba(30,122,71,0.12)] bg-gradient-to-br from-[#dcf4e6] to-[#a8dbbf]">
              {{ pantry.name.charAt(0) }}
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2.5 flex-wrap mb-1.5">
                <h1 class="font-serif text-[clamp(22px,3vw,30px)] font-bold text-gray-900 leading-tight">
                  {{ pantry.name }}
                </h1>
                <span v-if="openNow" class="status-pill status-pill--open">
                  <span class="size-1.5 rounded-full bg-green-500" />
                  OPEN NOW
                </span>
                <span v-else-if="openToday" class="status-pill status-pill--today">OPEN TODAY</span>
                <span
                  v-else-if="pantry.schedules.length > 0"
                  class="status-pill status-pill--closed"
                >CLOSED TODAY</span>
              </div>

              <div class="flex flex-wrap gap-x-4 gap-y-1.5 mb-5">
                <span class="detail-meta">
                  <UIcon name="i-lucide-map-pin" class="detail-meta-icon" />
                  {{ pantry.address }}
                </span>
                <span v-if="pantry.phone" class="detail-meta">
                  <UIcon name="i-lucide-phone" class="detail-meta-icon" />
                  {{ pantry.phone }}
                </span>
                <span
                  v-if="pantry.distance !== undefined"
                  class="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--green-mid)]"
                >
                  <UIcon name="i-lucide-navigation" class="size-3.5" />
                  {{ pantry.distance.toFixed(1) }} mi away
                </span>
              </div>

              <!-- Action buttons -->
              <div class="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  class="detail-action detail-action--love"
                  :class="hearted ? 'is-active' : ''"
                  @click="onHeartClick"
                >
                  <UIcon
                    :name="hearted ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
                    class="size-4"
                  />
                  {{ hearted ? 'Loved' : 'Love' }} &middot; {{ localCount }}
                </button>
                <button
                  type="button"
                  class="detail-action detail-action--follow"
                  :class="following ? 'is-active' : ''"
                  @click="following = !following"
                >
                  <UIcon
                    :name="following ? 'i-lucide-bell-off' : 'i-lucide-bell'"
                    class="size-4"
                  />
                  {{ following ? 'Following' : 'Follow Updates' }}
                </button>
                <a
                  v-if="pantry.phone"
                  class="detail-action"
                  :href="`tel:${pantry.phone}`"
                >
                  <UIcon name="i-lucide-phone" class="size-4" />
                  Call Now
                </a>
                <a
                  class="detail-action"
                  :href="mapsUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  <UIcon name="i-lucide-navigation" class="size-4" />
                  Directions
                </a>
                <ShareButton :title="pantry.name" :url="shareUrl" />
                <a class="detail-action" :href="reportUrl">
                  <UIcon name="i-lucide-flag" class="size-4" />
                  Report Issue
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Two-column body -->
      <div class="max-w-[1100px] mx-auto px-6 pt-8 pb-16 grid gap-7 items-start lg:grid-cols-[1fr_360px]">
        <!-- Left column -->
        <div class="flex flex-col gap-6">
          <!-- About -->
          <section v-if="pantry.about" class="detail-card px-7 py-6">
            <div class="detail-section-title">
              <span class="detail-section-icon">
                <UIcon name="i-lucide-info" class="size-4" />
              </span>
              <h2 class="font-serif text-[17px] font-bold text-gray-900">About This Pantry</h2>
            </div>
            <p class="detail-body">{{ pantry.about }}</p>
          </section>

          <!-- Good to Know (pantry notes) -->
          <section v-if="pantry.notes" class="detail-card px-7 py-6">
            <div class="detail-section-title">
              <span class="detail-section-icon">
                <UIcon name="i-lucide-clipboard-list" class="size-4" />
              </span>
              <h2 class="font-serif text-[17px] font-bold text-gray-900">Good to Know</h2>
            </div>
            <p class="detail-body">{{ pantry.notes }}</p>
          </section>

          <!-- Hours & Schedule -->
          <section class="detail-card px-7 py-6">
            <div class="detail-section-title">
              <span class="detail-section-icon">
                <UIcon name="i-lucide-calendar" class="size-4" />
              </span>
              <h2 class="font-serif text-[17px] font-bold text-gray-900">Hours &amp; Schedule</h2>
            </div>

            <div v-if="schedulesByDay.length > 0">
              <div
                v-for="(group, gi) in schedulesByDay"
                :key="group.day"
                class="grid grid-cols-[110px_1fr] gap-4 py-3.5 items-start"
                :class="gi < schedulesByDay.length - 1 ? 'border-b border-gray-100' : ''"
              >
                <span
                  class="schedule-day w-fit text-[12px]"
                  :style="dayBadgeStyle(group.day)"
                >{{ group.day.slice(0, 3).toUpperCase() }}</span>
                <div class="flex flex-col gap-1.5">
                  <div
                    v-for="(s, si) in group.slots"
                    :key="si"
                    class="flex items-center gap-2.5 flex-wrap"
                  >
                    <span class="text-[14px] font-medium text-gray-800">{{ s.start }} – {{ s.end }}</span>
                    <span v-if="s.isEveryOtherWeek === 'true'" class="schedule-biweekly">
                      <UIcon name="i-lucide-repeat" class="size-3" />
                      Every other week
                    </span>
                    <span v-if="s.notes" class="schedule-note">{{ s.notes }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-else
              class="flex items-center gap-2.5 px-5 py-4 bg-gray-50 rounded-xl border border-gray-100"
            >
              <UIcon name="i-lucide-phone" class="size-[15px] text-gray-400" />
              <span class="text-[14px] text-gray-500">
                Please call for current schedule information<template v-if="pantry.phone">: {{ pantry.phone }}</template>.
              </span>
            </div>
          </section>

          <!-- Services Offered -->
          <section class="detail-card px-7 py-6">
            <div class="detail-section-title">
              <span class="detail-section-icon">
                <UIcon name="i-lucide-star" class="size-4" />
              </span>
              <h2 class="font-serif text-[17px] font-bold text-gray-900">Services Offered</h2>
            </div>

            <div
              v-for="(service, i) in uniqueServices"
              :key="`${service.name}-${i}`"
            >
              <div v-if="i > 0" class="h-px bg-[#f0f4f1] my-5" />

              <div class="flex items-center gap-2 mb-3 flex-wrap">
                <span class="size-2 rounded-full shrink-0" :class="serviceDotClass(service.category)" />
                <span class="font-bold text-[15px] text-gray-900">{{ service.name }}</span>
                <span class="text-[12.5px]" :class="serviceTextClass(service.category)">
                  {{ serviceProgram(service) }}
                </span>
              </div>

              <p
                v-if="service.notes"
                class="pl-4 mb-2 text-[13px] leading-relaxed text-gray-600 whitespace-pre-line"
              >{{ service.notes }}</p>

              <div
                v-for="group in serviceSchedulesByDay(service)"
                :key="group.day"
                class="grid grid-cols-[88px_1fr] gap-3 py-1.5 pl-4 items-start"
              >
                <span
                  class="schedule-day w-fit"
                  :style="dayBadgeStyle(group.day)"
                >{{ group.day.slice(0, 3).toUpperCase() }}</span>
                <div class="flex flex-col gap-1">
                  <div
                    v-for="(s, si) in group.slots"
                    :key="si"
                    class="flex items-center gap-2 flex-wrap"
                  >
                    <span class="text-[13.5px] font-medium text-gray-800">{{ s.start }} – {{ s.end }}</span>
                    <span v-if="s.isEveryOtherWeek === 'true'" class="schedule-biweekly">
                      <UIcon name="i-lucide-repeat" class="size-3" />
                      Every other week
                    </span>
                    <span v-if="s.notes" class="schedule-note">{{ s.notes }}</span>
                  </div>
                </div>
              </div>

              <div
                v-if="serviceNoDayNote(service)"
                class="flex items-center gap-1.5 py-1 pl-4 text-[13px] italic text-gray-500"
              >
                <UIcon name="i-lucide-phone" class="size-3.5 text-gray-400" />
                {{ serviceNoDayNote(service) }}
              </div>

              <div
                v-if="serviceFoods(service).length > 0"
                class="flex flex-wrap gap-1.5 mt-2.5 pl-4"
              >
                <span
                  v-for="food in serviceFoods(service)"
                  :key="food"
                  class="food-pill bg-[var(--green-light)]"
                >
                  <span class="text-[13px]">{{ foodEmoji(food) }}</span>{{ food }}
                </span>
              </div>

              <div
                v-if="serviceSchedulesByDay(service).length === 0 && !serviceNoDayNote(service) && serviceFoods(service).length === 0 && !service.notes"
                class="pl-4 text-[13px] italic text-gray-400"
              >
                Contact pantry for details.
              </div>
            </div>
          </section>
        </div>

        <!-- Right sidebar -->
        <div class="flex flex-col gap-5 lg:sticky lg:top-20">
          <!-- Map card -->
          <div class="detail-card overflow-hidden">
            <ClientOnly>
              <PantryMap
                :pantries="[pantry]"
                :enable-select="false"
                :scroll-wheel-zoom="false"
                class="w-full h-[240px] block"
              />
              <template #fallback>
                <div class="w-full h-[240px] bg-[var(--green-light)]" />
              </template>
            </ClientOnly>
            <div class="px-4 py-3.5 border-t border-gray-100">
              <div class="text-[13px] font-semibold text-gray-800 mb-1">{{ pantry.address }}</div>
              <a
                :href="mapsUrl"
                target="_blank"
                rel="noreferrer"
                class="text-[12px] font-semibold text-[var(--green-mid)] no-underline inline-flex items-center gap-1"
              >
                Get Directions →
              </a>
            </div>
          </div>

          <!-- Contact card -->
          <div v-if="pantry.phone || pantry.email" class="detail-card p-5">
            <div class="detail-eyebrow">Contact</div>
            <div class="flex flex-col gap-3">
              <a v-if="pantry.phone" :href="`tel:${pantry.phone}`" class="detail-contact-row">
                <span class="detail-contact-icon">
                  <UIcon name="i-lucide-phone" />
                </span>
                <span class="min-w-0">
                  <span class="detail-contact-title">{{ pantry.phone }}</span>
                  <span class="detail-contact-sub">Tap to call</span>
                </span>
              </a>
              <a v-if="pantry.email" :href="`mailto:${pantry.email}`" class="detail-contact-row">
                <span class="detail-contact-icon">
                  <UIcon name="i-lucide-mail" />
                </span>
                <span class="min-w-0">
                  <span class="detail-contact-title break-all">{{ pantry.email }}</span>
                  <span class="detail-contact-sub">Tap to email</span>
                </span>
              </a>
              <a :href="mapsUrl" target="_blank" rel="noreferrer" class="detail-contact-row">
                <span class="detail-contact-icon">
                  <UIcon name="i-lucide-map-pin" />
                </span>
                <span class="min-w-0">
                  <span class="detail-contact-title">Get Directions</span>
                  <span class="detail-contact-sub">Open in Google Maps</span>
                </span>
              </a>
            </div>
          </div>

          <!-- Available food card -->
          <div v-if="allFoods.length > 0" class="detail-card p-5">
            <div class="detail-eyebrow">Available Food</div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="food in allFoods"
                :key="food"
                class="food-pill bg-[var(--green-light)]"
              >
                <span class="text-[14px]">{{ foodEmoji(food) }}</span>{{ food }}
              </span>
            </div>
          </div>

          <!-- Community card -->
          <div class="detail-card p-5">
            <div class="detail-eyebrow">Community</div>
            <div class="grid grid-cols-2 gap-3">
              <div class="text-center px-2.5 py-3.5 bg-[#fff1f2] rounded-xl border border-[#fca5a5]">
                <div class="font-serif text-[22px] font-bold text-[#e11d48]">{{ localCount }}</div>
                <div class="text-[11px] font-medium text-[#9b1c3a] mt-0.5">
                  {{ localCount === 1 ? 'love' : 'loves' }}
                </div>
              </div>
              <div class="text-center px-2.5 py-3.5 bg-[var(--green-light)] rounded-xl border border-[#b8e8cc]">
                <div class="font-serif text-[22px] font-bold text-[var(--green-dark)]">—</div>
                <div class="text-[11px] font-medium text-[#1a6038] mt-0.5">followers</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Not found / error -->
    <div v-else class="text-center px-6 py-24 max-w-[460px] mx-auto">
      <div class="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <UIcon name="i-lucide-map-pin-off" class="size-7 text-yellow-500" />
      </div>
      <h1 class="font-serif text-[24px] font-semibold text-gray-900 mb-2.5">Pantry not found</h1>
      <p class="text-gray-500 text-[15px] leading-relaxed mb-6">
        We couldn't find this pantry. It may have been removed, or the link may be incorrect.
      </p>
      <button type="button" class="btn-primary" @click="goBack">Back to results</button>
    </div>

    <FooterSimple />
  </div>
</template>
