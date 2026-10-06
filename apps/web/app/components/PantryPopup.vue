<script setup lang="ts">
import type { Pantry, Schedule, Service } from '@pantry-finder/shared'

const props = defineProps<{
  pantry: Pantry
}>()

const emit = defineEmits<{
  close: []
}>()

const { isLoggedIn } = useAuth()
const { show: showAuthModal } = useAuthModal()
const { isHearted, toggleHeart } = useHearts()

const openNow = computed(() => isOpenNow(props.pantry.schedules))
const openToday = computed(() => isOpenToday(props.pantry.schedules))
const allFoods = computed(() => getUniqueFoods(props.pantry.services))
const uniqueServices = computed(() => getUniqueServices(props.pantry.services))
const hearted = computed(() => isHearted(props.pantry.id))
const localCount = ref(props.pantry.heartCount ?? 0)
const collapsed = ref<Record<string, boolean>>({})

const mapsUrl = computed(() =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.pantry.address)}`,
)
const reportUrl = computed(() => {
  const subject = `PantryFinder update: ${props.pantry.name}`
  const body = `Pantry: ${props.pantry.name}\nAddress: ${props.pantry.address}\n\nWhat needs to be corrected?\n`
  return `mailto:support@pantryfinder.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
})

watch(hearted, (newVal, oldVal) => {
  if (newVal !== oldVal) localCount.value += newVal ? 1 : -1
})

watch(() => props.pantry.id, () => {
  localCount.value = props.pantry.heartCount ?? 0
  collapsed.value = {}
})

const close = () => emit('close')

const onHeartClick = async () => {
  if (!isLoggedIn.value) {
    showAuthModal('login')
    return
  }
  await toggleHeart(props.pantry.id)
}

const toggleService = (service: Service, index: number) => {
  const key = serviceKey(service, index)
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] }
}

const isServiceOpen = (service: Service, index: number) => !collapsed.value[serviceKey(service, index)]

const serviceKey = (service: Service, index: number) => `${service.name}-${index}`

const validServiceSchedules = (service: Service) =>
  service.schedules.filter(s => (s.weekDay && s.start) || s.notes)

