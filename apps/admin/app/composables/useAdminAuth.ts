import type { AdminProfile } from '@pantry-finder/shared'

export const useAdminState = () => useState<AdminProfile | null>('admin', () => null)

export type AdminCheck = 'ok' | 'unauthenticated' | 'forbidden'

export const useAdminAuth = () => {
  const api = useApi()
  const admin = useAdminState()

  /** Resolves the current session against GET /admin/me. */
  const check = async (): Promise<AdminCheck> => {
    try {
      admin.value = await api<AdminProfile>('/admin/me')
      return 'ok'
    } catch (err) {
      admin.value = null
      const status = (err as { response?: { status?: number } })?.response?.status
      return status === 403 ? 'forbidden' : 'unauthenticated'
    }
  }

  const login = async (email: string, password: string): Promise<AdminCheck> => {
    await api('/auth/login', { method: 'POST', body: { email, password } })
    return check()
  }

  // The session cookie is shared with pantryfinder.org, so this also signs the
  // user out of the public site.
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      admin.value = null
      await navigateTo('/login')
    }
  }

  return { admin, check, login, logout }
}
