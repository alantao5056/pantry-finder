<script setup lang="ts">
import type { CrawlRunStatus, CrawlRunSummary, ListCrawlRunsResponse } from '@pantry-finder/shared'
import type { TableColumn } from '@nuxt/ui'

// Read-only view of `crawl_runs`. The crawler itself (tools/crawler) is run by
// hand; this page only reports on it.
const api = useApi()

const { data, pending, error, refresh } = await useAsyncData(
  'crawl-runs',
  () => api<ListCrawlRunsResponse>('/admin/crawl-runs'),
)

const STATUS_COLORS: Record<CrawlRunStatus, 'info' | 'success' | 'error' | 'neutral'> = {
  running: 'info',
  completed: 'success',
  failed: 'error',
  aborted: 'neutral',
}

const columns: TableColumn<CrawlRunSummary>[] = [
  { accessorKey: 'startedAt', header: 'Started' },
  { accessorKey: 'env', header: 'Env' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'counts', header: 'Fetched / failed / auto-updated / to review' },
  { accessorKey: 'errors', header: 'Errors' },
  { id: 'changes', header: '' },
]

const expanded = ref<string | null>(null)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Crawler runs</h1>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable :data="data?.runs ?? []" :columns="columns" :loading="pending" empty="No crawler runs yet.">
        <template #startedAt-cell="{ row }">
          <div>{{ formatDateTime(row.original.startedAt) }}</div>
          <div v-if="row.original.finishedAt" class="text-xs text-(--ui-text-muted)">
            finished {{ formatDateTime(row.original.finishedAt) }}
          </div>
        </template>
        <template #status-cell="{ row }">
          <UBadge :label="row.original.status" :color="STATUS_COLORS[row.original.status]" variant="subtle" />
        </template>
        <template #counts-cell="{ row }">
          {{ row.original.counts.fetched }} / {{ row.original.counts.failed }} /
          {{ row.original.counts.autoUpdated }} / {{ row.original.counts.reviewItemsCreated }}
        </template>
        <template #errors-cell="{ row }">
          <span v-if="row.original.errors.length === 0" class="text-(--ui-text-dimmed)">—</span>
          <div v-else>
            <UButton
              :label="`${row.original.errors.length} error(s)`"
              color="error"
              variant="link"
              size="xs"
              class="px-0"
              @click="expanded = expanded === row.original.id ? null : row.original.id"
            />
            <ul v-if="expanded === row.original.id" class="mt-1 text-xs font-mono whitespace-pre-wrap">
              <li v-for="(e, i) in row.original.errors" :key="i">{{ e }}</li>
            </ul>
          </div>
        </template>
        <template #changes-cell="{ row }">
          <UButton
            :to="{ path: '/changes', query: { runId: row.original.id } }"
            label="Changes"
            icon="i-lucide-history"
            color="neutral"
            variant="ghost"
            size="xs"
          />
        </template>
      </UTable>
    </UCard>
  </div>
</template>
