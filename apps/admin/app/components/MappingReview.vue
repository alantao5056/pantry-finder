<script setup lang="ts">
import type {
  ConfirmMappingField,
  ConfirmMappingResponse,
  MappingReviewDetail,
  TargetValue,
} from '@pantry-finder/shared'

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

// Per target: picked candidate (null = no source on the site) and the value to apply.
interface Choice { candidateIndex: number | null; value: TargetValue | null }
const choices = ref<Record<string, Choice>>({})
watch(detail, (d) => {
  choices.value = Object.fromEntries((d?.fields ?? []).map((f) => {
    const index = f.confirmedCandidate !== undefined ? f.confirmedCandidate : 0
    return [f.target, { candidateIndex: index, value: index === null ? null : deepClone(f.candidates[index]!.value) }]
  }))
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
      body: { fields },
    })
    toast.add({ title: `Mapping confirmed · ${res.applied} field(s) updated`, color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Confirm failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    confirming.value = false
  }
}

const rejectOpen = ref(false)
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <template v-if="detail">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold">{{ detail.pantryName }}</h1>
        <UBadge :label="detail.item.status" :color="REVIEW_STATUS_COLORS[detail.item.status]" variant="subtle" />
        <ExternalLinkButton :to="pantryUrl(detail.pantryId)" label="View on pantryfinder.org" />
        <ExternalLinkButton :to="detail.website" :label="detail.website" />
        <span class="text-sm text-(--ui-text-muted)">Fetched {{ formatDateTime(detail.fetchedAt) }}</span>
      </div>
      <p class="text-sm text-(--ui-text-muted)">
        For each field, pick the page region its value should come from, or "Not on this site".
        The crawler keeps reading confirmed regions and applies changes automatically.
      </p>
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

      <div v-if="isPending" class="flex justify-end gap-2">
        <UButton label="Reject all" color="error" variant="outline" @click="rejectOpen = true" />
        <UButton label="Confirm & apply" :loading="confirming" @click="confirm" />
      </div>
    </template>

    <RejectItemModal v-model:open="rejectOpen" :item-id="id" title="Reject mapping proposal" @rejected="refresh()" />
  </div>
</template>
