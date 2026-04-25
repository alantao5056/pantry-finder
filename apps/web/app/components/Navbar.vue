<script setup lang="ts">
const route = useRoute()
const scrolled = ref(false)
const { show } = useAuthModal()

const isLanding = computed(() => route.path === '/')
const opaque = computed(() => scrolled.value || !isLanding.value)

const updateScroll = () => {
  scrolled.value = window.scrollY > 20
}

onMounted(() => {
  updateScroll()
  window.addEventListener('scroll', updateScroll, { passive: true })
  onUnmounted(() => window.removeEventListener('scroll', updateScroll))
})

watch(() => route.path, () => nextTick(updateScroll))
</script>

<template>
  <nav
    class="fixed top-0 inset-x-0 z-50 px-8 transition-all duration-300"
    :class="opaque
      ? 'bg-white/[0.96] backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.08)]'
      : 'bg-transparent'"
  >
    <div class="max-w-[1200px] mx-auto h-16 flex items-center gap-8">

      <!-- Logo -->
      <button class="flex items-center gap-2 cursor-pointer">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-forest-600 to-forest-400">
          <UIcon name="i-lucide-leaf" class="size-4 text-white" />
        </div>
        <span
          class="font-serif text-xl font-bold tracking-tight transition-colors"
          :class="opaque ? 'text-forest-700' : 'text-white'"
        >PantryFinder</span>
      </button>

      <div class="flex-1" />

      <button
        class="text-sm font-medium px-1 transition-colors"
        :class="opaque ? 'text-gray-500 hover:text-gray-700' : 'text-white/80 hover:text-white'"
      >Find Pantries</button>

      <button
        class="text-sm font-medium px-1 transition-colors"
        :class="opaque ? 'text-gray-500 hover:text-gray-700' : 'text-white/80 hover:text-white'"
      >About</button>

      <div class="w-px h-5 transition-colors" :class="opaque ? 'bg-gray-200' : 'bg-white/30'" />

      <button
        class="text-sm font-medium px-1 transition-colors"
        :class="opaque ? 'text-forest-700 hover:text-forest-800' : 'text-white hover:text-white/90'"
        @click="show('login')"
      >Sign In</button>

      <button
        class="text-sm font-medium rounded-lg px-4 py-[7px] transition-all text-white"
        :class="opaque
          ? 'bg-forest-700 hover:bg-forest-800'
          : 'bg-white/15 border border-white/50 backdrop-blur-sm hover:bg-white/25'"
        @click="show('register')"
      >Register</button>

    </div>
  </nav>
</template>
