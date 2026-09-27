<script setup lang="ts">
// Email/password only. Accounts created through Google/Microsoft sign-in have
// no password and can't log in here.
const route = useRoute()
const { login, logout } = useAdminAuth()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const denied = ref(route.query.denied === '1')

const submit = async () => {
  error.value = ''
  denied.value = false
  loading.value = true
  try {
    const result = await login(email.value.trim(), password.value)
    if (result === 'ok') await navigateTo('/')
    else if (result === 'forbidden') denied.value = true
    else error.value = 'Login failed.'
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex justify-center pt-24">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold">PantryFinder Admin</h1>
      </template>

      <UAlert
        v-if="denied"
        color="warning"
        variant="subtle"
        title="This account is not an admin."
        class="mb-4"
      >
        <template #actions>
          <UButton label="Log out" size="xs" color="neutral" variant="outline" @click="logout" />
        </template>
      </UAlert>
      <UAlert v-if="error" color="error" variant="subtle" :title="error" class="mb-4" />

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <UFormField label="Email">
          <UInput v-model="email" type="email" autocomplete="username" required class="w-full" />
        </UFormField>
        <UFormField label="Password">
          <UInput v-model="password" type="password" autocomplete="current-password" required class="w-full" />
        </UFormField>
        <UButton type="submit" label="Log in" block :loading="loading" />
      </form>
    </UCard>
  </div>
</template>
