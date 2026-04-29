export const useApi = () => {
  const config = useRuntimeConfig()
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  return $fetch.create({
    baseURL: config.public.apiBase,
    credentials: 'include',
    headers,
  })
}
