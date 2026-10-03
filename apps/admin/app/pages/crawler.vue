<script setup lang="ts">
import {
  ACTIVE_CRAWL_RUN_STATUSES,
  DEFAULT_CRAWL_LIMIT,
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDERS,
  LLM_PROVIDER_LABELS,
  MAX_CRAWL_LIMIT,
  isPeakHour,
  llmSettingsLabel,
} from '@pantry-finder/shared'
import type {
  CrawlRunLogResponse,
  CrawlRunMode,
  CrawlRunStatus,
  CrawlRunSummary,
  ListCrawlRunsResponse,
  LlmProvider,
  LlmSettings,
  StartCrawlRunRequest,
} from '@pantry-finder/shared'
import type { TableColumn } from '@nuxt/ui'

// `crawl_runs`: start a run (executed by the crawler worker, tools/crawler/worker.ts),
// stop it, and follow its progress and log. CLI runs show up here too.
const api = useApi()
const toast = useToast()

const POLL_MS = 5000

const { data, pending, error, refresh } = await useAsyncData(
  'crawl-runs',
  () => api<ListCrawlRunsResponse>('/admin/crawl-runs'),
)

const isActive = (run: CrawlRunSummary) => ACTIVE_CRAWL_RUN_STATUSES.includes(run.status) && !run.stale
const activeRun = computed(() => data.value?.runs.find(isActive) ?? null)

const STATUS_COLORS: Record<CrawlRunStatus, 'info' | 'success' | 'error' | 'neutral' | 'warning'> = {
  queued: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'error',
  aborted: 'neutral',
}

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

// ---- start ----

const MODE_ITEMS: { label: string; value: CrawlRunMode; description: string }[] = [
  { label: 'Dry run', value: 'dry-run', description: 'Writes nothing; the log shows what would change.' },
  { label: 'Apply', value: 'apply', description: 'Updates pantries and files review items.' },
]

const LLM_ITEMS = LLM_PROVIDERS.map((value) => ({ label: LLM_PROVIDER_LABELS[value], value }))

const form = reactive<{
  mode: CrawlRunMode
  llm: LlmProvider
  /** Per provider, so switching LLMs keeps each one's choices. */
  settings: Record<LlmProvider, LlmSettings>
  limit: number
  pantryId: string
}>({
  mode: 'dry-run',
  llm: DEFAULT_LLM_PROVIDER,
  settings: { deepseek: {}, gemini: {} },
  limit: DEFAULT_CRAWL_LIMIT,
  pantryId: '',
})
const peak = isPeakHour()

/** "Gemini · gemini-3.5-flash-lite · effort low"; the model is known once the worker picked the run up. */
const llmLine = (run: CrawlRunSummary) => {
  const llm = run.options.llm
  return [llm && LLM_PROVIDER_LABELS[llm], run.model, llm && llmSettingsLabel(llm, run.options.settings)]
    .filter(Boolean)
    .join(' · ')
}
const confirmOpen = ref(false)
const starting = ref(false)

const requestStart = () => {
  if (form.mode === 'apply') confirmOpen.value = true
  else void start()
}

const start = async () => {
  starting.value = true
  try {
    const llm = { llm: form.llm, settings: form.settings[form.llm] }
    const body: StartCrawlRunRequest = form.pantryId.trim()
      ? { mode: form.mode, ...llm, pantryId: form.pantryId.trim() }
      : { mode: form.mode, ...llm, limit: form.limit }
    const run = await api<CrawlRunSummary>('/admin/crawl-runs', { method: 'POST', body })
    confirmOpen.value = false
    toast.add({ title: 'Crawl queued', description: 'The crawler worker picks it up in a moment.', color: 'success' })
    await refresh()
    openLog(run.id)
  } catch (err) {
    toast.add({ title: 'Could not start the crawl', description: apiErrorMessage(err), color: 'error' })
  } finally {
    starting.value = false
  }
}

// ---- stop ----

const stopping = ref<string | null>(null)

