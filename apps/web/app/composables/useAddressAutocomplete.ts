export interface AddressSuggestion {
  id: string
  primary: string
  secondary: string
  lat: number
  lon: number
}

interface PhotonProperties {
  name?: string
  street?: string
  housenumber?: string
  city?: string
  state?: string
  country?: string
  postcode?: string
  osm_id: number
  osm_type: string
}

interface PhotonFeature {
  properties: PhotonProperties
  geometry: { coordinates: [number, number] }
}

interface PhotonResponse {
  features: PhotonFeature[]
}

const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 250

export const useAddressAutocomplete = (initialValue = '') => {
  const config = useRuntimeConfig()

  const query = ref(initialValue)
  const suggestions = ref<AddressSuggestion[]>([])
  const isLoading = ref(false)
  const isOpen = ref(false)
  const activeIndex = ref(-1)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null
  let suppressNextWatch = false
  let justSelected = false

  const toSuggestion = (f: PhotonFeature): AddressSuggestion => {
    const p = f.properties
    const street = [p.housenumber, p.street].filter(Boolean).join(' ')
    const primary = street || p.name || p.city || 'Unknown location'
    const secondary = [p.city, p.state, p.country].filter(Boolean).join(', ')
    return {
      id: `${p.osm_type}-${p.osm_id}`,
      primary,
      secondary,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    }
  }

  const fetchSuggestions = async (q: string) => {
    if (abortController) abortController.abort()
    abortController = new AbortController()

    isLoading.value = true
    try {
      const data = await $fetch<PhotonResponse>(`${config.public.photonBase}/api`, {
        params: { q, limit: 5, lang: 'en', countrycode: 'us' },
        signal: abortController.signal,
      })
      suggestions.value = data.features.map(toSuggestion)
      activeIndex.value = -1
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        suggestions.value = []
      }
    } finally {
      isLoading.value = false
    }
  }

  watch(query, (val) => {
    if (suppressNextWatch) {
      suppressNextWatch = false
      return
    }
    justSelected = false
    if (debounceTimer) clearTimeout(debounceTimer)
    const trimmed = val.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      suggestions.value = []
      isLoading.value = false
      if (abortController) abortController.abort()
      return
    }
    isOpen.value = true
    debounceTimer = setTimeout(() => fetchSuggestions(trimmed), DEBOUNCE_MS)
  })

  const open = () => {
    if (justSelected) return
    isOpen.value = true
  }

  const close = () => {
    isOpen.value = false
    activeIndex.value = -1
  }

  const select = (s: AddressSuggestion) => {
    suppressNextWatch = true
    justSelected = true
    query.value = s.secondary ? `${s.primary}, ${s.secondary}` : s.primary
    suggestions.value = []
    close()
  }

  const moveActive = (delta: number) => {
    if (suggestions.value.length === 0) return
    const next = activeIndex.value + delta
    activeIndex.value = Math.max(-1, Math.min(suggestions.value.length - 1, next))
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      open()
      moveActive(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === 'Enter') {
      const active = suggestions.value[activeIndex.value]
      if (active) {
        e.preventDefault()
        select(active)
      }
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return {
    query,
    suggestions,
    isLoading,
    isOpen,
    activeIndex,
    open,
    close,
    select,
    onKeydown,
  }
}
