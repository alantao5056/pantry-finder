<script setup lang="ts">
const config = useRuntimeConfig()
const { open, tab, hide } = useAuthModal()

const email = ref('')
const password = ref('')
const firstName = ref('')
const lastName = ref('')
const showPassword = ref(false)
const error = ref<string | null>(null)
const submitting = ref(false)

function resetForm() {
  email.value = ''
  password.value = ''
  firstName.value = ''
  lastName.value = ''
  showPassword.value = false
  error.value = null
  submitting.value = false
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
      await $fetch(`${config.public.apiBase}/auth/login`, {
        method: 'POST',
        body: { email: email.value, password: password.value },
        credentials: 'include',
      })
      close()
      await refreshNuxtData()
    } else {
      await $fetch(`${config.public.apiBase}/auth/register`, {
        method: 'POST',
        body: {
          email: email.value,
          firstName: firstName.value,
          lastName: lastName.value,
          password: password.value,
        },
        credentials: 'include',
      })
      await $fetch(`${config.public.apiBase}/auth/login`, {
        method: 'POST',
        body: { email: email.value, password: password.value },
        credentials: 'include',
      })
      close()
      await refreshNuxtData()
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
      class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      @mousedown="onBackdropMouseDown"
      @mouseup="onBackdropMouseUp"
    >
      <div
        class="w-full max-w-md bg-white rounded-[22px] overflow-hidden shadow-2xl animate-slide-up"
        role="dialog"
        aria-modal="true"
      >
        <!-- Header -->
        <div class="relative px-7 pt-6 pb-5 bg-gradient-to-br from-forest-700 to-forest-600">
          <button
            type="button"
            aria-label="Close"
            class="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
            @click="close"
          >
            <UIcon name="i-lucide-x" class="size-4" />
          </button>

          <div class="flex items-center gap-2.5 mb-4">
            <div class="w-9 h-9 bg-white/15 rounded-[10px] flex items-center justify-center">
              <UIcon name="i-lucide-leaf" class="size-[18px] text-forest-300" />
            </div>
            <span class="font-serif text-white text-xl font-bold">PantryFinder</span>
          </div>

          <div class="flex gap-1 bg-white/10 rounded-[10px] p-1">
            <button
              type="button"
              class="flex-1 py-2 rounded-[7px] text-sm font-medium transition-all"
              :class="tab === 'login' ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white'"
              @click="switchTab('login')"
            >Sign In</button>
            <button
              type="button"
              class="flex-1 py-2 rounded-[7px] text-sm font-medium transition-all"
              :class="tab === 'register' ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white'"
              @click="switchTab('register')"
            >Register</button>
          </div>
        </div>

        <!-- Form -->
        <form class="px-7 pt-6 pb-7 space-y-3" @submit.prevent="onSubmit">
          <template v-if="tab === 'register'">
            <label class="block">
              <span class="block text-[13px] font-semibold text-gray-700 mb-1">First name</span>
              <div class="flex items-center gap-2.5 bg-cream rounded-[10px] px-3.5 border-[1.5px] border-cream-dark focus-within:border-forest-500 transition-colors">
                <UIcon name="i-lucide-user" class="size-4 text-gray-400" />
                <input
                  v-model="firstName"
                  type="text"
                  autocomplete="given-name"
                  required
                  placeholder="Jane"
                  class="flex-1 bg-transparent border-0 outline-none text-sm py-3 text-gray-900 placeholder:text-gray-400"
                />
              </div>
            </label>

            <label class="block">
              <span class="block text-[13px] font-semibold text-gray-700 mb-1">Last name</span>
              <div class="flex items-center gap-2.5 bg-cream rounded-[10px] px-3.5 border-[1.5px] border-cream-dark focus-within:border-forest-500 transition-colors">
                <UIcon name="i-lucide-user" class="size-4 text-gray-400" />
                <input
                  v-model="lastName"
                  type="text"
                  autocomplete="family-name"
                  required
                  placeholder="Smith"
                  class="flex-1 bg-transparent border-0 outline-none text-sm py-3 text-gray-900 placeholder:text-gray-400"
                />
              </div>
            </label>
          </template>

          <label class="block">
            <span class="block text-[13px] font-semibold text-gray-700 mb-1">Email address</span>
            <div class="flex items-center gap-2.5 bg-cream rounded-[10px] px-3.5 border-[1.5px] border-cream-dark focus-within:border-forest-500 transition-colors">
              <UIcon name="i-lucide-mail" class="size-4 text-gray-400" />
              <input
                v-model="email"
                type="email"
                autocomplete="email"
                required
                placeholder="you@example.com"
                class="flex-1 bg-transparent border-0 outline-none text-sm py-3 text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </label>

          <label class="block">
            <span class="block text-[13px] font-semibold text-gray-700 mb-1">Password</span>
            <div class="flex items-center gap-2.5 bg-cream rounded-[10px] px-3.5 border-[1.5px] border-cream-dark focus-within:border-forest-500 transition-colors">
              <UIcon name="i-lucide-lock" class="size-4 text-gray-400" />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="tab === 'login' ? 'current-password' : 'new-password'"
                required
                placeholder="••••••••"
                class="flex-1 bg-transparent border-0 outline-none text-sm py-3 text-gray-900 placeholder:text-gray-400"
              />
              <button
                type="button"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                class="text-gray-400 hover:text-gray-600 transition-colors"
                @click="showPassword = !showPassword"
              >
                <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
              </button>
            </div>
          </label>

          <p
            v-if="error"
            class="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2"
          >{{ error }}</p>

          <button
            type="submit"
            :disabled="submitting"
            class="w-full mt-1 py-3.5 rounded-xl text-white text-[15px] font-semibold bg-gradient-to-br from-forest-700 to-forest-600 hover:from-forest-800 hover:to-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <template v-if="tab === 'login'">{{ submitting ? 'Signing in…' : 'Sign In' }}</template>
            <template v-else>{{ submitting ? 'Creating account…' : 'Create Account' }}</template>
          </button>

          <p class="text-center text-[13px] text-gray-500">
            <template v-if="tab === 'login'">
              Don't have an account?
              <button
                type="button"
                class="text-forest-700 font-semibold hover:underline"
                @click="switchTab('register')"
              >Register</button>
            </template>
            <template v-else>
              Already have an account?
              <button
                type="button"
                class="text-forest-700 font-semibold hover:underline"
                @click="switchTab('login')"
              >Sign In</button>
            </template>
          </p>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 1000px #F6F4EE inset;
  -webkit-text-fill-color: #111827;
  caret-color: #111827;
  transition: background-color 9999s ease-in-out 0s;
}
</style>
