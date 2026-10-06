interface IpApiResponse {
  city?: string
  region?: string
  region_code?: string
  postal?: string
  country_code?: string
  latitude?: number
  longitude?: number
  error?: boolean
  reserved?: boolean
  success?: boolean
}

const tryBigDataCloud = async (): Promise<IpApiResponse | null> => {
  try {
    const d = await $fetch<{
      city?: string
      locality?: string
      postcode?: string
      principalSubdivision?: string
      principalSubdivisionCode?: string
      countryCode?: string
      latitude?: number
      longitude?: number
    }>('https://api.bigdatacloud.net/data/reverse-geocode-client', { timeout: 3000, retry: 0 })
    if (!d.countryCode) return null
    const prefix = `${d.countryCode}-`
    const region_code = d.principalSubdivisionCode?.startsWith(prefix)
      ? d.principalSubdivisionCode.slice(prefix.length)
      : d.principalSubdivisionCode
    return {
      city: d.city || d.locality,
      region: d.principalSubdivision,
      region_code,
      postal: d.postcode,
      country_code: d.countryCode,
      latitude: d.latitude,
      longitude: d.longitude,
    }
  } catch {
    return null
  }
}

const tryCountryIs = async (): Promise<IpApiResponse | null> => {
  try {
    const d = await $fetch<{
      country?: string
      city?: string
      subdivision?: string
      postal?: string
      location?: { latitude?: number; longitude?: number }
    }>('https://api.country.is/?fields=city,subdivision,postal,location', {
      timeout: 3000,
      retry: 0,
    })
    if (!d.country) return null
    return {
      city: d.city,
      region_code: d.subdivision,
      postal: d.postal,
      country_code: d.country,
      latitude: d.location?.latitude,
      longitude: d.location?.longitude,
    }
  } catch {
    return null
  }
}

const tryIpapiCo = async (): Promise<IpApiResponse | null> => {
  try {
    const d = await $fetch<IpApiResponse>('https://ipapi.co/json/', { timeout: 3000, retry: 0 })
    if (d.error || d.reserved || !d.country_code) return null
    return d
  } catch {
    return null
  }
}

const fetchIpData = async (): Promise<IpApiResponse | null> => {
  return (await tryBigDataCloud()) ?? (await tryCountryIs()) ?? (await tryIpapiCo())
}

interface GeoNameRecord {
  name?: string
  adminCode1?: string
  countryCode?: string
}

interface GeoNamesResponse {
  geonames?: GeoNameRecord[]
  status?: { message?: string; value?: number }
}

interface OverpassElement {
  lat?: number
  lon?: number
  tags?: { name?: string; place?: string }
}

interface OverpassResponse {
  elements?: OverpassElement[]
}

const CACHE_IP_KEY = 'pf:nearby-tags:ip:v1'
const CACHE_NEIGHBORS_KEY = 'pf:nearby-tags:neighbors:v1'
const MAX_TAGS = 5
const NEARBY_RADIUS_KM = 30

interface IpResolution {
  tags: string[]
  lat: number | null
  lon: number | null
  city: string | null
  regionCode: string | null
}

const readIpCache = (): IpResolution | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_IP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<IpResolution> | null
    if (
      parsed &&
      Array.isArray(parsed.tags) &&
      parsed.tags.every((t) => typeof t === 'string')
    ) {
      return parsed as IpResolution
    }
    return null
  } catch {
    return null
  }
}

const writeIpCache = (value: IpResolution) => {
  try {
    sessionStorage.setItem(CACHE_IP_KEY, JSON.stringify(value))
  } catch {
    // sessionStorage may be unavailable (Safari private mode, etc.) — silently skip
  }
}

const readNeighborsCache = (): string[] | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_NEIGHBORS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed as string[]
    }
    return null
  } catch {
    return null
  }
}

const writeNeighborsCache = (value: string[]) => {
  try {
    sessionStorage.setItem(CACHE_NEIGHBORS_KEY, JSON.stringify(value))
  } catch {
    // sessionStorage may be unavailable (Safari private mode, etc.) — silently skip
  }
}

const resolveIp = (data: IpApiResponse): IpResolution => {
  const empty: IpResolution = { tags: [], lat: null, lon: null, city: null, regionCode: null }
  if (data.error || data.reserved) return empty
  if (data.country_code !== 'US') return empty

  const tags: string[] = []
  if (data.city && data.region_code) tags.push(`${data.city} ${data.region_code}`)
  if (data.postal) tags.push(data.postal)

  return {
    tags,
    lat: data.latitude ?? null,
    lon: data.longitude ?? null,
    city: data.city ?? null,
    regionCode: data.region_code ?? null,
  }
}

