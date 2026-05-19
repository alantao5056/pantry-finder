<script setup lang="ts">
definePageMeta({
  validate: () => import.meta.dev,
})

interface CallResult {
  status: 'idle' | 'loading' | 'success' | 'error'
  durationMs?: number
  raw?: unknown
  parsed?: unknown
  error?: string
}

const newResult = (): CallResult => ({ status: 'idle' })

const bigDataCloud = ref<CallResult>(newResult())
const countryIs = ref<CallResult>(newResult())
const ipapiCo = ref<CallResult>(newResult())
const geonames = ref<CallResult>(newResult())
const overpass = ref<CallResult>(newResult())

const lat = ref('42.337')
const lon = ref('-71.209')
const geonamesUser = String(useRuntimeConfig().public.geonamesUser ?? '')

const time = async <T>(fn: () => Promise<T>): Promise<{ value: T; durationMs: number }> => {
  const start = performance.now()
  const value = await fn()
  return { value, durationMs: Math.round(performance.now() - start) }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

const runBigDataCloud = async () => {
  bigDataCloud.value = { status: 'loading' }
  try {
    const { value: d, durationMs } = await time(() =>
      $fetch<{
        city?: string
        locality?: string
        postcode?: string
        principalSubdivision?: string
        principalSubdivisionCode?: string
        countryCode?: string
        latitude?: number
        longitude?: number
      }>('https://api.bigdatacloud.net/data/reverse-geocode-client', { retry: 0, timeout: 5000 })
    )
    const prefix = `${d.countryCode}-`
    const region_code = d.principalSubdivisionCode?.startsWith(prefix)
      ? d.principalSubdivisionCode.slice(prefix.length)
      : d.principalSubdivisionCode
    bigDataCloud.value = {
      status: 'success',
      durationMs,
      raw: d,
      parsed: {
        city: d.city || d.locality,
        region_code,
        postal: d.postcode,
        country_code: d.countryCode,
        latitude: d.latitude,
        longitude: d.longitude,
      },
    }
  } catch (e: unknown) {
    bigDataCloud.value = { status: 'error', error: errMsg(e) }
  }
}

const runCountryIs = async () => {
  countryIs.value = { status: 'loading' }
  try {
    const { value: d, durationMs } = await time(() =>
      $fetch<{
        country?: string
        city?: string
        subdivision?: string
        postal?: string
        location?: { latitude?: number; longitude?: number }
      }>('https://api.country.is/?fields=city,subdivision,postal,location', { retry: 0, timeout: 5000 })
    )
    countryIs.value = {
      status: 'success',
      durationMs,
      raw: d,
      parsed: {
        city: d.city,
        region_code: d.subdivision,
        postal: d.postal,
        country_code: d.country,
        latitude: d.location?.latitude,
        longitude: d.location?.longitude,
      },
    }
  } catch (e: unknown) {
    countryIs.value = { status: 'error', error: errMsg(e) }
  }
}

const runIpapiCo = async () => {
  ipapiCo.value = { status: 'loading' }
  try {
    const { value: d, durationMs } = await time(() =>
      $fetch<{
        city?: string
        region?: string
        region_code?: string
        postal?: string
        country_code?: string
        latitude?: number
        longitude?: number
        error?: boolean
        reason?: string
        reserved?: boolean
      }>('https://ipapi.co/json/', { retry: 0, timeout: 5000 })
    )
    if (d.error) {
      ipapiCo.value = { status: 'error', durationMs, raw: d, error: d.reason || 'service returned error:true' }
      return
    }
    ipapiCo.value = {
      status: 'success',
      durationMs,
      raw: d,
      parsed: {
        city: d.city,
        region_code: d.region_code,
        postal: d.postal,
        country_code: d.country_code,
        latitude: d.latitude,
        longitude: d.longitude,
        reserved: d.reserved,
      },
    }
  } catch (e: unknown) {
    ipapiCo.value = { status: 'error', error: errMsg(e) }
  }
}

const runGeoNames = async () => {
  geonames.value = { status: 'loading' }
  if (!geonamesUser) {
    geonames.value = { status: 'error', error: 'NUXT_PUBLIC_GEONAMES_USER is not set in runtimeConfig' }
    return
  }
  try {
    const latNum = Number(lat.value)
    const lonNum = Number(lon.value)
    const { value: d, durationMs } = await time(() =>
      $fetch<{
        geonames?: Array<{ name?: string; adminCode1?: string; countryCode?: string; distance?: string }>
        status?: { message?: string; value?: number }
      }>('https://secure.geonames.org/findNearbyPlaceNameJSON', {
        params: {
          lat: latNum,
          lng: lonNum,
          radius: 30,
          cities: 'cities1000',
          maxRows: 15,
          country: 'US',
          username: geonamesUser,
        },
        retry: 0,
        timeout: 5000,
      })
    )
    if (d.status) {
      geonames.value = { status: 'error', durationMs, raw: d, error: d.status.message || 'GeoNames returned a status block (usually means quota or invalid username)' }
      return
    }
    geonames.value = {
      status: 'success',
      durationMs,
      raw: d,
      parsed: (d.geonames ?? []).map((g) => ({
        name: g.name,
        state: g.adminCode1,
        country: g.countryCode,
        distance_km: g.distance,
      })),
    }
  } catch (e: unknown) {
    geonames.value = { status: 'error', error: errMsg(e) }
  }
}

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const runOverpass = async () => {
  overpass.value = { status: 'loading' }
  try {
    const latNum = Number(lat.value)
    const lonNum = Number(lon.value)
    const body = `[out:json][timeout:5];node(around:30000,${latNum},${lonNum})["place"~"^(city|town|village|suburb)$"];out qt 50;`
    const { value: d, durationMs } = await time(() =>
      $fetch<{
        elements?: Array<{ lat?: number; lon?: number; tags?: { name?: string; place?: string } }>
      }>('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'text/plain' },
        retry: 0,
        timeout: 8000,
      })
    )
    const sorted = (d.elements ?? [])
      .filter((el) => typeof el.lat === 'number' && typeof el.lon === 'number' && typeof el.tags?.name === 'string')
      .map((el) => ({
        name: el.tags!.name as string,
        place: el.tags!.place,
        distance_km: Number(haversineKm(latNum, lonNum, el.lat as number, el.lon as number).toFixed(2)),
      }))
      .sort((a, b) => a.distance_km - b.distance_km)
    overpass.value = {
      status: 'success',
      durationMs,
      raw: d,
      parsed: sorted,
    }
  } catch (e: unknown) {
    overpass.value = { status: 'error', error: errMsg(e) }
  }
}

