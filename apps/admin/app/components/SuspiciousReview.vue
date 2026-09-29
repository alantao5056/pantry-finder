<script setup lang="ts">
import type { SuspiciousReviewDetail, TargetValue } from '@pantry-finder/shared'

// Detail view for a `suspicious_value` review item: a value the crawler read
// but held back (guardrail). Approving applies the (possibly edited) value.
const props = defineProps<{ id: string }>()
const api = useApi()
const toast = useToast()
const pantryUrl = usePantryUrl()

const { data: detail, error, refresh } = await useAsyncData(
  `suspicious-review-${props.id}`,
  () => api<SuspiciousReviewDetail>(`/admin/review-items/${props.id}/suspicious`),
)

const isPending = computed(() => detail.value?.item.status === 'pending')

const value = ref<TargetValue>('')
watch(detail, (d) => { if (d) value.value = deepClone(d.proposedValue) }, { immediate: true })

const approving = ref(false)
const approve = async () => {
  approving.value = true
  try {
    await api(`/admin/review-items/${props.id}/approve-value`, { method: 'POST', body: { value: value.value } })
    toast.add({ title: 'Value applied', color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Approve failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    approving.value = false
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
        <ExternalLinkButton :to="pantryUrl(detail.pantryId)" label="View on pantryfinder.org" />
        <span class="text-sm text-(--ui-text-muted)">{{ targetLabel(detail.target, detail.serviceNames) }}</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="r in detail.reasons"
          :key="r"
          :label="SUSPICIOUS_REASON_LABELS[r]"
          color="warning"
          variant="subtle"
        />
      </div>
      <UAlert
        v-if="detail.rejectionReason"
        color="neutral"
        variant="subtle"
        title="Rejected"
        :description="detail.rejectionReason"
      />

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-semibold">Page text</h2>
            <ULink :to="detail.url" target="_blank" class="text-sm truncate">{{ detail.url }}</ULink>
          </div>
        </template>
        <pre class="raw-text">{{ detail.rawText }}</pre>
      </UCard>

      <div class="grid lg:grid-cols-2 gap-4">
        <UCard>
          <template #header><h2 class="font-semibold">Current value</h2></template>
          <TargetValueView :value="detail.currentValue" />
        </UCard>
        <UCard>
          <template #header><h2 class="font-semibold">{{ isPending ? 'Value to apply' : 'Crawled value' }}</h2></template>
          <TargetValueEditor v-if="isPending" v-model="value" />
          <TargetValueView v-else :value="detail.proposedValue" />
        </UCard>
      </div>

      <div v-if="isPending" class="flex justify-end gap-2">
        <UButton label="Delete" icon="i-lucide-trash-2" color="neutral" variant="outline" @click="deleteOpen = true" />
        <UButton label="Reject" color="error" variant="outline" @click="rejectOpen = true" />
        <UButton label="Apply value" :loading="approving" @click="approve" />
      </div>
    </template>

    <RejectItemModal v-model:open="rejectOpen" :item-id="id" title="Reject crawled value" @rejected="refresh()" />
    <DeleteReviewItemModal v-model:open="deleteOpen" :item-id="id" />
  </div>
</template>
