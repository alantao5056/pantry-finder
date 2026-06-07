<script setup lang="ts">
// gtag.js measurement id comes from runtime config (NUXT_PUBLIC_GA_MEASUREMENT_ID) so
// it's resolved at runtime rather than baked at build time, and shares a single source
// with the API's GA_MEASUREMENT_ID. Scripts are only injected when an id is configured.
const config = useRuntimeConfig().public
const gaId = config.gaMeasurementId
// Canonical production origin (no trailing slash) — drives the site-wide JSON-LD
// @ids and URLs below. Uses siteUrl rather than useRequestURL() so the structured
// data always points at the public domain, never localhost or a preview host.
const siteUrl = config.siteUrl.replace(/\/$/, '')

// Site-wide structured data: Organization (brand identity + logo) and WebSite
// (with a SearchAction so the site is eligible for a Google sitelinks search box).
// One @graph keeps the two nodes cross-referenced (WebSite.publisher → Organization).
const siteLdJson = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'PantryFinder',
      url: `${siteUrl}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/logo.png`,
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'PantryFinder',
      url: `${siteUrl}/`,
      publisher: { '@id': `${siteUrl}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteUrl}/search?location={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
}

// Global title template: pages set a bare title and this appends the brand suffix.
// Function form (only valid via useHead, not the serializable nuxt.config head) so
// pages with no title fall back to plain "PantryFinder" instead of " - PantryFinder".
useHead({
  titleTemplate: (titleChunk?: string) =>
    titleChunk ? `${titleChunk} - PantryFinder` : 'PantryFinder',
  script: [
    { type: 'application/ld+json', innerHTML: JSON.stringify(siteLdJson) },
    ...(gaId
      ? [
          // Kept high priority so it lands early in <head> as Google recommends.
          { src: `https://www.googletagmanager.com/gtag/js?id=${gaId}`, async: true, tagPriority: 'high' as const },
          {
            innerHTML: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${gaId}');`,
            tagPriority: 'high' as const,
          },
        ]
      : []),
  ],
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