const runAll = async () => {
  await Promise.all([runBigDataCloud(), runCountryIs(), runIpapiCo(), runGeoNames(), runOverpass()])
}

const statusClass = (s: CallResult['status']) =>
  s === 'success' ? 'bg-emerald-100 text-emerald-800'
  : s === 'error' ? 'bg-red-100 text-red-800'
  : s === 'loading' ? 'bg-amber-100 text-amber-800'
  : 'bg-gray-100 text-gray-600'
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto" style="color: var(--text-dark);">
    <h1 class="text-2xl font-semibold mb-1">Geolocation API Test</h1>
    <p class="text-sm mb-5" style="color: var(--text-soft);">Exercises the 5 external APIs used by <code>useNearbyTags</code>.</p>

    <button
      type="button"
      class="mb-8 px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-medium"
      @click="runAll"
    >Run all</button>

    <section class="mb-10">
      <h2 class="text-lg font-semibold mb-3">Stage 1 — IP → Location (uses visitor's IP)</h2>

      <div class="border rounded p-4 mb-3 bg-white">
        <div class="flex items-center gap-3 mb-2">
          <span class="font-semibold">BigDataCloud (primary)</span>
          <span class="text-xs px-2 py-0.5 rounded" :class="statusClass(bigDataCloud.status)">{{ bigDataCloud.status }}</span>
          <span v-if="bigDataCloud.durationMs !== undefined" class="text-xs" style="color: var(--text-soft);">{{ bigDataCloud.durationMs }}ms</span>
          <button type="button" class="ml-auto text-xs px-3 py-1 border rounded hover:bg-gray-50" @click="runBigDataCloud">Run</button>
        </div>
        <div class="text-xs font-mono mb-2 break-all" style="color: var(--text-soft);">GET https://api.bigdatacloud.net/data/reverse-geocode-client</div>
        <div v-if="bigDataCloud.error" class="text-sm text-red-700 bg-red-50 rounded p-2 mb-2">{{ bigDataCloud.error }}</div>
        <div v-if="bigDataCloud.parsed" class="mb-2">
          <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--text-soft);">Parsed</div>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto">{{ JSON.stringify(bigDataCloud.parsed, null, 2) }}</pre>
        </div>
        <details v-if="bigDataCloud.raw">
          <summary class="text-xs uppercase tracking-wide cursor-pointer" style="color: var(--text-soft);">Raw response</summary>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto mt-1 max-h-80">{{ JSON.stringify(bigDataCloud.raw, null, 2) }}</pre>
        </details>
      </div>

      <div class="border rounded p-4 mb-3 bg-white">
        <div class="flex items-center gap-3 mb-2">
          <span class="font-semibold">country.is (fallback 1)</span>
          <span class="text-xs px-2 py-0.5 rounded" :class="statusClass(countryIs.status)">{{ countryIs.status }}</span>
          <span v-if="countryIs.durationMs !== undefined" class="text-xs" style="color: var(--text-soft);">{{ countryIs.durationMs }}ms</span>
          <button type="button" class="ml-auto text-xs px-3 py-1 border rounded hover:bg-gray-50" @click="runCountryIs">Run</button>
        </div>
        <div class="text-xs font-mono mb-2 break-all" style="color: var(--text-soft);">GET https://api.country.is/?fields=city,subdivision,postal,location</div>
        <div v-if="countryIs.error" class="text-sm text-red-700 bg-red-50 rounded p-2 mb-2">{{ countryIs.error }}</div>
        <div v-if="countryIs.parsed" class="mb-2">
          <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--text-soft);">Parsed</div>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto">{{ JSON.stringify(countryIs.parsed, null, 2) }}</pre>
        </div>
        <details v-if="countryIs.raw">
          <summary class="text-xs uppercase tracking-wide cursor-pointer" style="color: var(--text-soft);">Raw response</summary>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto mt-1 max-h-80">{{ JSON.stringify(countryIs.raw, null, 2) }}</pre>
        </details>
      </div>

      <div class="border rounded p-4 mb-3 bg-white">
        <div class="flex items-center gap-3 mb-2">
          <span class="font-semibold">ipapi.co (fallback 2)</span>
          <span class="text-xs px-2 py-0.5 rounded" :class="statusClass(ipapiCo.status)">{{ ipapiCo.status }}</span>
          <span v-if="ipapiCo.durationMs !== undefined" class="text-xs" style="color: var(--text-soft);">{{ ipapiCo.durationMs }}ms</span>
          <button type="button" class="ml-auto text-xs px-3 py-1 border rounded hover:bg-gray-50" @click="runIpapiCo">Run</button>
        </div>
        <div class="text-xs font-mono mb-2 break-all" style="color: var(--text-soft);">GET https://ipapi.co/json/</div>
        <div v-if="ipapiCo.error" class="text-sm text-red-700 bg-red-50 rounded p-2 mb-2">{{ ipapiCo.error }}</div>
        <div v-if="ipapiCo.parsed" class="mb-2">
          <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--text-soft);">Parsed</div>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto">{{ JSON.stringify(ipapiCo.parsed, null, 2) }}</pre>
        </div>
        <details v-if="ipapiCo.raw">
          <summary class="text-xs uppercase tracking-wide cursor-pointer" style="color: var(--text-soft);">Raw response</summary>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto mt-1 max-h-80">{{ JSON.stringify(ipapiCo.raw, null, 2) }}</pre>
        </details>
      </div>
    </section>

    <section class="mb-10">
      <h2 class="text-lg font-semibold mb-3">Stage 2 — Lat/Lon → Nearby Cities</h2>
      <div class="flex flex-wrap gap-3 mb-4 items-center">
        <label class="text-sm">Lat <input v-model="lat" class="border rounded px-2 py-1 ml-1 w-32 font-mono" /></label>
        <label class="text-sm">Lon <input v-model="lon" class="border rounded px-2 py-1 ml-1 w-32 font-mono" /></label>
        <span class="text-xs" style="color: var(--text-soft);">Default = Newton, MA. Copy bigdatacloud's latitude/longitude here for a chained run.</span>
      </div>

      <div class="border rounded p-4 mb-3 bg-white">
        <div class="flex items-center gap-3 mb-2">
          <span class="font-semibold">GeoNames (primary)</span>
          <span class="text-xs px-2 py-0.5 rounded" :class="statusClass(geonames.status)">{{ geonames.status }}</span>
          <span v-if="geonames.durationMs !== undefined" class="text-xs" style="color: var(--text-soft);">{{ geonames.durationMs }}ms</span>
          <span class="text-xs" style="color: var(--text-soft);">username: <code>{{ geonamesUser || 'NOT SET' }}</code></span>
          <button type="button" class="ml-auto text-xs px-3 py-1 border rounded hover:bg-gray-50" @click="runGeoNames">Run</button>
        </div>
        <div class="text-xs font-mono mb-2 break-all" style="color: var(--text-soft);">GET https://secure.geonames.org/findNearbyPlaceNameJSON?lat=&amp;lng=&amp;radius=30&amp;cities=cities1000&amp;maxRows=15&amp;country=US&amp;username=…</div>
        <div v-if="geonames.error" class="text-sm text-red-700 bg-red-50 rounded p-2 mb-2">{{ geonames.error }}</div>
        <div v-if="geonames.parsed" class="mb-2">
          <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--text-soft);">Parsed ({{ Array.isArray(geonames.parsed) ? geonames.parsed.length : 0 }} results)</div>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto max-h-80">{{ JSON.stringify(geonames.parsed, null, 2) }}</pre>
        </div>
        <details v-if="geonames.raw">
          <summary class="text-xs uppercase tracking-wide cursor-pointer" style="color: var(--text-soft);">Raw response</summary>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto mt-1 max-h-96">{{ JSON.stringify(geonames.raw, null, 2) }}</pre>
        </details>
      </div>

      <div class="border rounded p-4 mb-3 bg-white">
        <div class="flex items-center gap-3 mb-2">
          <span class="font-semibold">Overpass (fallback)</span>
          <span class="text-xs px-2 py-0.5 rounded" :class="statusClass(overpass.status)">{{ overpass.status }}</span>
          <span v-if="overpass.durationMs !== undefined" class="text-xs" style="color: var(--text-soft);">{{ overpass.durationMs }}ms</span>
          <button type="button" class="ml-auto text-xs px-3 py-1 border rounded hover:bg-gray-50" @click="runOverpass">Run</button>
        </div>
        <div class="text-xs font-mono mb-2 break-all" style="color: var(--text-soft);">POST https://overpass-api.de/api/interpreter — node(around:30000,lat,lon)["place"~"^(city|town|village|suburb)$"]</div>
        <div v-if="overpass.error" class="text-sm text-red-700 bg-red-50 rounded p-2 mb-2">{{ overpass.error }}</div>
        <div v-if="overpass.parsed" class="mb-2">
          <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--text-soft);">Parsed ({{ Array.isArray(overpass.parsed) ? overpass.parsed.length : 0 }} results, distance-sorted)</div>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto max-h-80">{{ JSON.stringify(overpass.parsed, null, 2) }}</pre>
        </div>
        <details v-if="overpass.raw">
          <summary class="text-xs uppercase tracking-wide cursor-pointer" style="color: var(--text-soft);">Raw response</summary>
          <pre class="text-xs bg-gray-50 rounded p-2 overflow-x-auto mt-1 max-h-96">{{ JSON.stringify(overpass.raw, null, 2) }}</pre>
        </details>
      </div>
    </section>
  </div>
</template>
