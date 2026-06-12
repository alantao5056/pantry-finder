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
    // Deliberate compact-thumbnail share layout: the 450×450 logo with declared
    // dimensions (<600px wide) makes Facebook render a small square thumbnail
    // beside the title instead of scraping a page image and blowing it up.
    ogImage: () => `${origin}/logo.png`,
    ogImageWidth: 450,
    ogImageHeight: 450,
    ogImageAlt: 'PantryFinder logo',
    // Twitter shares mirror the OG tags. 'summary' (not 'summary_large_image')
    // matches the compact square-thumbnail layout.
    twitterCard: 'summary',
    twitterTitle: () => ogTitle.value,
    twitterDescription: () => toValue(opts.description),
    twitterImage: () => `${origin}/logo.png`,
  })
  useHead(() => ({
    // Home page passes brandSuffix:false → drop the global suffix for this route.
    ...(brandSuffix ? {} : { titleTemplate: null }),
    link: [{ rel: 'canonical', href: canonicalUrl.value }],
  }))
}
