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

export function dayColor(day: string): string {
  const colors: Record<string, string> = {
    Monday: '#2563eb',
    Tuesday: '#7c3aed',
    Wednesday: '#0891b2',
    Thursday: '#059669',
    Friday: '#ca8a04',
    Saturday: '#dc2626',
    Sunday: '#9333ea',
  }
  return colors[day] ?? '#0e7490'
}

export function serviceColorClasses(category: string): string {
  if (category === 'Food Program') return 'bg-[var(--green-light)] text-[var(--green-dark)] border-[var(--green-soft)]'
  if (category === 'Healthcare Screenings/Referrals') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (category === 'Housing Assistance') return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-violet-50 text-violet-700 border-violet-200'
}

const FOOD_EMOJI: Record<string, string> = {
  'Dairy': '🥛',
  'Eggs': '🥚',
  'Fruits & Vegetables': '🥦',
  'Meat': '🥩',
  'Shelf Stable/Non-Perishable Goods': '🥫',
  'Prepared Food / Grab and Go': '🍱',
  'Household Products': '🧹',
  'Toiletries / Hygiene Products': '🧴',
  'Pet Food / Supplies': '🐾',
  'Diapers': '👶',
  'Other': '📦',
}

export function foodEmoji(food: string): string {
  return FOOD_EMOJI[food] ?? '🍽️'
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
