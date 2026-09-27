<script setup lang="ts">
import type { ListReviewItemsResponse, ReviewItemStatus, ReviewItemSummary } from '@pantry-finder/shared'
import type { TableColumn, TableRow } from '@nuxt/ui'

const api = useApi()
const route = useRoute()
const router = useRouter()

const tabs = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

const status = computed<ReviewItemStatus>({
  get: () => (['approved', 'rejected'].includes(route.query.status as string)
    ? route.query.status as ReviewItemStatus
    : 'pending'),
  set: (value) => router.replace({ query: { status: value } }),
})

const { data, pending, error, refresh } = await useAsyncData(
  'review-items',
  () => api<ListReviewItemsResponse>('/admin/review-items', { query: { status: status.value } }),
  { watch: [status] },
)

const columns: TableColumn<ReviewItemSummary>[] = [
  { accessorKey: 'title', header: 'Pantry' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'createdAt', header: 'Created' },
  { accessorKey: 'resolvedBy', header: 'Resolved by' },
]

// Only user submissions have a detail page in M1.
const open = (_e: Event, row: TableRow<ReviewItemSummary>) => {
  if (row.original.type === 'user_submission') navigateTo(`/reviews/${row.original.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Review queue</h1>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
    </div>

    <UTabs v-model="status" :items="tabs" :content="false" />

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable
        :data="data?.items ?? []"
        :columns="columns"
        :loading="pending"
        empty="Nothing here."
        class="cursor-pointer"
        :on-select="open"
      >
        <template #title-cell="{ row }">
          <div class="font-medium">{{ row.original.title }}</div>
          <div class="text-xs text-(--ui-text-muted)">{{ row.original.subtitle }}</div>
        </template>
        <template #type-cell="{ row }">
          <UBadge :label="REVIEW_TYPE_LABELS[row.original.type]" color="neutral" variant="subtle" />
        </template>
        <template #createdAt-cell="{ row }">
          {{ formatDateTime(row.original.createdAt) }}
        </template>
        <template #resolvedBy-cell="{ row }">
          <span v-if="row.original.resolvedBy">
            {{ row.original.resolvedBy }}
            <span class="text-xs text-(--ui-text-muted)">· {{ formatDateTime(row.original.resolvedAt) }}</span>
          </span>
          <span v-else class="text-(--ui-text-dimmed)">—</span>
        </template>
      </UTable>
    </UCard>
  </div>
</template>
