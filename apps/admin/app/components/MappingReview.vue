<script setup lang="ts">
import type {
  AddressFields,
  ConfirmMappingField,
  ConfirmMappingResponse,
  MappingReviewDetail,
  SiteCheck,
  TargetValue,
} from '@pantry-finder/shared'
import { parseAddressLine } from '@pantry-finder/shared'

// Detail view for a `new_mapping` review item: for each target the crawler
// proposed, pick the right page region (or none) and check the parsed value.
// Confirming applies the values and makes the crawler follow those regions.
const props = defineProps<{ id: string }>()
const api = useApi()
const toast = useToast()
const pantryUrl = usePantryUrl()

const { data: detail, error, refresh } = await useAsyncData(
  `mapping-review-${props.id}`,
  () => api<MappingReviewDetail>(`/admin/review-items/${props.id}/mapping`),
)

const isPending = computed(() => detail.value?.item.status === 'pending')

// Does the site state the pantry's address / phone? A badge each, and a
// warning with both sides when it doesn't.
interface SiteCheckView {
  key: string
  check: SiteCheck
  label: string
  icon: string
  stored?: string
  warning: string
}
const siteChecks = computed<SiteCheckView[]>(() => {
  const d = detail.value
  if (!d) return []
  const views: SiteCheckView[] = []
  if (d.addressCheck) {
    views.push({
      key: 'address',
      check: d.addressCheck,
      label: ADDRESS_CHECK_LABELS[d.addressCheck.status],
      icon: 'i-lucide-map-pin-check',
      stored: d.storedAddress,
      warning: d.addressCheck.status === 'not_found'
        ? "The site doesn't state an address — make sure it belongs to this pantry."
        : "The site's address differs from the pantry's — make sure it belongs to this pantry.",
    })
  }
  if (d.phoneCheck) {
    views.push({
      key: 'phone',
      check: d.phoneCheck,
      label: PHONE_CHECK_LABELS[d.phoneCheck.status],
      icon: 'i-lucide-phone',
      stored: d.storedPhone,
      warning: d.phoneCheck.status === 'not_found'
        ? "The site doesn't list a phone number — make sure it belongs to this pantry."
        : "The site's phone numbers differ from the pantry's — make sure it belongs to this pantry.",
    })
  }
  return views
})

