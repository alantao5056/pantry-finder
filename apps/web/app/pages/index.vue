<script setup lang="ts">
const config = useRuntimeConfig()
const address = ref('')
const results = ref<any[] | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

async function search() {
  error.value = null
  loading.value = true
  try {
    const data = await $fetch<{ pantries: any[] }>(`${config.public.apiBase}/pantries`, {
      query: { address: address.value },
      credentials: 'include',
    })
    results.value = data.pantries ?? []
  } catch (err: any) {
    if (err?.status === 401 || err?.statusCode === 401) {
      await navigateTo('/login')
      return
    }
    error.value = err?.data?.error ?? 'Search failed'
  } finally {
    loading.value = false
  }
}

async function logout() {
  await $fetch(`${config.public.apiBase}/auth/logout`, { method: 'POST', credentials: 'include' })
  await navigateTo('/login')
}
</script>

<template>
  <div style="max-width: 640px; margin: 2rem auto; font-family: sans-serif;">
    <div style="display:flex; justify-content: space-between; align-items: center;">
      <h1>Pantry finder</h1>
      <button @click="logout">Sign out</button>
    </div>
    <form @submit.prevent="search" style="margin-top: 1rem;">
      <input v-model="address" placeholder="Address" required style="width: 70%;" />
      <button type="submit" :disabled="loading">{{ loading ? 'Searching…' : 'Search' }}</button>
    </form>
    <p v-if="error" style="color: crimson;">{{ error }}</p>
    <ul v-if="results" style="margin-top: 1rem;">
      <li v-for="p in results" :key="p.id">
        <strong>{{ p.name }}</strong> — {{ p.address }} ({{ p.distance?.toFixed(2) }} mi)
      </li>
    </ul>
  </div>
</template>
