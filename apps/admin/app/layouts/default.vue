<script setup lang="ts">
const { admin, logout } = useAdminAuth()

const links = [
  { label: 'Review queue', to: '/reviews', icon: 'i-lucide-inbox' },
  { label: 'Crawler', to: '/crawler', icon: 'i-lucide-bot' },
  { label: 'Change log', to: '/changes', icon: 'i-lucide-history' },
  { label: 'LLM eval', to: '/llm-evals', icon: 'i-lucide-scale' },
  { label: 'Redis', to: '/redis', icon: 'i-lucide-database' },
  { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' },
]
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg-muted)">
    <header v-if="admin" class="border-b border-(--ui-border) bg-(--ui-bg)">
      <div class="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
        <NuxtLink to="/" class="font-semibold">PantryFinder Admin</NuxtLink>
        <UNavigationMenu :items="links" class="flex-1" />
        <span class="text-sm text-(--ui-text-muted) hidden sm:inline">{{ admin.email }}</span>
        <UButton label="Log out" color="neutral" variant="ghost" icon="i-lucide-log-out" @click="logout" />
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
