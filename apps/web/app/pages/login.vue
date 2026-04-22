<script setup lang="ts">
const config = useRuntimeConfig()
const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

async function onSubmit() {
  error.value = null
  submitting.value = true
  try {
    await $fetch(`${config.public.apiBase}/auth/login`, {
      method: 'POST',
      body: { username: username.value, password: password.value },
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
  <div style="max-width: 320px; margin: 4rem auto; font-family: sans-serif;">
    <h1>Sign in</h1>
    <form @submit.prevent="onSubmit">
      <label style="display:block; margin-bottom: 0.5rem;">
        Username
        <input v-model="username" type="text" autocomplete="username" required style="display:block; width:100%;" />
      </label>
      <label style="display:block; margin-bottom: 0.5rem;">
        Password
        <input v-model="password" type="password" autocomplete="current-password" required style="display:block; width:100%;" />
      </label>
      <button type="submit" :disabled="submitting" style="margin-top: 0.5rem;">
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
      <p v-if="error" style="color: crimson; margin-top: 0.75rem;">{{ error }}</p>
    </form>
  </div>
</template>
