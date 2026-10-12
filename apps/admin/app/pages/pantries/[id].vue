<script setup lang="ts">
import type {
  AddressFields,
  AdminPantryDetail,
  EditTarget,
  EditValue,
  PantryDraft,
  UpdatePantryResponse,
} from '@pantry-finder/shared'
import { TEXT_TARGETS, emptyEditValue, sameEditValue } from '@pantry-finder/shared'

// Edits a live pantry by hand. Only the fields that differ from the loaded
// record are sent; each one lands in the change log and can be reverted there.
const route = useRoute()
const api = useApi()
const toast = useToast()
const pantryUrl = usePantryUrl()
const id = route.params.id as string

const { data: detail, error, refresh } = await useAsyncData(
  `pantry-${id}`,
  () => api<AdminPantryDetail>(`/admin/pantries/${id}`),
)

// Editable working copy; reset whenever the detail reloads.
const draft = ref<PantryDraft | null>(null)
watch(detail, (d) => { draft.value = d ? deepClone(d.pantry) : null }, { immediate: true })

const serviceNames = computed(() => detail.value?.pantry.services.map((s) => s.name) ?? [])

const sourceHint = (field: string) => {
  const s = detail.value?.fieldSources[field]
  return s ? `${s.source} · ${new Date(s.at).toLocaleDateString()}` : undefined
}

// Fields an active crawler mapping keeps up to date.
const crawlerMaintained = computed(() =>
  (detail.value?.mappings ?? [])
    .filter((m) => m.status === 'active')
    .map((m) => targetLabel(m.target, serviceNames.value)),
)

interface FieldChange {
  target: EditTarget
  oldValue: EditValue
  newValue: EditValue
}

const SERVICE_FIELDS = ['name', 'categoryDescription', 'foodProgramTypeDescription', 'foodOfferings', 'notes', 'schedules'] as const
const ADDRESS_FIELDS = ['address1', 'address2', 'city', 'state', 'zipCode'] as const

const fieldChanges = computed<FieldChange[]>(() => {
  const stored = detail.value?.pantry
  const edited = draft.value
  if (!stored || !edited) return []
  const changes: FieldChange[] = []
  const compare = (target: EditTarget, a: EditValue | undefined, b: EditValue | undefined) => {
    if (sameEditValue(target, a, b)) return
    changes.push({ target, oldValue: a ?? emptyEditValue(target), newValue: b ?? emptyEditValue(target) })
  }
  for (const field of ['name', ...TEXT_TARGETS] as const) compare(field, stored[field], edited[field])
  compare('schedules', stored.schedules, edited.schedules)
  stored.services.forEach((service, i) => {
    for (const field of SERVICE_FIELDS) compare(`services.${i}.${field}`, service[field], edited.services[i]?.[field])
  })
  return changes
})

const addressOf = (p: PantryDraft): AddressFields => ({
  address1: p.address1.trim(),
  address2: (p.address2 ?? '').trim(),
  city: p.city.trim(),
  state: p.state.trim(),
  zipCode: p.zipCode.trim(),
})
const addressLine = (p: PantryDraft) => {
  const a = addressOf(p)
  return [a.address1, a.address2, `${a.city}, ${a.state} ${a.zipCode}`].filter(Boolean).join(', ')
}
const addressChanged = computed(() => {
  if (!detail.value || !draft.value) return false
  const stored = addressOf(detail.value.pantry)
  const edited = addressOf(draft.value)
  return ADDRESS_FIELDS.some((f) => stored[f] !== edited[f])
})

const changeCount = computed(() => fieldChanges.value.length + (addressChanged.value ? 1 : 0))

const reset = () => { if (detail.value) draft.value = deepClone(detail.value.pantry) }

const confirmOpen = ref(false)
const saving = ref(false)
// A new name or address isn't on the browse-by-city pages until the index is rebuilt.
const browseIndexStale = ref(false)

