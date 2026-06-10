import type { Pantry } from '@pantry-finder/shared'
import { slugify, US_STATES } from '@pantry-finder/shared'

// Validity gate for the dynamic /food-pantries/[state] routes — slugs outside
// the shared US_STATES map 404 before hitting the API. Re-exported so pages
// can use it via Nuxt auto-imports.
export { US_STATES }

// Single source of truth for links to the directory pages.
export function statePath(stateSlug: string): string {
  return `/food-pantries/${stateSlug}`
}

export function cityPath(stateSlug: string, citySlug: string): string {
  return `/food-pantries/${stateSlug}/${citySlug}`
}

// City-page path derived from a pantry's own city/state fields, for the
// detail-page breadcrumb. Null when the pantry lacks usable location fields.
export function cityPathForPantry(pantry: Pantry): string | null {
  if (!pantry.city || !pantry.state) return null
  const stateSlug = pantry.state.trim().toLowerCase()
  const citySlug = slugify(pantry.city)
  if (!citySlug || !US_STATES[stateSlug]) return null
  return cityPath(stateSlug, citySlug)
}

// --- Structured data (JSON-LD) -------------------------------------------------

export interface BreadcrumbEntry {
  name: string
  /** Absolute URL. Omit for the final (current-page) crumb. */
  url?: string
}

export function buildBreadcrumbJsonLd(entries: BreadcrumbEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: entries.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      ...(entry.url ? { item: entry.url } : {}),
    })),
  }
}

// CollectionPage + ItemList for a directory page. Entries carry name + URL
// only — the full LocalBusiness node lives on each pantry's detail page, so
// listing pages must not emit duplicate entities.
export function buildCollectionJsonLd(opts: {
  name: string
  description: string
  /** Absolute canonical URL of the listing page (also used as the @id base). */
  url: string
  items: { name: string; url: string }[]
  /** Total items across all pages (defaults to items.length). */
  totalCount?: number
  /** 1-based position of the first item (for paginated pages). */
  startPosition?: number
}): Record<string, unknown> {
  const start = opts.startPosition ?? 1
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${opts.url}#collection`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.totalCount ?? opts.items.length,
      itemListElement: opts.items.map((item, i) => ({
        '@type': 'ListItem',
        position: start + i,
        name: item.name,
        url: item.url,
      })),
    },
  }
}
