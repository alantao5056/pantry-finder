<script setup lang="ts">
const props = withDefaults(defineProps<{
  initialAddress?: string
  initialRadius?: string
  showRadius?: boolean
}>(), {
  initialAddress: '',
  initialRadius: '5',
  showRadius: true,
})

const emit = defineEmits<{
  submit: [address: string, radius: string]
}>()

const {
  query,
  suggestions,
  isLoading,
  isOpen,
  activeIndex,
  open,
  close,
  select,
  markCommitted,
  onKeydown,
} = useAddressAutocomplete(props.initialAddress)

const radius = ref(props.initialRadius)

let blurTimer: ReturnType<typeof setTimeout> | null = null
const onBlur = () => {
  blurTimer = setTimeout(close, 120)
}
const onFocus = () => {
  if (blurTimer) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
  open()
}

const onSubmit = () => {
  const a = query.value.trim()
  if (!a) return
  markCommitted()
  emit('submit', a, radius.value)
}

const onInputKeydown = (e: KeyboardEvent) => {
  onKeydown(e)
  if (e.key === 'Enter' && !e.defaultPrevented) {
    e.preventDefault()
    onSubmit()
  }
}
</script>

<template>
  <div class="relative w-full">
    <div
      class="search-wrap flex gap-0 rounded-[18px] overflow-hidden bg-white border-[1.5px]"
      style="border-color: var(--border-input); box-shadow: 0 4px 24px rgba(30,122,71,0.08);"
    >
      <!-- Address input -->
      <div class="flex-1 flex items-center gap-3 px-5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#82d4a7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <input
          v-model="query"
          type="text"
          placeholder="Address, city, or ZIP code…"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="isOpen"
          aria-controls="address-suggestions"
          :aria-activedescendant="activeIndex >= 0 ? `address-suggestion-${activeIndex}` : undefined"
          class="flex-1 bg-transparent border-none outline-none text-[15px] py-[18px] text-gray-900 placeholder:text-gray-400 font-sans"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onInputKeydown"
        />
      </div>

      <!-- Radius selector (optional) -->
      <select
        v-if="showRadius"
        v-model="radius"
        class="border-none text-sm px-4 cursor-pointer outline-none appearance-none min-w-[100px] bg-cream text-gray-900"
      >
        <option v-for="r in ['2', '5', '10', '25', '50']" :key="r" :value="r">{{ r }} miles</option>
      </select>

      <!-- Search button -->
      <button
        type="button"
        class="btn-primary rounded-none"
        @click="onSubmit"
      >
        Search Pantries
      </button>
    </div>

    <!-- Autocomplete dropdown -->
    <div
      v-if="isOpen && (isLoading || suggestions.length > 0 || query.trim().length >= 3)"
      id="address-suggestions"
      role="listbox"
      class="absolute top-full left-0 right-0 mt-2 bg-white border border-cream-dark rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.18)] z-20 text-left"
    >
      <!-- Loading -->
      <div
        v-if="isLoading"
        class="flex items-center gap-2.5 px-4 py-3 text-[14px] text-gray-500"
      >
        <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
        <span>Searching…</span>
      </div>

      <!-- Empty -->
      <div
        v-else-if="suggestions.length === 0"
        class="px-4 py-3 text-[14px] text-gray-400"
      >
        No matches
      </div>

      <!-- Items -->
      <ul v-else class="max-h-[320px] overflow-y-auto">
        <li
          v-for="(s, i) in suggestions"
          :id="`address-suggestion-${i}`"
          :key="s.id"
          role="option"
          :aria-selected="i === activeIndex"
          :class="[
            'flex items-start gap-2.5 px-4 py-2.5 cursor-pointer transition-colors',
            i === activeIndex ? 'bg-cream' : 'hover:bg-cream-muted',
          ]"
          @mousedown.prevent="select(s)"
          @mouseenter="activeIndex = i"
        >
          <UIcon
            name="i-lucide-map-pin"
            class="size-4 shrink-0 mt-0.5 text-forest-500"
          />
          <div class="min-w-0 flex-1">
            <div class="text-[14px] truncate text-gray-900">{{ s.primary }}</div>
            <div
              v-if="s.secondary"
              class="text-[12px] truncate text-gray-500"
            >{{ s.secondary }}</div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
