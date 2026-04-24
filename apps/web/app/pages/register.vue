<script setup lang="ts">
const config = useRuntimeConfig()
const email = ref('')
const firstName = ref('')
const lastName = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

async function onSubmit() {
  error.value = null
  submitting.value = true
  try {
    await $fetch(`${config.public.apiBase}/auth/register`, {
      method: 'POST',
      body: { email: email.value, firstName: firstName.value, lastName: lastName.value, password: password.value },
      credentials: 'include',
    })
    await navigateTo('/login')
  } catch (err: any) {
    error.value = err?.data?.error ?? 'Registration failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto my-16 px-4 font-sans">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Create account</h1>
    <form class="space-y-4" @submit.prevent="onSubmit">
      <label class="block">
        <span class="block text-sm font-medium text-gray-700 mb-1">First name</span>
        <input
          v-model="firstName"
          type="text"
          autocomplete="given-name"
          required
          class="block w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </label>
      <label class="block">
        <span class="block text-sm font-medium text-gray-700 mb-1">Last name</span>
        <input
          v-model="lastName"
          type="text"
          autocomplete="family-name"
          required
          class="block w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </label>
      <label class="block">
        <span class="block text-sm font-medium text-gray-700 mb-1">Email</span>
        <input
          v-model="email"
          type="email"
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
          autocomplete="new-password"
          required
          class="block w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </label>
      <button
        type="submit"
        :disabled="submitting"
        class="w-full px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ submitting ? 'Creating account…' : 'Create account' }}
      </button>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <p class="text-sm text-gray-600 text-center">
        Already have an account?
        <NuxtLink to="/login" class="text-blue-600 hover:underline">Sign in</NuxtLink>
      </p>
    </form>
  </div>
</template>
