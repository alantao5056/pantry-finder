<script setup lang="ts">
const { show } = useAuthModal()
const { isLoggedIn, initials, logout } = useAuth()

const onLogout = () => logout()

const navLinks = [
  { label: 'Find Pantries', href: '/search', type: 'route' as const },
  { label: 'How It Works',  href: '/#how-it-works', type: 'route' as const },
  { label: 'Add a Pantry',  href: '#', type: 'anchor' as const },
  { label: 'Volunteer',     href: '#', type: 'anchor' as const },
]
</script>

<template>
  <header
    class="sticky top-0 z-50 border-b"
    style="background: rgba(253,251,247,0.88); backdrop-filter: blur(12px); border-color: var(--border-soft);"
  >
    <div class="max-w-[1120px] mx-auto px-6 h-16 flex items-center justify-between">

      <!-- Logo -->
      <NuxtLink to="/" class="flex items-center gap-2 no-underline">
        <span class="text-[24px]">🌿</span>
        <span class="font-serif font-semibold text-[20px]" style="color: var(--text-dark);">PantryFinder</span>
      </NuxtLink>

      <!-- Nav -->
      <nav class="hidden md:flex items-center gap-8">
        <template v-for="link in navLinks" :key="link.label">
          <NuxtLink
            v-if="link.type === 'route'"
            :to="link.href"
            class="nav-link text-sm font-medium no-underline"
            style="color: var(--text-mid);"
          >{{ link.label }}</NuxtLink>
          <a
            v-else
            :href="link.href"
            class="nav-link text-sm font-medium no-underline"
            style="color: var(--text-mid);"
          >{{ link.label }}</a>
        </template>
      </nav>

      <!-- Auth -->
      <div class="flex items-center gap-2">
        <template v-if="isLoggedIn">
          <div
            class="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[12px] font-semibold"
            style="background: #dcf4e6; color: var(--green-dark);"
            aria-label="Account"
          >{{ initials }}</div>
          <button
            type="button"
            class="bg-transparent border-none text-sm"
            style="color: var(--text-soft);"
            @click="onLogout"
          >Sign out</button>
        </template>

        <template v-else>
          <button
            type="button"
            class="bg-transparent border-none text-sm font-medium px-3.5 py-2"
            style="color: var(--text-mid);"
            @click="show('login')"
          >Sign in</button>
          <button
            type="button"
            class="border-none text-sm font-semibold text-white rounded-[10px] px-5 py-[9px] transition-colors"
            style="background: var(--green-dark);"
            @mouseenter="(e) => ((e.currentTarget as HTMLElement).style.background = '#1a6038')"
            @mouseleave="(e) => ((e.currentTarget as HTMLElement).style.background = '#1e7a47')"
            @click="show('register')"
          >Register free</button>
        </template>
      </div>
    </div>
  </header>
</template>
