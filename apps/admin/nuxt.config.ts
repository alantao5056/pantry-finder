// https://nuxt.com/docs/api/configuration/nuxt-config
// Admin site (admin.pantryfinder.org). A client-only SPA: no SEO needs, and it
// avoids forwarding the session cookie through SSR.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  // 3000 is the public site; 3001 is where `nuxt dev` falls back when 3000 is taken.
  devServer: { port: 3002 },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8080',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://pantryfinder.org',
    },
  },
  app: {
    head: {
      title: 'PantryFinder Admin',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'robots', content: 'noindex, nofollow' }],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    },
  },
})