// Address: offered like a field when the site states a different one. Index
// into the found addresses (null = keep the pantry's) and the fields to apply.
const addressOptions = computed(() => detail.value?.addressCheck?.status === 'mismatch' ? detail.value.addressCheck.found : [])
const addressChoice = ref<number | null>(null)
const addressDraft = ref<AddressFields | null>(null)
const pickAddress = (index: number | null) => {
  addressChoice.value = index
  addressDraft.value = index === null ? null : parseAddressLine(addressOptions.value[index]!)
}
const addressInputs: { key: keyof AddressFields; label: string; required?: boolean }[] = [
  { key: 'address1', label: 'Street address', required: true },
  { key: 'address2', label: 'Address line 2' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State (2-letter)', required: true },
  { key: 'zipCode', label: 'ZIP code', required: true },
]
const oneLine = (a: AddressFields) => [a.address1, a.address2, a.city, `${a.state} ${a.zipCode}`].filter(Boolean).join(', ')

// Per target: picked candidate (null = no source on the site) and the value to apply.
interface Choice { candidateIndex: number | null; value: TargetValue | null }
const choices = ref<Record<string, Choice>>({})
watch(detail, (d) => {
  choices.value = Object.fromEntries((d?.fields ?? []).map((f) => {
    const index = f.confirmedCandidate !== undefined ? f.confirmedCandidate : 0
    return [f.target, { candidateIndex: index, value: index === null ? null : deepClone(f.candidates[index]!.value) }]
  }))
  pickAddress(null)
}, { immediate: true })

const pick = (target: string, index: number | null) => {
  const field = detail.value!.fields.find((f) => f.target === target)!
  choices.value[target] = { candidateIndex: index, value: index === null ? null : deepClone(field.candidates[index]!.value) }
}

const confirming = ref(false)
const confirm = async () => {
  confirming.value = true
  try {
    const fields: ConfirmMappingField[] = Object.entries(choices.value).map(([target, c]) => ({
      target: target as ConfirmMappingField['target'],
      candidateIndex: c.candidateIndex,
      ...(c.candidateIndex !== null && c.value !== null ? { value: c.value } : {}),
    }))
    const res = await api<ConfirmMappingResponse>(`/admin/review-items/${props.id}/confirm-mapping`, {
      method: 'POST',
      body: { fields, ...(addressDraft.value ? { address: addressDraft.value } : {}) },
    })
    toast.add({ title: `Mapping confirmed · ${res.applied} change(s) applied`, color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Confirm failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    confirming.value = false
  }
}

const rejectOpen = ref(false)
const deleteOpen = ref(false)
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <template v-if="detail">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold">{{ detail.pantryName }}</h1>
        <UBadge :label="detail.item.status" :color="REVIEW_STATUS_COLORS[detail.item.status]" variant="subtle" />
        <UBadge
          v-for="c in siteChecks"
          :key="c.key"
          :label="c.label"
          :color="SITE_CHECK_COLORS[c.check.status]"
          :icon="c.check.status === 'match' ? c.icon : 'i-lucide-triangle-alert'"
          variant="subtle"
        />
        <ExternalLinkButton :to="pantryUrl(detail.pantryId)" label="View on pantryfinder.org" />
        <ExternalLinkButton :to="detail.website" :label="detail.website" />
        <span class="text-sm text-(--ui-text-muted)">Fetched {{ formatDateTime(detail.fetchedAt) }}</span>
      </div>
      <p class="text-sm text-(--ui-text-muted)">
        For each field, pick the page region its value should come from, or "Not on this site".
        The crawler keeps reading confirmed regions and applies changes automatically.
      </p>
      <template v-for="c in siteChecks" :key="c.key">
        <UAlert
          v-if="c.check.status !== 'match'"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="c.warning"
        >
          <template #description>
            <div>Pantry: {{ c.stored }}</div>
            <div v-for="v in c.check.found" :key="v">On site: {{ v }}</div>
          </template>
        </UAlert>
      </template>
      <UAlert
        v-if="detail.rejectionReason"
        color="neutral"
        variant="subtle"
        title="Rejected"
        :description="detail.rejectionReason"
      />

      <UCard v-for="field in detail.fields" :key="field.target">
        <template #header>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-semibold">{{ targetLabel(field.target, detail.serviceNames) }}</h2>
            <span class="text-xs font-mono text-(--ui-text-dimmed)">{{ field.target }}</span>
          </div>
        </template>

        <div class="grid lg:grid-cols-[1fr_2fr] gap-4">
          <div>
            <div class="text-xs uppercase text-(--ui-text-muted) mb-1">Current value</div>
            <TargetValueView :value="field.currentValue" />
          </div>

          <fieldset :disabled="!isPending" class="flex flex-col gap-2">
            <label
              v-for="(c, i) in field.candidates"
              :key="i"
              class="candidate"
              :class="{ 'candidate-picked': choices[field.target]?.candidateIndex === i }"
            >
              <div class="flex items-start gap-2">
                <input
                  type="radio"
                  :name="field.target"
                  :checked="choices[field.target]?.candidateIndex === i"
                  class="mt-1"
                  @change="pick(field.target, i)"
                >
                <div class="flex flex-col gap-1 min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 text-xs text-(--ui-text-muted)">
                    <span>Candidate {{ i + 1 }}</span>
                    <UBadge v-if="c.uncertain" label="LLM unsure" color="warning" variant="subtle" size="sm" />
                    <ULink :to="c.url" target="_blank" class="truncate">{{ c.url }}</ULink>
                    <span v-if="c.textAnchor">under “{{ c.textAnchor }}”</span>
                  </div>
                  <pre class="raw-text">{{ c.rawText }}</pre>
                  <TargetValueView :value="c.value" />
                </div>
              </div>
            </label>
            <label class="candidate" :class="{ 'candidate-picked': choices[field.target]?.candidateIndex === null }">
              <div class="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  :name="field.target"
                  :checked="choices[field.target]?.candidateIndex === null"
                  @change="pick(field.target, null)"
                >
                Not on this site — don't track this field
              </div>
            </label>

            <div v-if="isPending && choices[field.target]?.value != null" class="mt-2">
              <div class="text-xs uppercase text-(--ui-text-muted) mb-1">Value to apply (edit if the parse is wrong)</div>
              <TargetValueEditor v-model="choices[field.target]!.value!" />
            </div>
          </fieldset>
        </div>
      </UCard>

      <UCard v-if="addressOptions.length">
        <template #header>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-semibold">Address</h2>
            <span class="text-xs text-(--ui-text-dimmed)">Coordinates are re-geocoded from the new address</span>
          </div>
        </template>

        <div class="grid lg:grid-cols-[1fr_2fr] gap-4">
          <div>
            <div class="text-xs uppercase text-(--ui-text-muted) mb-1">Current value</div>
            <div class="text-sm">{{ detail.storedAddress }}</div>
          </div>

          <div v-if="!isPending" class="text-sm">
            <template v-if="detail.confirmedAddress">Moved to {{ oneLine(detail.confirmedAddress) }}</template>
            <template v-else-if="detail.confirmedAddress === null">Kept the pantry's address</template>
          </div>
          <div v-else class="flex flex-col gap-2">
            <label
              v-for="(a, i) in addressOptions"
              :key="a"
              class="candidate"
              :class="{ 'candidate-picked': addressChoice === i }"
            >
              <div class="flex items-center gap-2 text-sm">
                <input type="radio" name="address" :checked="addressChoice === i" @change="pickAddress(i)">
                Move to: {{ a }}
              </div>
            </label>
            <label class="candidate" :class="{ 'candidate-picked': addressChoice === null }">
              <div class="flex items-center gap-2 text-sm">
                <input type="radio" name="address" :checked="addressChoice === null" @change="pickAddress(null)">
                Keep the pantry's address
              </div>
            </label>

            <div v-if="addressDraft" class="mt-2">
              <div class="text-xs uppercase text-(--ui-text-muted) mb-1">Address to apply (edit if the split is wrong)</div>
              <div class="grid md:grid-cols-3 gap-3">
                <UFormField v-for="f in addressInputs" :key="f.key" :label="f.label" :required="f.required">
                  <UInput v-model="addressDraft[f.key]" class="w-full" />
                </UFormField>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <div v-if="isPending" class="flex justify-end gap-2">
        <UButton label="Delete" icon="i-lucide-trash-2" color="neutral" variant="outline" @click="deleteOpen = true" />
        <UButton label="Reject all" color="error" variant="outline" @click="rejectOpen = true" />
        <UButton label="Confirm & apply" :loading="confirming" @click="confirm" />
      </div>
    </template>

    <RejectItemModal v-model:open="rejectOpen" :item-id="id" title="Reject mapping proposal" @rejected="refresh()" />
    <DeleteReviewItemModal v-model:open="deleteOpen" :item-id="id" />
  </div>
</template>
