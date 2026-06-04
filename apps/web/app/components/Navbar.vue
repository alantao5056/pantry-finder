<script setup lang="ts">
const { show } = useAuthModal()
const { user, isLoggedIn, initials, logout } = useAuth()
const { fetchHearts } = useHearts()

const onLogout = async () => {
  await logout()
  await fetchHearts()
}

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
    <div class="max-w-[1120px] mx-auto h-16 flex items-center justify-between">

      <!-- Logo -->
      <NuxtLink to="/" class="flex items-center gap-2 no-underline">
        <img src="/logo.png" alt="PantryFinder logo" class="w-10 h-10 object-contain" />
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
          <img
            v-if="user?.picture"
            :src="user.picture"
            alt="Account"
            referrerpolicy="no-referrer"
            class="w-[34px] h-[34px] rounded-full object-cover"
          />
          <div
            v-else
            class="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[12px] font-semibold"
            style="background: #dcf4e6; color: var(--green-dark);"
            aria-label="Account"
          >{{ initials }}</div>
          <button
            type="button"
            class="btn-ghost btn--sm"
            @click="onLogout"
          >Sign out</button>
        </template>

        <template v-else>
          <button
            type="button"
            class="btn-ghost btn--sm"
            @click="show('login')"
          >Sign in</button>
          <button
            type="button"
            class="btn-primary btn--sm"
            @click="show('register')"
          >Register free</button>
        </template>
      </div>
    </div>
  </header>
</template>
