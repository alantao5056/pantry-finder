import type { Pantry, Schedule, Service } from '@pantry-finder/shared'
// `pantrySlugId` lives in @pantry-finder/shared so the sitemap generator and the site
// emit byte-identical canonical URLs. Used here only to build/validate detail-page URLs;
// callers go through pantryPath() / isCanonicalPantryParam() rather than the raw helper.
import { pantrySlugId } from '@pantry-finder/shared'

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

export function parseTimeMinutes(t: string): number {
  if (!t) return 0
  const parts = t.trim().split(/\s+/)
  const time = parts[0] ?? ''
  const period = parts[1]
  const [hStr, mStr] = time.split(':')
  let h = Number(hStr)
  const m = Number(mStr ?? '0')
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60 + m
}

export function isOpenNow(schedules: Schedule[], now: Date = new Date()): boolean {
  const today = WEEKDAYS[now.getDay()]
  const minutes = now.getHours() * 60 + now.getMinutes()
  return schedules.some(s =>
    s.weekDay === today && s.start &&
    minutes >= parseTimeMinutes(s.start) && minutes <= parseTimeMinutes(s.end)
  )
}

export function isOpenToday(schedules: Schedule[], now: Date = new Date()): boolean {
  const today = WEEKDAYS[now.getDay()]
  return schedules.some(s => s.weekDay === today && s.start)
}

export function isToday(weekDay: string, now: Date = new Date()): boolean {
  return WEEKDAYS[now.getDay()] === weekDay
}

export function getUniqueFoods(services: Service[]): string[] {
  const foods = new Set<string>()
  for (const s of services) {
    for (const f of s.food) foods.add(f)
  }
  return [...foods]
}

export function getScheduleDays(schedules: Schedule[]): Schedule[] {
  const seen = new Set<string>()
  const out: Schedule[] = []
  for (const s of schedules) {
    if (s.weekDay && s.start && !seen.has(s.weekDay)) {
      seen.add(s.weekDay)
      out.push(s)
    }
  }
  return out
}

export function getUniqueServices(services: Service[]): Service[] {
  const seen = new Set<string>()
  const out: Service[] = []
  for (const s of services) {
    if (s.name && !seen.has(s.name)) {
      seen.add(s.name)
      out.push(s)
    }
  }
  return out
}

// Single source of truth for links to the detail page.
export function pantryPath(pantry: { name: string; id: string }): string {
  return `/pantries/${pantrySlugId(pantry)}`
}

// Recovers the pantry id from a route param. Handles canonical "<slug>-<id>"
// params and legacy bare-"<id>" params. Assumes ids contain no hyphens.
export function extractPantryId(param: string): string {
  const i = param.lastIndexOf('-')
  return i === -1 ? param : param.slice(i + 1)
}

// True when the route param is already the canonical "<slug>-<id>" for this pantry.
// The detail page uses this to decide whether to 301-redirect a bare-id or stale-slug
// param to pantryPath(), without reaching for the slug helper directly.
export function isCanonicalPantryParam(param: string, pantry: { name: string; id: string }): boolean {
  return param === pantrySlugId(pantry)
}

// --- LocalBusiness structured data (JSON-LD) ----------------------------------

const SCHEMA_DAY_OF_WEEK: Record<string, string> = {
  Monday: 'https://schema.org/Monday',
  Tuesday: 'https://schema.org/Tuesday',
  Wednesday: 'https://schema.org/Wednesday',
  Thursday: 'https://schema.org/Thursday',
  Friday: 'https://schema.org/Friday',
  Saturday: 'https://schema.org/Saturday',
  Sunday: 'https://schema.org/Sunday',
}

// Converts a display time like "9:00 AM" to schema.org's expected 24-hour "HH:MM".
// Returns null for anything that doesn't parse cleanly so callers can drop it
// rather than emit a wrong (and penalizable) opening time.
export function formatTime24(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const period = m[3]?.toUpperCase()
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

interface OpeningHoursSpecification {
  '@type': 'OpeningHoursSpecification'
  dayOfWeek: string
  opens: string
  closes: string
}

// Builds schema.org OpeningHoursSpecification entries from pantry schedules.
// Every-other-week slots are skipped: a weekly spec can't express them, and
// claiming weekly hours the pantry doesn't keep would be inaccurate.
export function pantryOpeningHours(schedules: Schedule[]): OpeningHoursSpecification[] {
  const out: OpeningHoursSpecification[] = []
  for (const s of schedules) {
    if (s.isEveryOtherWeek === 'true') continue
    const dayOfWeek = SCHEMA_DAY_OF_WEEK[s.weekDay]
    if (!dayOfWeek) continue
    const opens = formatTime24(s.start)
    const closes = formatTime24(s.end)
    if (!opens || !closes) continue
    out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek, opens, closes })
  }
  return out
}

// Per-pantry LocalBusiness JSON-LD for rich results and local/map visibility.
// `url` is the canonical detail-page URL (also used as the node @id). The address
// is emitted as plain text — the API flattens its parts into one string, and
// re-splitting it would risk mislabeling fields.
export function buildPantryJsonLd(pantry: Pantry, url: string): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${url}#localbusiness`,
    name: pantry.name,
    url,
    address: pantry.address,
  }
  if (Number.isFinite(pantry.latitude) && Number.isFinite(pantry.longitude)) {
    ld.geo = {
      '@type': 'GeoCoordinates',
      latitude: pantry.latitude,
      longitude: pantry.longitude,
    }
  }
  if (pantry.phone) ld.telephone = pantry.phone
  if (pantry.about) ld.description = pantry.about
  const hours = pantryOpeningHours(pantry.schedules)
  if (hours.length) ld.openingHoursSpecification = hours
  return ld
}

// Tone class for a service category. The class sets the --tone-* variables that
// .service-chip / .service-dot / .service-program / .service-panel read (main.css).
export function serviceTone(category: string): string {
  if (category === 'Food Program') return 'service-tone--food'
  if (category === 'Healthcare Screenings/Referrals') return 'service-tone--health'
  if (category === 'Housing Assistance') return 'service-tone--housing'
  return 'service-tone--other'
}

export const ALL_DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

export function getAllFoodTypes(pantries: Pantry[]): string[] {
  const set = new Set<string>()
  for (const p of pantries) {
    for (const s of p.services) {
      for (const f of s.food) set.add(f)
    }
  }
  return [...set].sort()
}

export interface PantryFilters {
  day: string[]
  foodType: string[]
  openNow: boolean
}

export const EMPTY_FILTERS: PantryFilters = { day: [], foodType: [], openNow: false }

export function pantryMatchesFilters(
  p: Pantry,
  f: PantryFilters,
  now: Date = new Date(),
): boolean {
  if (f.day.length && !p.schedules.some(s => s.start && f.day.includes(s.weekDay))) return false
  if (
    f.foodType.length
    && !p.services.some(s => s.food.some(food => f.foodType.includes(food)))
  ) return false
  if (f.openNow && !isOpenNow(p.schedules, now)) return false
  return true
}

export function countActiveFilters(f: PantryFilters): number {
  return f.day.length + f.foodType.length + (f.openNow ? 1 : 0)
}
