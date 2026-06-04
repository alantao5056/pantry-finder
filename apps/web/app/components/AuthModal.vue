<script setup lang="ts">
const api = useApi()
const { open, tab, hide } = useAuthModal()
const { fetchMe } = useAuth()
const { fetchHearts } = useHearts()
const { renderGoogleButton, enabled: googleEnabled } = useGoogleAuth()
const { signIn: microsoftSignIn, enabled: microsoftEnabled } = useMicrosoftAuth()

const email = ref('')
const password = ref('')
const firstName = ref('')
const lastName = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)
const showPassword = ref(false)
const googleBtn = ref<HTMLElement | null>(null)

const submitLabel = computed(() => {
  if (submitting.value) {
    return tab.value === 'login' ? 'Signing in…' : 'Creating account…'
  }
  return tab.value === 'login' ? 'Sign In' : 'Create Account'
})

function resetForm() {
  email.value = ''
  password.value = ''
  firstName.value = ''
  lastName.value = ''
  error.value = null
  submitting.value = false
  showPassword.value = false
}

function switchTab(next: 'login' | 'register') {
  if (tab.value === next) return
  tab.value = next
  error.value = null
  submitting.value = false
}

function close() {
  hide()
}

async function onGoogleCredential(idToken: string) {
  error.value = null
  submitting.value = true
  try {
    await api('/auth/google', { method: 'POST', body: { idToken } })
    close()
    await fetchMe()
    await fetchHearts()
  } catch (err: any) {
    error.value = err?.data?.error ?? 'Google sign-in failed'
  } finally {
    submitting.value = false
  }
}

async function onMicrosoftClick() {
  error.value = null
  submitting.value = true
  try {
    const idToken = await microsoftSignIn()
    if (!idToken) return
    await api('/auth/microsoft', { method: 'POST', body: { idToken } })
    close()
    await fetchMe()
    await fetchHearts()
  } catch (err: any) {
    error.value = err?.data?.error ?? 'Microsoft sign-in failed'
  } finally {
    submitting.value = false
  }
}

// The Google button container only exists while the modal is open (v-if), so
// (re)render it each time the modal opens.
watch(open, async (isOpen) => {
  if (!isOpen) {
    resetForm()
    return
  }
  if (!googleEnabled) return
  await nextTick()
  if (googleBtn.value) {
    await renderGoogleButton(googleBtn.value, onGoogleCredential)
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

async function onSubmit() {
  error.value = null
  submitting.value = true
  try {
    if (tab.value === 'login') {
      await api('/auth/login', {
        method: 'POST',
        body: { email: email.value, password: password.value },
      })
      close()
      await fetchMe()
      await fetchHearts()
    } else {
      await api('/auth/register', {
        method: 'POST',
        body: {
          email: email.value,
          firstName: firstName.value,
          lastName: lastName.value,
          password: password.value,
        },
      })
      await api('/auth/login', {
        method: 'POST',
        body: { email: email.value, password: password.value },
      })
      close()
      await fetchMe()
      await fetchHearts()
    }
  } catch (err: any) {
    error.value = err?.data?.error ?? (tab.value === 'login' ? 'Login failed' : 'Registration failed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop">
      <div
        class="modal-card max-w-[400px] animate-pop-in"
        role="dialog"
        aria-modal="true"
      >
        <!-- Close button -->
        <button
          type="button"
          aria-label="Close"
          class="btn-icon modal-close"
          @click="close"
        >×</button>

        <div class="px-8 pt-9 pb-8">
          <!-- Header -->
          <div class="flex items-center gap-4 mb-7">
            <img src="/logo.png" alt="PantryFinder logo" class="w-16 h-16 object-contain shrink-0" />
            <div>
              <h2 class="font-serif font-semibold text-[22px] mb-1.5" style="color: var(--text-dark);">
                {{ tab === 'login' ? 'Welcome back' : 'Join the community' }}
              </h2>
              <p class="text-[14px]" style="color: var(--text-soft);">
                {{ tab === 'login' ? 'Sign in to save pantries & leave reviews' : 'Free forever — no strings attached' }}
              </p>
            </div>
          </div>

          <!-- Social sign-in -->
          <template v-if="googleEnabled || microsoftEnabled">
            <div class="flex flex-col gap-2.5">
              <div v-if="googleEnabled" ref="googleBtn" class="flex justify-center [color-scheme:light]" />
              <button
                v-if="microsoftEnabled"
                type="button"
                :disabled="submitting"
                class="btn-social"
                @click="onMicrosoftClick"
              >
                <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                Continue with Microsoft
              </button>
            </div>
            <div class="or-divider">or</div>
          </template>

          <!-- Form -->
          <form class="flex flex-col gap-3" @submit.prevent="onSubmit">
            <template v-if="tab === 'register'">
              <input
                v-model="firstName"
                type="text"
                autocomplete="given-name"
                required
                placeholder="First name"
                class="form-input"
              />
              <input
                v-model="lastName"
                type="text"
                autocomplete="family-name"
                required
                placeholder="Last name"
                class="form-input"
              />
            </template>

            <input
              v-model="email"
              type="email"
              autocomplete="email"
              required
              placeholder="Email address"
              class="form-input"
            />

            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="tab === 'login' ? 'current-password' : 'new-password'"
                required
                :placeholder="tab === 'login' ? 'Password' : 'Create a password'"
                class="form-input pr-11"
              />
              <button
                type="button"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                :aria-pressed="showPassword"
                tabindex="-1"
                class="btn-icon absolute inset-y-0 right-0 px-3"
                @click="showPassword = !showPassword"
              >
                <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-[18px]" />
              </button>
            </div>

            <p
              v-if="error"
              class="text-sm rounded-md px-3 py-2"
              style="color: #b91c1c; background: #fef2f2;"
            >{{ error }}</p>

            <button
              type="submit"
              :disabled="submitting"
              class="btn-primary w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >{{ submitLabel }}</button>
          </form>

          <p class="text-center text-[13px] mt-5" style="color: var(--text-soft);">
            <template v-if="tab === 'login'">
              No account?
              <a href="#" class="btn-link-accent" @click.prevent="switchTab('register')">Create one free →</a>
            </template>
            <template v-else>
              Already have an account?
              <a href="#" class="btn-link-accent" @click.prevent="switchTab('login')">Sign in →</a>
            </template>
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset;
  -webkit-text-fill-color: #1a2e1e;
  caret-color: #1a2e1e;
  transition: background-color 9999s ease-in-out 0s;
}
</style>
