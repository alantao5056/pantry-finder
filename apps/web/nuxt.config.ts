// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: true,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css', 'leaflet/dist/leaflet.css'],
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8080',
      photonBase: process.env.NUXT_PUBLIC_PHOTON_BASE || '',
      geonamesUser: process.env.NUXT_PUBLIC_GEONAMES_USER || '',
      googleClientId: process.env.NUXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      microsoftClientId: process.env.NUXT_PUBLIC_MICROSOFT_CLIENT_ID || '',
      gaMeasurementId: process.env.NUXT_PUBLIC_GA_MEASUREMENT_ID || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://pantryfinder.org',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap',
        },
      ],
      script: [
        { src: 'https://accounts.google.com/gsi/client', async: true, defer: true },
      ],
    },
  },
})