const uniqueFoodList = (service: Service) => [...new Set(service.food)]

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      class="pantry-popup-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="`${pantry.name} details`"
    >
      <article class="pantry-popup-card animate-pop-in">
        <header class="pantry-popup-header">
          <button
            type="button"
            class="pantry-popup-close"
            aria-label="Close pantry details"
            @click="close"
          >
            <UIcon name="i-lucide-x" class="size-4" />
          </button>

          <div class="flex items-start gap-3.5 mb-4">
            <div class="flex-1 min-w-0 pr-10">
              <div class="flex flex-col items-start gap-2 mb-1.5">
                <span
                  v-if="openNow"
                  class="status-pill status-pill--open"
                >
                  <span class="status-dot" />
                  OPEN NOW
                </span>
                <span
                  v-else-if="openToday"
                  class="status-pill status-pill--today"
                >OPEN TODAY</span>
                <span
                  v-else-if="pantry.schedules.length > 0"
                  class="status-pill status-pill--closed"
                >CLOSED TODAY</span>
                <h2 class="text-[clamp(20px,3vw,26px)] font-bold text-gray-900 leading-tight">
                  {{ pantry.name }}
                </h2>
              </div>

              <div class="pantry-popup-meta">
                <span class="pantry-popup-meta-icon">
                  <UIcon name="i-lucide-map-pin" />
                </span>
                <span>{{ pantry.address }}</span>
                <span
                  v-if="pantry.distance !== undefined"
                  class="ml-2 inline-flex items-center gap-1.5 font-semibold text-gray-600"
                >
                  <UIcon name="i-lucide-navigation" class="size-3 text-[var(--green-mid)]" />
                  {{ pantry.distance.toFixed(1) }} mi away
                </span>
              </div>
              <div
                v-if="pantry.phone"
                class="pantry-popup-meta"
              >
                <span class="pantry-popup-meta-icon">
                  <UIcon name="i-lucide-phone" />
                </span>
                <span>{{ pantry.phone }}</span>
              </div>
              <div
                v-if="pantry.email"
                class="pantry-popup-meta"
              >
                <span class="pantry-popup-meta-icon">
                  <UIcon name="i-lucide-mail" />
                </span>
                <a class="break-all hover:text-[var(--green-dark)]" :href="`mailto:${pantry.email}`">{{ pantry.email }}</a>
              </div>
            </div>
          </div>

          <div class="pantry-popup-actions">
            <button
              type="button"
              class="popup-action"
              :class="hearted ? 'popup-action--hearted' : ''"
              @click="onHeartClick"
            >
              <UIcon
                :name="hearted ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
                class="size-[15px]"
              />
              {{ hearted ? 'Loved' : 'Love' }} &middot; {{ localCount }}
            </button>
            <a
              class="popup-action"
              :href="mapsUrl"
              target="_blank"
              rel="noreferrer"
            >
              <UIcon name="i-lucide-navigation" class="size-[15px]" />
              Directions
            </a>
            <a
              class="popup-action"
              :href="reportUrl"
            >
              <UIcon name="i-lucide-flag" class="size-[15px]" />
              Report
            </a>
            <NuxtLink
              class="popup-action popup-action--primary"
              :to="pantryPath(pantry)"
              @click="close"
            >
              View Details
              <UIcon name="i-lucide-arrow-right" class="size-[15px]" />
            </NuxtLink>
          </div>
        </header>

        <div class="pantry-popup-body">
          <section
            v-if="pantry.about"
            class="popup-section"
          >
            <h3 class="popup-section-title">
              <UIcon name="i-lucide-info" class="size-3.5 text-gray-500" />
              About this pantry
            </h3>
            <p class="text-[13.5px] leading-7 text-gray-600">
              {{ pantry.about }}
            </p>
          </section>

          <div class="grid gap-5 md:grid-cols-2">
            <section class="popup-section">
              <h3 class="popup-section-title">
                <UIcon name="i-lucide-calendar" class="size-3.5 text-gray-500" />
                Hours & Schedule
              </h3>
              <div v-if="pantry.schedules.length > 0">
                <div
                  v-for="(schedule, index) in pantry.schedules.filter(s => s.weekDay && s.start)"
                  :key="`${schedule.weekDay}-${schedule.start}-${index}`"
                  class="schedule-row"
                >
                  <span
                    class="schedule-day"
                    :class="{ 'is-today': isToday(schedule.weekDay) }"
                  >{{ schedule.weekDay.slice(0, 3).toUpperCase() }}</span>
                  <span class="min-w-0">
                    <span class="block text-[13px] font-medium text-gray-800">
                      {{ schedule.start }} - {{ schedule.end }}
                    </span>
                    <span
                      v-if="schedule.notes"
                      class="block text-[11px] text-gray-500 mt-0.5"
                    >{{ schedule.notes }}</span>
                  </span>
                </div>
              </div>
              <p
                v-else
                class="text-[13px] italic text-gray-500"
              >
                Call for schedule: {{ pantry.phone || 'see contact info' }}
              </p>
            </section>

            <section class="popup-section">
              <h3 class="popup-section-title">
                <UIcon name="i-lucide-leaf" class="size-3.5 text-gray-500" />
                Available Food
              </h3>
              <div
                v-if="allFoods.length > 0"
                class="flex flex-wrap gap-1.5"
              >
                <span
                  v-for="food in allFoods"
                  :key="food"
                  class="food-pill bg-white"
                >
                  {{ food }}
                </span>
              </div>
              <p
                v-else
                class="text-[13px] italic text-gray-500"
              >
                Contact for availability details
              </p>
            </section>
          </div>

          <section>
            <h3 class="popup-section-title mb-3.5">
              <UIcon name="i-lucide-star" class="size-3.5 text-gray-500" />
              Services Offered
            </h3>
            <div class="flex flex-col gap-3">
              <article
                v-for="(service, index) in uniqueServices"
                :key="serviceKey(service, index)"
                class="service-panel"
                :class="serviceTone(service.category)"
              >
                <button
                  type="button"
                  class="service-panel-toggle"
                  :aria-expanded="isServiceOpen(service, index)"
                  @click="toggleService(service, index)"
                >
                  <span class="service-dot size-[7px]" />
                  <span class="flex-1 min-w-0">
                    <span class="text-[13.5px] font-semibold text-gray-900">{{ service.name }}</span>
                    <span class="service-program text-[12px] ml-2">
                      {{ service.program && service.program !== service.category ? service.program : service.category }}
                    </span>
                  </span>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="size-4 text-gray-400 transition-transform"
                    :class="isServiceOpen(service, index) ? '' : '-rotate-90'"
                  />
                </button>

                <div
                  v-if="isServiceOpen(service, index)"
                  class="service-panel-body"
                >
                  <div
                    v-if="uniqueFoodList(service).length > 0"
                    class="flex flex-wrap gap-1.5"
                  >
                    <span
                      v-for="food in uniqueFoodList(service)"
                      :key="food"
                      class="food-pill bg-[var(--green-light)]"
                    >
                      {{ food }}
                    </span>
                  </div>

                  <div>
                    <template v-if="validServiceSchedules(service).length > 0">
                      <div
                        v-for="(schedule, scheduleIndex) in validServiceSchedules(service)"
                        :key="`${schedule.weekDay}-${schedule.start}-${scheduleIndex}`"
                        class="service-schedule-row"
                      >
                        <template v-if="schedule.weekDay && schedule.start">
                          <span
                            class="schedule-day"
                            :class="{ 'is-today': isToday(schedule.weekDay) }"
                          >{{ schedule.weekDay.slice(0, 3).toUpperCase() }}</span>
                          <span class="flex-1 text-[13px] font-medium text-gray-800">
                            {{ schedule.start }} - {{ schedule.end }}
                          </span>
                          <span
                            v-if="schedule.notes"
                            class="schedule-note"
                          >{{ schedule.notes }}</span>
                        </template>
                        <span
                          v-else
                          class="text-[12px] italic text-gray-600"
                        >{{ schedule.notes }}</span>
                      </div>
                    </template>
                    <span
                      v-else
                      class="block py-1 text-[12px] italic text-gray-500"
                    >
                      Contact pantry for schedule details
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </article>
    </div>
  </Teleport>
</template>
