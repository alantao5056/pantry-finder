export interface AuthUser {
  email: string
  firstName: string
  lastName: string
  picture?: string
}

export const useAuth = () => {
  const api = useApi()
  const user = useState<AuthUser | null>('auth-user', () => null)

  const fetchMe = async () => {
    try {
      user.value = await api<AuthUser>('/auth/me')
    } catch {
      user.value = null
    }
  }

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
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
