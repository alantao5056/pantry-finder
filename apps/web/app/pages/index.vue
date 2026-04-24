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
  <div class="max-w-2xl mx-auto my-8 px-4 font-sans">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold text-gray-900">Pantry finder</h1>
      <button
        class="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        @click="logout"
      >
        Sign out
      </button>
    </div>
    <form class="mt-6 flex gap-2" @submit.prevent="search">
      <input
        v-model="address"
        placeholder="Address"
        required
        class="flex-1 px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <button
        type="submit"
        :disabled="loading"
        class="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ loading ? 'Searching…' : 'Search' }}
      </button>
    </form>
    <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    <ul v-if="results" class="mt-6 space-y-2">
      <li
        v-for="p in results"
        :key="p.id"
        class="p-3 rounded-md border border-gray-200 bg-white hover:bg-gray-50"
      >
        <strong class="text-gray-900">{{ p.name }}</strong>
        <span class="text-gray-600"> — {{ p.address }} ({{ p.distance?.toFixed(2) }} mi)</span>
      </li>
    </ul>
  </div>
</template>
