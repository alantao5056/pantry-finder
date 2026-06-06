<script setup lang="ts">
import type { Pantry } from '@pantry-finder/shared'
import type { DivIcon, Map as LeafletMap, Marker } from 'leaflet'

const props = withDefaults(defineProps<{
  pantries: Pantry[]
  selectedId?: string | null
  // When true, marker popups include a "View Details" button that emits `select`.
  // The detail page (already on the pantry) passes false.
  enableSelect?: boolean
  scrollWheelZoom?: boolean
}>(), {
  selectedId: null,
  enableSelect: true,
  scrollWheelZoom: true,
})

const emit = defineEmits<{
  select: [pantry: Pantry]
}>()

const { isHearted } = useHearts()

const mapEl = ref<HTMLDivElement | null>(null)

// Leaflet objects are intentionally kept out of Vue's reactivity system —
// proxying them breaks internal identity checks. Plain module-scope refs.
let L: typeof import('leaflet') | null = null
let map: LeafletMap | null = null
let markersById: Record<string, Marker> = {}

const US_CENTER: [number, number] = [39.5, -98.35]

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))

const markerColor = (p: Pantry, selected: boolean): string => {
  if (selected) return '#f97316'
  if (isHearted(p.id)) return '#e11d48'
  if (isOpenNow(p.schedules)) return '#1e7a47'
  return '#8aab97'
}

// Teardrop pin with the pantry's first initial (ported from the v2.1 design doc).
const makeIcon = (p: Pantry, selected: boolean): DivIcon => {
  const color = markerColor(p, selected)
  const size = selected ? 44 : 36
  const ring = selected ? '3px solid #fff' : '2.5px solid white'
  const shadow = selected
    ? '0 0 0 3px rgba(249,115,22,0.35), 0 4px 14px rgba(0,0,0,0.25)'
    : '0 3px 10px rgba(0,0,0,0.2)'
  const initial = escapeHtml(p.name.charAt(0).toUpperCase())
  return L!.divIcon({
    className: '',
    html: `<div style="background:${color};color:white;border-radius:50% 50% 50% 0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:${selected ? 17 : 15}px;font-weight:700;box-shadow:${shadow};border:${ring};transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${initial}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
  })
}

// Build the popup body as a real element so the "View Details" listener persists
// across popup open/close — no window globals (unlike the design doc reference).
const makePopup = (p: Pantry): HTMLElement => {
  const wrap = document.createElement('div')
  wrap.style.cssText = "font-family:'DM Sans',sans-serif;min-width:180px"

  const name = document.createElement('strong')
  name.textContent = p.name
  name.style.cssText = "display:block;font-family:'Playfair Display',serif;font-size:14px;color:#1a2e1e"

  const addr = document.createElement('small')
  addr.textContent = p.address
  addr.style.cssText = 'display:block;margin-top:2px;color:#8aab97'

  wrap.append(name, addr)

  if (props.enableSelect) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = 'View Details'
    btn.style.cssText = 'margin-top:10px;background:#1e7a47;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;width:100%;font-family:inherit'
    btn.addEventListener('click', () => emit('select', p))
    wrap.append(btn)
  }
  return wrap
}

const renderMarkers = () => {
  if (!map || !L) return

  for (const m of Object.values(markersById)) m.remove()
  markersById = {}

  const coords: [number, number][] = []
  for (const p of props.pantries) {
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue
    const selected = p.id === props.selectedId
    const marker = L.marker([p.latitude, p.longitude], { icon: makeIcon(p, selected) }).addTo(map)
    marker.bindPopup(makePopup(p))
    markersById[p.id] = marker
    coords.push([p.latitude, p.longitude])
  }

  if (coords.length > 1) {
    map.fitBounds(L.latLngBounds(coords), { padding: [48, 48], maxZoom: 14 })
  } else if (coords.length === 1) {
    map.setView(coords[0]!, 15)
  } else {
    map.setView(US_CENTER, 4)
  }
}

// Re-color markers for the current selection and pan to the selected pantry.
const applySelection = () => {
  if (!map) return
  for (const p of props.pantries) {
    const marker = markersById[p.id]
    if (marker) marker.setIcon(makeIcon(p, p.id === props.selectedId))
  }
  if (props.selectedId) {
    const sel = props.pantries.find(p => p.id === props.selectedId)
    if (sel && typeof sel.latitude === 'number' && typeof sel.longitude === 'number') {
      map.flyTo([sel.latitude, sel.longitude], Math.max(map.getZoom(), 14), { duration: 0.7 })
      markersById[sel.id]?.openPopup()
    }
  }
}

onMounted(async () => {
  if (!import.meta.client || !mapEl.value) return
  L = (await import('leaflet')).default as unknown as typeof import('leaflet')

  map = L.map(mapEl.value, {
    center: US_CENTER,
    zoom: 4,
    scrollWheelZoom: props.scrollWheelZoom,
    zoomControl: true,
  })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

  renderMarkers()
  // Settle layout (flex parents can report 0 height on first paint).
  requestAnimationFrame(() => map?.invalidateSize())
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markersById = {}
})

watch(() => props.pantries, () => renderMarkers())
watch(() => props.selectedId, () => applySelection())
</script>

<template>
  <!-- Size (height/width) is supplied by the consumer: the search view stretches
       this via a flex parent; the detail card passes an explicit h-[240px]. -->
  <div ref="mapEl" class="pantry-map" />
</template>

<style scoped>
/* The root element is also Leaflet's container — its height/width come from the
   consumer's classes (flex stretch on search, h-[240px] on the detail card), so
   we only style appearance here, never size. */
:deep(.leaflet-container) {
  font-family: 'DM Sans', sans-serif;
  background: var(--green-light);
}
:deep(.leaflet-popup-content) {
  margin: 12px 14px;
}
</style>
