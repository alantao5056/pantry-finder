<script setup lang="ts">
import type { CrawlRunSummary, ListCrawlRunsResponse } from '@pantry-finder/shared'
import type { TableColumn } from '@nuxt/ui'

// All recent `crawl_runs` (started here or from the CLI): progress, log, stop.
const api = useApi()
const { stopping, stop } = useCrawlRunActions()

const { data, pending, error, refresh } = await useAsyncData(
  'crawl-runs',
  () => api<ListCrawlRunsResponse>('/admin/crawl-runs'),
)

const activeRun = computed(() => data.value?.runs.find(isActiveRun) ?? null)

const columns: TableColumn<CrawlRunSummary>[] = [
  { accessorKey: 'startedAt', header: 'Started' },
  { accessorKey: 'env', header: 'Env' },
  { accessorKey: 'mode', header: 'Mode' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'counts', header: 'Fetched / failed / auto-updated / to review' },
  { accessorKey: 'errors', header: 'Errors' },
  { id: 'actions', header: '' },
]

const expanded = ref<string | null>(null)
const logRunId = ref<string | null>(null)
const logRun = computed(() => data.value?.runs.find((r) => r.id === logRunId.value) ?? null)

const toggleLog = (id: string) => {
  logRunId.value = logRunId.value === id ? null : id
}

// Only the active run (1 read) is polled while a run is in progress; the whole
// list (50 reads) only when that run's status changes.
const pollRun = async (id: string) => {
  const fresh = await api<CrawlRunSummary>(`/admin/crawl-runs/${id}`)
  const runs = data.value?.runs
  const i = runs?.findIndex((r) => r.id === id) ?? -1
  if (!runs || i === -1) return
  const statusChanged = runs[i]!.status !== fresh.status
  runs[i] = fresh
  if (statusChanged && !isActiveRun(fresh)) await refresh()
}

const stopRun = async (run: CrawlRunSummary) => {
  if (await stop(run)) await pollRun(run.id).catch(() => {})
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(async () => {
    const run = activeRun.value
    if (!run) return
    try {
      await pollRun(run.id)
    } catch {
      // Transient; the next tick tries again.
    }
  }, CRAWL_RUN_POLL_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <UButton to="/crawler" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="Back to crawler" />
        <h1 class="text-xl font-semibold">Crawler runs</h1>
      </div>
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
          <div v-if="row.original.requestedBy" class="text-xs text-(--ui-text-muted)">
            by {{ row.original.requestedBy }}
          </div>
        </template>
        <template #env-cell="{ row }">
          {{ row.original.env || '—' }}
        </template>
        <template #mode-cell="{ row }">
          <div>{{ row.original.mode }}</div>
          <div class="text-xs text-(--ui-text-muted)">{{ crawlRunScope(row.original) }}</div>
          <div v-if="crawlRunLlmLine(row.original)" class="text-xs text-(--ui-text-muted)">
            {{ crawlRunLlmLine(row.original) }}
          </div>
        </template>
        <template #status-cell="{ row }">
          <CrawlRunStatus :run="row.original" />
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
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              v-if="canStopRun(row.original)"
              label="Stop"
              icon="i-lucide-square"
              color="error"
              variant="outline"
              size="xs"
              :loading="stopping === row.original.id"
              @click="stopRun(row.original)"
            />
            <UButton
              v-if="row.original.requestedBy"
              label="Log"
              icon="i-lucide-scroll-text"
              color="neutral"
              :variant="logRunId === row.original.id ? 'soft' : 'ghost'"
              size="xs"
              @click="toggleLog(row.original.id)"
            />
            <UButton
              v-if="row.original.mode === 'apply'"
              :to="{ path: '/changes', query: { runId: row.original.id } }"
              label="Changes"
              icon="i-lucide-history"
              color="neutral"
              variant="ghost"
              size="xs"
            />
          </div>
        </template>
      </UTable>
    </UCard>

    <UCard v-if="logRunId">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-medium">
            Log — {{ logRun ? formatDateTime(logRun.startedAt) : logRunId }}
            <span v-if="logRun" class="text-sm font-normal text-(--ui-text-muted)">({{ logRun.mode }}, {{ logRun.status }})</span>
          </h2>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" @click="logRunId = null" />
        </div>
      </template>
      <CrawlRunLog :run-id="logRunId" :active="!!logRun && isActiveRun(logRun)" />
    </UCard>
  </div>
</template>
