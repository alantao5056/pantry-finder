<script setup lang="ts">
const props = withDefaults(defineProps<{
  initialAddress?: string
  initialRadius?: string
  variant?: 'light' | 'dark'
}>(), {
  initialAddress: '',
  initialRadius: '5',
  variant: 'dark',
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

const isDark = computed(() => props.variant === 'dark')
</script>

<template>
  <div class="relative w-full">
    <div
      :class="[
        'flex gap-2 rounded-[18px] p-2',
        isDark
          ? 'bg-white/[0.08] backdrop-blur-[16px] border border-white/20 shadow-[0_20px_60px_rgba(0,0,0,0.2)]'
          : 'bg-white border border-cream-dark shadow-[0_2px_12px_rgba(28,69,50,0.06)]',
      ]"
    >
      <!-- Address input -->
      <div
        :class="[
          'flex-1 flex items-center gap-2.5 rounded-xl px-4',
          isDark ? 'bg-white/[0.12]' : 'bg-cream',
        ]"
      >
        <UIcon
          name="i-lucide-map-pin"
          :class="['size-[18px] shrink-0', isDark ? 'text-forest-300' : 'text-forest-500']"
        />
        <input
          v-model="query"
          type="text"
          placeholder="Enter address or city..."
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="isOpen"
          aria-controls="address-suggestions"
          :aria-activedescendant="activeIndex >= 0 ? `address-suggestion-${activeIndex}` : undefined"
          :class="[
            'flex-1 bg-transparent border-none outline-none text-[15px] py-3.5',
            isDark
              ? 'text-white placeholder:text-white/50'
              : 'text-gray-900 placeholder:text-gray-400',
          ]"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onInputKeydown"
        />
      </div>

      <!-- Radius selector -->
      <select
        v-model="radius"
        :class="[
          'border-none rounded-xl text-sm px-4 cursor-pointer outline-none appearance-none min-w-[100px]',
          isDark ? 'radius-select-dark bg-white/[0.12] text-white' : 'bg-cream text-gray-900',
        ]"
      >
        <option v-for="r in ['2', '5', '10', '25', '50']" :key="r" :value="r">{{ r }} miles</option>
      </select>

      <!-- Search button -->
      <button
        type="button"
        class="rounded-xl text-white px-6 py-3.5 text-[15px] font-semibold flex items-center gap-2 whitespace-nowrap hover:opacity-90 transition-opacity"
        style="background: linear-gradient(135deg, #52B788, #2D6A4F)"
        @click="onSubmit"
      >
        <UIcon name="i-lucide-search" class="size-[18px]" />
        Search
      </button>
    </div>

    <!-- Autocomplete dropdown -->
    <div
      v-if="isOpen && (isLoading || suggestions.length > 0 || query.trim().length >= 3)"
      id="address-suggestions"
      role="listbox"
      :class="[
        'absolute top-full left-0 right-0 mt-2 backdrop-blur-[16px] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.25)] z-20 text-left',
        isDark
          ? 'bg-forest-700/80 border border-white/20'
          : 'bg-white border border-cream-dark',
      ]"
    >
      <!-- Loading -->
      <div
        v-if="isLoading"
        :class="[
          'flex items-center gap-2.5 px-4 py-3 text-[14px]',
          isDark ? 'text-white/70' : 'text-gray-500',
        ]"
      >
        <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
        <span>Searching…</span>
      </div>

      <!-- Empty -->
      <div
        v-else-if="suggestions.length === 0"
        :class="['px-4 py-3 text-[14px]', isDark ? 'text-white/60' : 'text-gray-400']"
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
            isDark
              ? i === activeIndex
                ? 'bg-white/[0.12]'
                : 'hover:bg-white/[0.08]'
              : i === activeIndex
                ? 'bg-cream'
                : 'hover:bg-cream-muted',
          ]"
          @mousedown.prevent="select(s)"
          @mouseenter="activeIndex = i"
        >
          <UIcon
            name="i-lucide-map-pin"
            :class="['size-4 shrink-0 mt-0.5', isDark ? 'text-forest-300' : 'text-forest-500']"
          />
          <div class="min-w-0 flex-1">
            <div :class="['text-[14px] truncate', isDark ? 'text-white' : 'text-gray-900']">{{ s.primary }}</div>
            <div
              v-if="s.secondary"
              :class="['text-[12px] truncate', isDark ? 'text-white/60' : 'text-gray-500']"
            >{{ s.secondary }}</div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.radius-select-dark option {
  background: #1C4532;
  color: white;
}
</style>
