<script setup lang="ts">
import { DEFAULT_APP_CONFIG } from '@pantry-finder/shared'
import type { AppConfig, AppConfigResponse } from '@pantry-finder/shared'

// The API's runtime settings (Firestore `appConfig`). The API re-reads them
// every 5 minutes, so a save needs no deploy or restart.
const api = useApi()
const toast = useToast()

const { data, pending, error, refresh } = await useAsyncData(
  'app-config',
  () => api<AppConfigResponse>('/admin/app-config'),
)

const defaults = DEFAULT_APP_CONFIG.cacheTtlMinutes

const form = ref<AppConfig>(deepClone(DEFAULT_APP_CONFIG))
watch(
  data,
  (res) => {
    if (res) form.value = deepClone(res.config)
  },
  { immediate: true },
)

const dirty = computed(() => !!data.value && JSON.stringify(form.value) !== JSON.stringify(data.value.config))
const isDefault = computed(() => JSON.stringify(form.value) === JSON.stringify(DEFAULT_APP_CONFIG))

const saving = ref(false)

const save = async () => {
  saving.value = true
  try {
    data.value = await api<AppConfigResponse>('/admin/app-config', { method: 'PUT', body: form.value })
    toast.add({ title: 'Settings saved', description: 'They take effect within 5 minutes.', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Could not save the settings', description: apiErrorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Settings</h1>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <template v-if="data">
      <UCard>
        <template #header>
          <h2 class="font-medium">Search</h2>
        </template>
        <USwitch
          v-model="form.anonymousSearchEnabled"
          label="Anonymous search"
          description="When off, visitors must sign in before they can search for pantries."
        />
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-medium">Cache TTL</h2>
        </template>
        <div class="flex flex-col gap-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <TtlField
              v-model="form.cacheTtlMinutes.geocode"
              label="Geocode"
              description="Address, ZIP and location lookups."
              :default-minutes="defaults.geocode"
            />
            <TtlField
              v-model="form.cacheTtlMinutes.pantry"
              label="Pantry"
              description="Pantry detail pages."
              :default-minutes="defaults.pantry"
            />
            <TtlField
              v-model="form.cacheTtlMinutes.cityState"
              label="City / state"
              description="Browse pages: states, cities and each city’s pantry list."
              :default-minutes="defaults.cityState"
            />
            <TtlField
              v-model="form.cacheTtlMinutes.user"
              label="User"
              description="User profiles."
              :default-minutes="defaults.user"
            />
          </div>
          <p class="text-xs text-(--ui-text-muted)">
            A new TTL applies to entries cached from now on; entries already in the cache keep the expiry they were
            written with.
          </p>
        </div>
      </UCard>

      <div class="flex items-center justify-between gap-4">
        <p class="text-xs text-(--ui-text-muted)">
          <template v-if="data.updatedAt">
            Last saved {{ formatDateTime(data.updatedAt) }}<template v-if="data.updatedBy"> by {{ data.updatedBy }}</template>.
          </template>
          Changes take effect within 5 minutes.
        </p>
        <div class="flex gap-2">
          <UButton
            label="Reset to defaults"
            color="neutral"
            variant="ghost"
            :disabled="isDefault"
            @click="form = deepClone(DEFAULT_APP_CONFIG)"
          />
          <UButton label="Save" icon="i-lucide-save" :loading="saving" :disabled="!dirty" @click="save" />
        </div>
      </div>
    </template>
  </div>
</template>
