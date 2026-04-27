export interface AuthUser {
  email: string
  firstName: string
  lastName: string
}

export const useAuth = () => {
  const config = useRuntimeConfig()
  const user = useState<AuthUser | null>('auth-user', () => null)

  const fetchMe = async () => {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    try {
      user.value = await $fetch<AuthUser>(`${config.public.apiBase}/auth/me`, {
        headers,
        credentials: 'include',
      })
    } catch {
      user.value = null
    }
  }

  const logout = async () => {
    try {
      await $fetch(`${config.public.apiBase}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      user.value = null
    }
  }

  const isLoggedIn = computed(() => user.value !== null)

  const initials = computed(() => {
    const u = user.value
    if (!u) return ''
    const first = u.firstName?.[0] ?? ''
    const last = u.lastName?.[0] ?? ''
    return (first + last).toUpperCase() || u.email[0]?.toUpperCase() || '?'
  })

  return { user, isLoggedIn, initials, fetchMe, logout }
}
