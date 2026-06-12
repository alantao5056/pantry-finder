// Site-wide stats (total pantries + distinct cities) shown on the landing page.
// The raw counts in site-stats.json are generated from Firestore by the sitemap tool
// (`npm run generate:prod` in tools/sitemap) — see generate-sitemap.ts there. Read them from here
// (auto-imported) rather than hardcoding the numbers in components.
import stats from '~/data/site-stats.json'

export interface SiteStats {
  pantryCount: number
  cityCount: number
  generatedAt: string | null
}

export const siteStats: SiteStats = stats

// The counts are already rounded down to clean figures by the sitemap tool, so here we
// just thousands-format them and append "+" for display (e.g. 14000 -> "14,000+").
function statDisplay(n: number): string {
  return `${n.toLocaleString('en-US')}+`
}

export const pantryCountDisplay = statDisplay(siteStats.pantryCount)
export const cityCountDisplay = statDisplay(siteStats.cityCount)