const save = async () => {
  if (!detail.value || !draft.value) return
  saving.value = true
  try {
    const renamed = fieldChanges.value.some((c) => c.target === 'name')
    const res = await api<UpdatePantryResponse>(`/admin/pantries/${id}`, {
      method: 'PATCH',
      body: {
        baseUpdatedAt: detail.value.updatedAt,
        fields: fieldChanges.value.map((c) => ({ target: c.target, value: c.newValue })),
        address: addressChanged.value ? addressOf(draft.value) : undefined,
      },
    })
    confirmOpen.value = false
    if (res.applied && (res.addressChanged || renamed)) browseIndexStale.value = true
    toast.add(
      res.applied
        ? { title: `Saved ${res.applied} change(s)`, color: 'success' }
        : { title: 'Nothing to save', description: 'The values match what is stored.', color: 'neutral' },
    )
    await refresh()
  } catch (err) {
    toast.add({ title: 'Save failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <template v-if="detail && draft">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold">{{ detail.pantry.name }}</h1>
        <ExternalLinkButton :to="pantryUrl(id)" label="View on pantryfinder.org" />
        <UButton
          label="Change log"
          icon="i-lucide-history"
          size="xs"
          color="neutral"
          variant="outline"
          :to="{ path: '/changes', query: { pantryId: id } }"
        />
      </div>
      <p class="text-sm text-(--ui-text-muted)">
        <span class="font-mono">{{ id }}</span>
        <template v-if="detail.source"> · from {{ detail.source }}</template>
        · {{ detail.coordinates.latitude }}, {{ detail.coordinates.longitude }}
        · updated {{ formatDateTime(detail.updatedAt) }}
        <template v-if="detail.lastCrawledAt !== undefined">
          · {{ detail.lastCrawledAt ? `crawled ${formatDateTime(detail.lastCrawledAt)}` : 'not crawled yet' }}
        </template>
      </p>

      <UAlert
        v-if="crawlerMaintained.length"
        color="info"
        variant="subtle"
        icon="i-lucide-bot"
        title="Some fields are kept up to date by the crawler"
        :description="`${crawlerMaintained.join(', ')}. An edit here stays until the pantry's website changes; the crawler then writes the new value over it.`"
      />
      <UAlert
        v-if="browseIndexStale"
        color="warning"
        variant="subtle"
        title="Name or address changed"
        description="Re-run tools/sitemap so the browse-by-city pages show it."
      />

      <UCard>
        <div class="flex flex-col gap-4">
          <div class="grid md:grid-cols-3 gap-3">
            <UFormField
              v-for="f in PANTRY_TEXT_FIELDS"
              :key="f.key"
              :label="f.label"
              :required="f.required"
              :hint="sourceHint(f.key)"
            >
              <UInput v-model="draft[f.key]" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="About" :hint="sourceHint('aboutUs')">
            <UTextarea v-model="draft.aboutUs" :rows="3" autoresize class="w-full" />
          </UFormField>
          <UFormField label="Notes" :hint="sourceHint('notes')">
            <UTextarea v-model="draft.notes" :rows="2" autoresize class="w-full" />
          </UFormField>
          <UFormField label="Operating hours (pantry-level)" :hint="sourceHint('schedules')">
            <ScheduleEditor v-model="draft.schedules" />
          </UFormField>
          <UFormField
            label="Services"
            :hint="sourceHint('services')"
            help="Services can't be added or removed here."
          >
            <ServicesEditor v-model="draft.services" fixed />
          </UFormField>
        </div>
      </UCard>

      <div class="flex justify-end gap-2">
        <UButton label="Discard edits" color="neutral" variant="ghost" :disabled="!changeCount" @click="reset" />
        <UButton
          :label="changeCount ? `Review ${changeCount} change(s)` : 'No changes'"
          :disabled="!changeCount"
          @click="confirmOpen = true"
        />
      </div>

      <UModal v-model:open="confirmOpen" title="Save changes">
        <template #body>
          <div class="flex flex-col gap-4">
            <div v-if="addressChanged" class="flex flex-col gap-1">
              <div class="text-sm font-medium">Address</div>
              <div class="grid grid-cols-2 gap-3 text-sm">
                <p class="text-(--ui-text-muted)">{{ addressLine(detail.pantry) }}</p>
                <p>{{ addressLine(draft) }}</p>
              </div>
              <p class="text-xs text-(--ui-text-muted)">The new address is geocoded; the pantry moves on the map.</p>
            </div>
            <div v-for="c in fieldChanges" :key="c.target" class="flex flex-col gap-1">
              <div class="text-sm font-medium">{{ targetLabel(c.target, serviceNames) }}</div>
              <div class="grid grid-cols-2 gap-3">
                <div class="text-(--ui-text-muted)"><TargetValueView :value="c.oldValue" /></div>
                <TargetValueView :value="c.newValue" />
              </div>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="confirmOpen = false" />
            <UButton label="Save" :loading="saving" @click="save" />
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
