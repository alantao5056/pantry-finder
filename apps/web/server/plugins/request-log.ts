import { decodeJwtSub } from '@pantry-finder/shared'
import { logRequest } from '@pantry-finder/shared/logging'

// Records every page request handled by the Nuxt (Nitro) server to Google Cloud
// Logging, tagged source: 'web'. Unlike the API, the Nitro server sees the
// visitor's REAL IP, so these entries are the source of truth for who hit the
// site (the API only ever sees the SSR server's IP on server-side fetches).
//
// `@pantry-finder/shared/logging` is server-only and imported solely here, so
// @google-cloud/logging never enters the client bundle.

// Must match the API's COOKIE_NAME (apps/api/src/config/auth.ts).
const SESSION_COOKIE = 'session'

// Skip Nuxt/Nitro internals (`/_nuxt`, `/_ipx`, devtools…) and static assets so
// entries are real navigations, not every chunk/image/font.
const STATIC_EXT = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|txt|xml|json)$/i

function shouldSkip(path: string): boolean {
  return path.startsWith('/_') || path.startsWith('/__') || STATIC_EXT.test(path)
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    event.context.logStart = Date.now()
  })

  nitro.hooks.hook('afterResponse', (event) => {
    const fullPath = event.path || ''
    // Skip check uses the path only; the logged url keeps the query string.
    if (shouldSkip(fullPath.split('?')[0])) return

    const start = event.context.logStart as number | undefined

    logRequest({
      source: 'web',
      user: decodeJwtSub(parseCookies(event)[SESSION_COOKIE]),
      ip: getRequestIP(event, { xForwardedFor: true }) || '',
      method: event.method,
      url: fullPath,
      status: getResponseStatus(event),
      durationMs: start !== undefined ? Date.now() - start : undefined,
      userAgent: getRequestHeader(event, 'user-agent'),
      referer: getRequestHeader(event, 'referer'),
    })
  })
})