const stop = async (run: CrawlRunSummary) => {
  stopping.value = run.id
  try {
    await api(`/admin/crawl-runs/${run.id}/abort`, { method: 'POST' })
    toast.add({
      title: run.status === 'queued' ? 'Run cancelled' : 'Stopping',
      description: run.status === 'queued' ? undefined : 'The pantries in progress finish first.',
      color: 'success',
    })
    await pollRun(run.id)
  } catch (err) {
    toast.add({ title: 'Stop failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    stopping.value = null
  }
}

// ---- log ----

const log = reactive<{ runId: string | null; lines: string[]; lastSeq: number; loading: boolean }>({
  runId: null,
  lines: [],
  lastSeq: 0,
  loading: false,
})

const fetchLog = async () => {
  const runId = log.runId
  if (!runId) return
  const res = await api<CrawlRunLogResponse>(`/admin/crawl-runs/${runId}/log`, { query: { afterSeq: log.lastSeq } })
  if (log.runId !== runId) return
  log.lines.push(...res.lines)
  log.lastSeq = res.lastSeq
}

const openLog = (runId: string) => {
  if (log.runId === runId) {
    log.runId = null
    return
  }
  Object.assign(log, { runId, lines: [], lastSeq: 0, loading: true })
  fetchLog()
    .catch((err) => toast.add({ title: 'Could not load the log', description: apiErrorMessage(err), color: 'error' }))
    .finally(() => (log.loading = false))
}

const logRun = computed(() => data.value?.runs.find((r) => r.id === log.runId) ?? null)

// ---- polling ----
// Only the active run (1 read) and new log chunks are fetched while a run is
// in progress; the whole list (50 reads) only when that run's status changes.

const pollRun = async (id: string) => {
  const fresh = await api<CrawlRunSummary>(`/admin/crawl-runs/${id}`)
  const runs = data.value?.runs
  const i = runs?.findIndex((r) => r.id === id) ?? -1
  if (!runs || i === -1) return
  const statusChanged = runs[i]!.status !== fresh.status
  runs[i] = fresh
  if (statusChanged && !isActive(fresh)) await refresh()
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(async () => {
    const run = activeRun.value
    if (!run) return
    try {
      await pollRun(run.id)
      if (log.runId === run.id) await fetchLog()
    } catch {
      // Transient; the next tick tries again.
    }
  }, POLL_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Crawler runs</h1>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <UCard>
      <template #header>
        <h2 class="font-medium">Start crawl</h2>
      </template>
      <div class="flex flex-col gap-4">
        <URadioGroup v-model="form.mode" :items="MODE_ITEMS" orientation="horizontal" />
        <URadioGroup v-model="form.llm" :items="LLM_ITEMS" legend="LLM" orientation="horizontal" />
        <LlmSettingsFields :key="form.llm" v-model="form.settings[form.llm]" :provider="form.llm" />
        <div class="flex flex-wrap items-end gap-4">
          <UFormField label="Pantries" hint="least recently crawled first">
            <UInputNumber
              v-model="form.limit"
              :min="1"
              :max="MAX_CRAWL_LIMIT"
              :disabled="!!form.pantryId.trim()"
              class="w-32"
            />
          </UFormField>
          <UFormField label="…or one pantry" hint="optional">
            <UInput v-model="form.pantryId" placeholder="Pantry ID" class="w-64" />
          </UFormField>
          <UButton
            label="Start crawl"
            icon="i-lucide-play"
            :loading="starting && !confirmOpen"
            :disabled="!!activeRun"
            @click="requestStart"
          />
        </div>
        <p class="text-xs text-(--ui-text-muted)">
          Both modes fetch the sites and call the LLM, so dry runs cost money too.
          <template v-if="activeRun">Only one run at a time: wait for the current one or stop it.</template>
        </p>
        <UAlert
          v-if="peak && form.llm === 'deepseek'"
          color="warning"
          variant="subtle"
          icon="i-lucide-clock"
          title="DeepSeek peak time (Mon–Fri 01–04 / 06–10 UTC): LLM prices are doubled right now."
        />
      </div>
    </UCard>

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
          <div class="text-xs text-(--ui-text-muted)">
            {{ row.original.options.pantryId ? `pantry ${row.original.options.pantryId}` : `${row.original.options.limit ?? DEFAULT_CRAWL_LIMIT} pantries` }}
          </div>
          <div v-if="llmLine(row.original)" class="text-xs text-(--ui-text-muted)">{{ llmLine(row.original) }}</div>
        </template>
        <template #status-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge :label="row.original.status" :color="STATUS_COLORS[row.original.status]" variant="subtle" />
            <UBadge v-if="row.original.stale" label="stale" color="error" variant="outline" />
            <UBadge
              v-else-if="row.original.abortRequested && row.original.status === 'running'"
              label="stopping"
              color="neutral"
              variant="outline"
            />
          </div>
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
              v-if="ACTIVE_CRAWL_RUN_STATUSES.includes(row.original.status) && !row.original.abortRequested"
              label="Stop"
              icon="i-lucide-square"
              color="error"
              variant="outline"
              size="xs"
              :loading="stopping === row.original.id"
              @click="stop(row.original)"
            />
            <UButton
              v-if="row.original.requestedBy"
              label="Log"
              icon="i-lucide-scroll-text"
              color="neutral"
              :variant="log.runId === row.original.id ? 'soft' : 'ghost'"
              size="xs"
              @click="openLog(row.original.id)"
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

    <UCard v-if="log.runId">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-medium">
            Log — {{ logRun ? formatDateTime(logRun.startedAt) : log.runId }}
            <span v-if="logRun" class="text-sm font-normal text-(--ui-text-muted)">({{ logRun.mode }}, {{ logRun.status }})</span>
          </h2>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" @click="log.runId = null" />
        </div>
      </template>
      <p v-if="log.loading" class="text-sm text-(--ui-text-muted)">Loading…</p>
      <p v-else-if="log.lines.length === 0" class="text-sm text-(--ui-text-muted)">
        {{ logRun && isActive(logRun) ? 'Waiting for the crawler…' : 'No log for this run.' }}
      </p>
      <pre v-else class="text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto">{{ log.lines.join('\n') }}</pre>
    </UCard>

    <UModal v-model:open="confirmOpen" title="Start an apply run">
      <template #body>
        <p class="text-sm">
          Crawls
          {{ form.pantryId.trim() ? `pantry ${form.pantryId.trim()}` : `the ${form.limit} least recently crawled pantries` }}
          with {{ LLM_PROVIDER_LABELS[form.llm] }} ({{ form.settings[form.llm].model ?? 'env model' }},
          {{ llmSettingsLabel(form.llm, form.settings[form.llm]) }}) and <strong>writes the results</strong>: confirmed mappings update live pantry data (revertible from the
          change log) and new findings go to the review queue.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="confirmOpen = false" />
          <UButton label="Start apply run" :loading="starting" @click="start" />
        </div>
      </template>
    </UModal>
  </div>
</template>
