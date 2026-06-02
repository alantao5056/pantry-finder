interface GoogleCredentialResponse {
  credential: string
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
  }): void
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void
  cancel(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

const GSI_POLL_MS = 100
const GSI_TIMEOUT_MS = 10000

/** Resolve once the async-loaded Google Identity Services script is ready. */
function waitForGoogle(): Promise<GoogleAccountsId | null> {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts.id)
      return
    }
    let waited = 0
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer)
        resolve(window.google.accounts.id)
      } else if ((waited += GSI_POLL_MS) >= GSI_TIMEOUT_MS) {
        clearInterval(timer)
        resolve(null)
      }
    }, GSI_POLL_MS)
  })
}

export const useGoogleAuth = () => {
  const config = useRuntimeConfig()
  const clientId = config.public.googleClientId

  /**
   * Render Google's official "Continue with Google" button into `el`.
   * `onCredential` receives the returned ID token (a JWT) to POST to the API.
   * Returns false if GIS is unavailable or no client ID is configured.
   */
  const renderGoogleButton = async (
    el: HTMLElement,
    onCredential: (idToken: string) => void,
  ): Promise<boolean> => {
    if (!import.meta.client || !clientId) return false

    const accounts = await waitForGoogle()
    if (!accounts) return false

    accounts.initialize({
      client_id: clientId,
      callback: (response) => onCredential(response.credential),
    })
    accounts.renderButton(el, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'center',
      width: el.clientWidth || 336,
    })
    return true
  }

  return { renderGoogleButton, enabled: Boolean(clientId) }
}
