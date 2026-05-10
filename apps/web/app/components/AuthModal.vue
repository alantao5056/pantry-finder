<script setup lang="ts">
const api = useApi()
const { open, tab, hide } = useAuthModal()
const { fetchMe } = useAuth()

const email = ref('')
const password = ref('')
const firstName = ref('')
const lastName = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)
const showPassword = ref(false)

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

watch(open, (isOpen) => {
  if (!isOpen) resetForm()
})

const mouseDownOnBackdrop = ref(false)

function onBackdropMouseDown(e: MouseEvent) {
  mouseDownOnBackdrop.value = e.target === e.currentTarget
}

function onBackdropMouseUp(e: MouseEvent) {
  if (mouseDownOnBackdrop.value && e.target === e.currentTarget) close()
  mouseDownOnBackdrop.value = false
}

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
    <div
      v-if="open"
      class="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style="background: rgba(15,30,20,0.55); backdrop-filter: blur(4px);"
      @mousedown="onBackdropMouseDown"
      @mouseup="onBackdropMouseUp"
    >
      <div
        class="w-full max-w-[400px] rounded-[20px] relative animate-pop-in"
        style="background: var(--cream-light); box-shadow: 0 24px 80px rgba(0,0,0,0.18);"
        role="dialog"
        aria-modal="true"
      >
        <!-- Close button -->
        <button
          type="button"
          aria-label="Close"
          class="absolute top-4 right-4 bg-transparent border-none text-[22px] leading-none"
          style="color: var(--text-soft);"
          @click="close"
        >×</button>

        <div class="px-8 pt-9 pb-8">
          <!-- Header -->
          <div class="text-center mb-7">
            <span class="block mb-2.5 text-[36px]">{{ tab === 'login' ? '🌿' : '🌱' }}</span>
            <h2 class="font-serif font-semibold text-[22px] mb-1.5" style="color: var(--text-dark);">
              {{ tab === 'login' ? 'Welcome back' : 'Join the community' }}
            </h2>
            <p class="text-[14px]" style="color: var(--text-soft);">
              {{ tab === 'login' ? 'Sign in to save pantries & leave reviews' : 'Free forever — no strings attached' }}
            </p>
          </div>

          <!-- Form -->
          <form class="flex flex-col gap-3" @submit.prevent="onSubmit">
            <template v-if="tab === 'register'">
              <input
                v-model="firstName"
                type="text"
                autocomplete="given-name"
                required
                placeholder="First name"
                class="w-full bg-white rounded-[12px] px-4 py-[11px] text-sm border-[1.5px] outline-none transition-colors"
                style="border-color: var(--border-input); color: var(--text-dark);"
                @focus="(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#1e7a47')"
                @blur="(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#dde8e2')"
              />
              <input
                v-model="lastName"
                type="text"
                autocomplete="family-name"
                required
                placeholder="Last name"
                class="w-full bg-white rounded-[12px] px-4 py-[11px] text-sm border-[1.5px] outline-none transition-colors"
                style="border-color: var(--border-input); color: var(--text-dark);"
                @focus="(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#1e7a47')"
                @blur="(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#dde8e2')"
              />
            </template>

            <input
              v-model="email"
              type="email"
              autocomplete="email"
              required
              placeholder="Email address"
              class="w-full bg-white rounded-[12px] px-4 py-[11px] text-sm border-[1.5px] outline-none transition-colors"
              style="border-color: var(--border-input); color: var(--text-dark);"
              @focus="(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#1e7a47')"
              @blur="(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#dde8e2')"
            />

            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="tab === 'login' ? 'current-password' : 'new-password'"
                required
                :placeholder="tab === 'login' ? 'Password' : 'Create a password'"
                class="w-full bg-white rounded-[12px] pl-4 pr-11 py-[11px] text-sm border-[1.5px] outline-none transition-colors"
                style="border-color: var(--border-input); color: var(--text-dark);"
                @focus="(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#1e7a47')"
                @blur="(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#dde8e2')"
              />
              <button
                type="button"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                :aria-pressed="showPassword"
                tabindex="-1"
                class="absolute inset-y-0 right-0 flex items-center px-3 bg-transparent border-none cursor-pointer"
                style="color: var(--text-soft);"
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
              class="w-full mt-1 py-3 rounded-[12px] text-white text-[14px] font-semibold border-none disabled:opacity-50 disabled:cursor-not-allowed"
              style="background: var(--green-dark);"
            >
              <template v-if="tab === 'login'">{{ submitting ? 'Signing in…' : 'Sign In' }}</template>
              <template v-else>{{ submitting ? 'Creating account…' : 'Create Account' }}</template>
            </button>
          </form>

          <p class="text-center text-[13px] mt-5" style="color: var(--text-soft);">
            <template v-if="tab === 'login'">
              No account?
              <a href="#" class="font-semibold no-underline" style="color: var(--green-dark);" @click.prevent="switchTab('register')">Create one free →</a>
            </template>
            <template v-else>
              Already have an account?
              <a href="#" class="font-semibold no-underline" style="color: var(--green-dark);" @click.prevent="switchTab('login')">Sign in →</a>
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
