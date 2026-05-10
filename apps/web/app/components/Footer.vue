<script setup lang="ts">
const columns = [
  {
    heading: 'For Visitors',
    links: [
      { label: 'Find Pantries', to: '/search', type: 'route' as const },
      { label: 'Map View',       to: '#', type: 'anchor' as const },
      { label: 'Food Categories', to: '#', type: 'anchor' as const },
      { label: 'FAQ',            to: '#', type: 'anchor' as const },
    ],
  },
  {
    heading: 'For Pantries',
    links: [
      { label: 'Add Your Pantry',   to: '#', type: 'anchor' as const },
      { label: 'Manage Listing',    to: '#', type: 'anchor' as const },
      { label: 'Volunteer',         to: '#', type: 'anchor' as const },
      { label: 'Partner With Us',   to: '#', type: 'anchor' as const },
    ],
  },
  {
    heading: 'Organization',
    links: [
      { label: 'About Us',        to: '#', type: 'anchor' as const },
      { label: 'Press',           to: '#', type: 'anchor' as const },
      { label: 'Contact',         to: '#', type: 'anchor' as const },
      { label: 'Privacy Policy',  to: '#', type: 'anchor' as const },
    ],
  },
]
</script>

<template>
  <footer style="background: #1a2e1e;" class="py-[60px] px-6 pb-9">
    <div class="max-w-[1120px] mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-12 mb-12">
        <!-- Brand column -->
        <div>
          <div class="flex items-center gap-2 mb-4">
            <span class="text-[22px]">🌿</span>
            <span class="font-serif font-semibold text-[18px] text-white">PantryFinder</span>
          </div>
          <p class="text-[14px] leading-[1.75] font-light max-w-[280px]" style="color: rgba(255,255,255,0.45);">
            Connecting communities with food resources since 2021. Free, private, and always here.
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

      <div class="pt-7 flex flex-wrap justify-between items-center gap-4 border-t" style="border-color: rgba(255,255,255,0.08);">
        <span class="text-[13px]" style="color: rgba(255,255,255,0.3);">© 2025 PantryFinder. Made with care for every community.</span>
        <span class="text-[13px]" style="color: rgba(255,255,255,0.3);">Free forever · No ads · No tracking</span>
      </div>
    </div>
  </footer>
</template>
