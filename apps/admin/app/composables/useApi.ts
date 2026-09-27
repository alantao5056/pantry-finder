// $fetch bound to the API with the session cookie. A 401 anywhere (e.g. the
// 1h JWT expired mid-session) sends the admin back to the login page.
export const useApi = () => {
  const config = useRuntimeConfig()
  const admin = useAdminState()
  return $fetch.create({
    baseURL: config.public.apiBase,
    credentials: 'include',
    onResponseError({ response }) {
      if (response.status === 401) {
        admin.value = null
        void navigateTo('/login')
      }
    },
  })
}

/** Pulls the API's `{ error }` message out of a failed $fetch call. */
export const apiErrorMessage = (err: unknown): string => {
  const data = (err as { data?: { error?: string; fields?: string[] } })?.data
  if (data?.error) {
    return data.fields?.length ? `${data.error} (${data.fields.join(', ')})` : data.error
  }
  return 'Something went wrong. Please try again.'
}
