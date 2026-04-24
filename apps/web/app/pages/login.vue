<script setup lang="ts">
const config = useRuntimeConfig()
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

async function onSubmit() {
  error.value = null
  submitting.value = true
  try {
    await $fetch(`${config.public.apiBase}/auth/login`, {
      method: 'POST',
      body: { email: email.value, password: password.value },
      credentials: 'include',
    })
    await navigateTo('/')
  } catch (err: any) {
    error.value = err?.data?.error ?? 'Login failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto my-16 px-4 font-sans">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Sign in</h1>
    <form class="space-y-4" @submit.prevent="onSubmit">
      <label class="block">
        <span class="block text-sm font-medium text-gray-700 mb-1">Email</span>
        <input
          v-model="email"
          type="text"
          autocomplete="email"
          required
          class="block w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </label>
      <label class="block">
        <span class="block text-sm font-medium text-gray-700 mb-1">Password</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="block w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </label>
      <button
        type="submit"
        :disabled="submitting"
        class="w-full px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </form>
  </div>
</template>