const fetchFromGeoNames = async (
  lat: number,
  lon: number,
  regionCode: string,
  ownCity: string | null,
  username: string,
  max: number,
): Promise<string[] | null> => {
  if (!username) return null
  try {
    const data = await $fetch<GeoNamesResponse>('https://secure.geonames.org/findNearbyPlaceNameJSON', {
      params: {
        lat,
        lng: lon,
        radius: NEARBY_RADIUS_KM,
        cities: 'cities1000',
        maxRows: 15,
        country: 'US',
        username,
      },
      timeout: 20000,
      retry: 0,
    })
    if (!data.geonames || data.status) return null

    const seen = new Set<string>()
    if (ownCity) seen.add(ownCity.toLowerCase())
    const out: string[] = []
    for (const r of data.geonames) {
      if (out.length >= max) break
      if (!r.name || !r.adminCode1) continue
      if (r.countryCode !== 'US') continue
      if (r.adminCode1 !== regionCode) continue
      const key = r.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(`${r.name} ${r.adminCode1}`)
    }
    return out
  } catch {
    return null
  }
}

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const fetchFromOverpass = async (
  lat: number,
  lon: number,
  regionCode: string,
  ownCity: string | null,
  max: number,
): Promise<string[] | null> => {
  const radiusMeters = NEARBY_RADIUS_KM * 1000
  const body = `[out:json][timeout:5];node(around:${radiusMeters},${lat},${lon})["place"~"^(city|town|village|suburb)$"];out qt 50;`
  try {
    const data = await $fetch<OverpassResponse>('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain' },
      timeout: 20000,
      retry: 0,
    })
    if (!data.elements) return null

    const sorted = data.elements
      .filter(
        (el): el is OverpassElement & { lat: number; lon: number; tags: { name: string } } =>
          typeof el.lat === 'number' &&
          typeof el.lon === 'number' &&
          typeof el.tags?.name === 'string',
      )
      .map((el) => ({ name: el.tags.name, distance: haversineKm(lat, lon, el.lat, el.lon) }))
      .sort((a, b) => a.distance - b.distance)

    const seen = new Set<string>()
    if (ownCity) seen.add(ownCity.toLowerCase())
    const out: string[] = []
    for (const r of sorted) {
      if (out.length >= max) break
      const key = r.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(`${r.name} ${regionCode}`)
    }
    return out
  } catch {
    return null
  }
}

let pendingLoad: Promise<void> | null = null

export const useNearbyTags = () => {
  const config = useRuntimeConfig()
  const tags = useState<string[]>('nearby-tags', () => [])

  const load = async () => {
    // Step 1 — IP-derived tags. Cached independently; no write on failure.
    let resolved = readIpCache()
    if (!resolved) {
      const ipData = await fetchIpData()
      if (!ipData) return
      resolved = resolveIp(ipData)
      if (resolved.tags.length === 0) return
      writeIpCache(resolved)
    }

    tags.value = [...resolved.tags]

    const slotsLeft = MAX_TAGS - resolved.tags.length
    if (
      slotsLeft <= 0 ||
      resolved.lat === null ||
      resolved.lon === null ||
      !resolved.regionCode
    ) {
      return
    }

    // Step 2 — neighbor tags. Cached independently; no write on failure.
    const cachedNeighbors = readNeighborsCache()
    if (cachedNeighbors) {
      tags.value = [...resolved.tags, ...cachedNeighbors]
      return
    }

    let neighbors = await fetchFromOverpass(
      resolved.lat,
      resolved.lon,
      resolved.regionCode,
      resolved.city,
      slotsLeft,
    )
    if (!neighbors || neighbors.length === 0) {
      const username = String(config.public.geonamesUser ?? '')
      neighbors = await fetchFromGeoNames(
        resolved.lat,
        resolved.lon,
        resolved.regionCode,
        resolved.city,
        username,
        slotsLeft,
      )
    }
    if (neighbors && neighbors.length > 0) {
      tags.value = [...resolved.tags, ...neighbors]
      writeNeighborsCache(neighbors)
    }
  }

  onMounted(() => {
    pendingLoad ??= load().finally(() => { pendingLoad = null })
  })

  return { tags }
}
