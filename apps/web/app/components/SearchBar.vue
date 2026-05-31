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
  setValue,
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

defineExpose({
  setAddress: setValue,
})
</script>

<template>
  <div class="relative w-full">
    <div
      class="search-wrap flex border-[1.5px] overflow-hidden"
      :class="showRadius
        ? 'rounded-[14px] shadow-[0_2px_12px_rgba(30,122,71,0.06)]'
        : 'rounded-[18px] shadow-[0_4px_24px_rgba(30,122,71,0.08)]'"
    >
      <!-- Address input -->
      <div
        class="flex-1 flex items-center"
        :class="showRadius ? 'gap-2.5 px-[18px]' : 'gap-3 px-5'"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          :stroke="showRadius ? '#2d9a5f' : '#82d4a7'"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0"
          :class="showRadius ? 'w-4 h-4' : 'w-5 h-5'"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
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
          class="flex-1 bg-transparent border-none outline-none placeholder:text-gray-400 font-sans"
          :class="showRadius ? 'text-[14px] py-[13px]' : 'text-[15px] py-[18px]'"
          style="color: var(--text-dark);"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onInputKeydown"
        />
      </div>

      <!-- Radius selector (optional) -->
      <template v-if="showRadius">
        <!-- Inner divider -->
        <div
          class="w-px h-7 self-center shrink-0"
          style="background-color: var(--border-soft);"
        />
        <!-- Custom-styled select with chevron overlay -->
        <div class="relative flex items-center shrink-0">
          <select
            v-model="radius"
            class="appearance-none bg-transparent border-none cursor-pointer outline-none text-[14px] font-medium font-sans pl-4 pr-9 h-full"
            style="color: var(--text-mid);"
          >
            <option v-for="r in ['2', '5', '10', '25', '50']" :key="r" :value="r">{{ r }} miles</option>
          </select>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8aab97"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="absolute right-2.5 pointer-events-none"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </template>

      <!-- Search button (flush right inside pill) -->
      <button
        type="button"
        class="search-submit border-none text-white font-semibold cursor-pointer whitespace-nowrap font-sans flex items-center justify-center gap-[7px]"
        :class="showRadius ? 'text-[14px] px-6' : 'text-[15px] px-7'"
        @click="onSubmit"
      >
        <svg
          v-if="showRadius"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span>{{ showRadius ? 'Search' : 'Search Pantries' }}</span>
      </button>
    </div>

    <!-- Autocomplete dropdown -->
    <div
      v-if="isOpen && (isLoading || suggestions.length > 0 || query.trim().length >= 3)"
      id="address-suggestions"
      role="listbox"
      class="absolute top-full left-0 right-0 mt-2 bg-white border border-[var(--border-soft)] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.18)] z-20 text-left"
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
            i === activeIndex ? 'bg-[var(--green-wash)]' : '',
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

<style scoped>
.search-submit {
  background-color: var(--green-dark);
  transition: background-color 0.2s ease;
}
.search-submit:hover {
  background-color: #1a6038;
}
</style>
