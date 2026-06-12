<script setup lang="ts">
const props = defineProps<{
  /** Pantry name — used for the share-sheet title and prefilled text. */
  title: string
  /** Absolute canonical URL of the pantry page. */
  url: string
}>()

// Pantry-centric prefill: describes the pantry, never the person sharing.
const shareText = computed(() => `Free food pantry: ${props.title} — hours & info`)

const menuOpen = ref(false)
const copied = ref(false)
const root = ref<HTMLElement | null>(null)

const onShareClick = async () => {
  // navigator.share on desktop (Windows/ChromeOS) opens a clunky OS dialog —
  // only prefer it on touch devices, where the native sheet is actually good.
  const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  if (navigator.share && isTouchDevice) {
    try {
      await navigator.share({ title: props.title, text: shareText.value, url: props.url })
    } catch {
      // User dismissed the share sheet — not an error.
    }
    return
  }
  menuOpen.value = !menuOpen.value
}

const copyLink = async () => {
  await navigator.clipboard.writeText(props.url)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const onDocClick = (e: MouseEvent) => {
  if (root.value && !root.value.contains(e.target as Node)) menuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

// Plain intent URLs — no SDKs, no client ids, no trackers.
const shareLinks = computed(() => [
  {
    label: 'Facebook',
    icon: 'i-lucide-facebook',
    href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(props.url)}`,
    external: true,
  },
  {
    label: 'X',
    icon: 'i-lucide-twitter',
    href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(props.url)}&text=${encodeURIComponent(shareText.value)}`,
    external: true,
  },
  {
    label: 'Email',
    icon: 'i-lucide-mail',
    href: `mailto:?subject=${encodeURIComponent(props.title)}&body=${encodeURIComponent(`${shareText.value}\n${props.url}`)}`,
    external: false,
  },
])
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="detail-action"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      @click="onShareClick"
    >
      <UIcon name="i-lucide-share-2" class="size-4" />
      Share
    </button>

    <!-- Share menu for desktop; touch devices get the native share sheet instead. -->
    <div v-if="menuOpen" class="share-menu" role="menu">
      <button type="button" class="share-menu-item" role="menuitem" @click="copyLink">
        <UIcon
          :name="copied ? 'i-lucide-check' : 'i-lucide-link'"
          class="size-4"
          :class="copied ? 'text-[var(--green-mid)]' : ''"
        />
        {{ copied ? 'Copied!' : 'Copy link' }}
      </button>
      <a
        v-for="link in shareLinks"
        :key="link.label"
        class="share-menu-item"
        role="menuitem"
        :href="link.href"
        :target="link.external ? '_blank' : undefined"
        :rel="link.external ? 'noreferrer' : undefined"
        @click="menuOpen = false"
      >
        <UIcon :name="link.icon" class="size-4" />
        {{ link.label }}
      </a>
    </div>
  </div>
</template>
