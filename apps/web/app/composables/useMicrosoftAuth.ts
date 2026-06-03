import { PublicClientApplication } from '@azure/msal-browser'

// A single MSAL instance is shared across the app; initialize() must run once
// before any interactive request.
let msalInstance: PublicClientApplication | null = null
let msalReady: Promise<PublicClientApplication> | null = null

function getMsal(clientId: string): Promise<PublicClientApplication> {
  if (msalReady) return msalReady
  msalInstance = new PublicClientApplication({
    auth: {
      clientId,
      // 'common' lets both personal and work/school accounts sign in.
      authority: 'https://login.microsoftonline.com/common',
      // Pin to the bare origin (no path, no trailing slash) so the value sent
      // to Microsoft matches the registered SPA redirect URI regardless of which
      // route the user signs in from. MSAL otherwise defaults to the current URL.
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  })
  msalReady = msalInstance.initialize().then(() => msalInstance!)
  return msalReady
}

export const useMicrosoftAuth = () => {
  const config = useRuntimeConfig()
  const clientId = config.public.microsoftClientId

  /**
   * Open the Microsoft sign-in popup and resolve with the returned ID token
   * (a JWT) to POST to the API. Returns null if the user cancels, no client ID
   * is configured, or MSAL is unavailable (e.g. during SSR).
   */
  const signIn = async (): Promise<string | null> => {
    if (!import.meta.client || !clientId) return null

    try {
      const msal = await getMsal(clientId)
      const result = await msal.loginPopup({
        scopes: ['openid', 'profile', 'email'],
        prompt: 'select_account',
      })
      return result.idToken || null
    } catch {
      // Popup closed/blocked or interaction failed.
      return null
    }
  }

  return { signIn, enabled: Boolean(clientId) }
}
