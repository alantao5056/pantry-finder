<script setup lang="ts">
const { tags: nearbyTags } = useNearbyTags()

// Map View searches the visitor's area (first "Try:" tag, if any) in map view.
const mapViewTo = computed(() => {
  const location = nearbyTags.value[0]
  const query = location ? { location, radius: '5', view: 'map' } : { view: 'map' }
  return { path: '/search', query }
})

const columns = computed(() => [
  {
    heading: 'For Visitors',
    links: [
      { label: 'Find Pantries', to: '/search', type: 'route' as const },
      { label: 'Browse by City', to: '/food-pantries', type: 'route' as const },
      { label: 'Map View',       to: mapViewTo.value, type: 'route' as const },
    ],
  },
  {
    heading: 'For Pantries',
    links: [
      { label: 'Add Your Pantry',   to: '/add-pantry', type: 'route' as const },
      { label: 'Partner With Us',   to: '#', type: 'anchor' as const },
    ],
  },
  {
    heading: 'Organization',
    links: [
      { label: 'About Us',        to: '#', type: 'anchor' as const },
      { label: 'Contact',         to: '#', type: 'anchor' as const },
      { label: 'Privacy Policy',  to: '#', type: 'anchor' as const },
    ],
  },
])
</script>

<template>
  <footer class="footer-shell py-[60px] px-6 pb-9">
    <div class="max-w-[1120px] mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-12 mb-12">
        <!-- Brand column -->
        <div>
          <FooterBrand class="mb-4" />
          <p class="text-[14px] leading-[1.75] font-light max-w-[280px]" style="color: rgba(255,255,255,0.45);">
            Connecting communities with food resources since 2026. Free, private, and always here.
          </p>
        </div>

        <!-- Link columns -->
        <div v-for="col in columns" :key="col.heading">
          <h4 class="text-[12px] font-semibold uppercase mb-4" style="color: rgba(255,255,255,0.35); letter-spacing: 0.1em;">
            {{ col.heading }}
          </h4>
          <ul class="list-none flex flex-col gap-2.5 p-0 m-0">
            <li v-for="link in col.links" :key="link.label">
              <NuxtLink
                v-if="link.type === 'route'"
                :to="link.to"
                class="footer-link"
              >{{ link.label }}</NuxtLink>
              <a
                v-else
                :href="link.to"
                class="footer-link"
              >{{ link.label }}</a>
            </li>
          </ul>
        </div>
      </div>

      <FooterBar class="pt-7 border-t" style="border-color: rgba(255,255,255,0.08);" />
    </div>
  </footer>
</template>
