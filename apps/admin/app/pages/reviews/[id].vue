<script setup lang="ts">
import type { ReviewItemSummary } from '@pantry-finder/shared'

// Review item detail: dispatches to the view for the item's type.
const route = useRoute()
const api = useApi()
const id = route.params.id as string

const { data: item, error } = await useAsyncData(
  `review-item-${id}`,
  () => api<ReviewItemSummary>(`/admin/review-items/${id}`),
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <UButton to="/reviews" label="Review queue" icon="i-lucide-arrow-left" color="neutral" variant="link" class="px-0" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <template v-if="item">
      <SubmissionReview v-if="item.type === 'user_submission'" :id="id" />
      <MappingReview v-else-if="item.type === 'new_mapping'" :id="id" />
      <SuspiciousReview v-else-if="item.type === 'suspicious_value'" :id="id" />
      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        :title="`${REVIEW_TYPE_LABELS[item.type]} items can't be reviewed here yet.`"
      />
    </template>
  </div>
</template>
