export const useApi = () => {
  const config = useRuntimeConfig()
  // SSR calls the API over loopback when configured, forwarding the visitor's
  // X-Forwarded-For untouched: the API trusts it only from loopback, so its
  // per-IP rate limits and request log see the visitor, not this server.
  const headers = import.meta.server ? useRequestHeaders(['cookie', 'x-forwarded-for']) : undefined
  const baseURL = (import.meta.server && config.apiBaseInternal) || config.public.apiBase
  return $fetch.create({
    baseURL,
    credentials: 'include',
    headers,
  })
}
