import type { MaybeRefOrGetter } from 'vue'

interface PageSeoOptions {
  /** Document <title>. Treated as a bare title — app.vue's global titleTemplate
   *  appends " - PantryFinder" — unless `brandSuffix` is false. */
  title: MaybeRefOrGetter<string>
  /** Meta description; also used verbatim as og:description. */
  description: MaybeRefOrGetter<string>
  /** Site-relative path for the canonical link + og:url, e.g. '/', '/search'. */
  path: MaybeRefOrGetter<string>
  /** Set false when `title` already includes the brand (home page): disables the
   *  global titleTemplate for this route so " - PantryFinder" isn't appended twice. */
  brandSuffix?: boolean
}

export const usePageSeo = (opts: PageSeoOptions) => {
  const { brandSuffix = true } = opts
  // Resolve origin once, in setup — useRequestURL() must not run lazily during
  // head resolution (it runs outside the setup context).
  const origin = useRequestURL().origin

  const canonicalUrl = computed(() => `${origin}${toValue(opts.path)}`)
  // titleTemplate does NOT apply to OG tags, so build the fully-qualified ogTitle here.
  const ogTitle = computed(() => {
    const t = toValue(opts.title)
    return brandSuffix ? `${t} - PantryFinder` : t
  })

  useSeoMeta({
    title: () => toValue(opts.title),
    description: () => toValue(opts.description),
    ogTitle: () => ogTitle.value,
    ogDescription: () => toValue(opts.description),
    ogType: 'website',
    ogUrl: () => canonicalUrl.value,
    // Facebook renders og:image as a large card regardless of declared
    // dimensions (verified via the Sharing Debugger — the compact-thumbnail
    // layout no longer exists), so ship a designed 1200×630 banner instead of
    // letting it blow up the square logo. Regenerate the asset with
    // tools/generate-og-card.ps1.
    ogImage: () => `${origin}/og-card.png`,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: 'PantryFinder — Find free food pantries near you',
    // 'summary_large_image' pairs with the 1.91:1 banner; the plain 'summary'
    // card would square-crop it.
    twitterCard: 'summary_large_image',
    twitterTitle: () => ogTitle.value,
    twitterDescription: () => toValue(opts.description),
    twitterImage: () => `${origin}/og-card.png`,
  })
  useHead(() => ({
    // Home page passes brandSuffix:false → drop the global suffix for this route.
    ...(brandSuffix ? {} : { titleTemplate: null }),
    link: [{ rel: 'canonical', href: canonicalUrl.value }],
  }))
}
