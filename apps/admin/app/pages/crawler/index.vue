<script setup lang="ts">
import {
  DEFAULT_CRAWL_LIMIT,
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDERS,
  LLM_PROVIDER_LABELS,
  MAX_CRAWL_LIMIT,
  isPeakHour,
  llmSettingsLabel,
} from '@pantry-finder/shared'
import type {
  CrawlRunMode,
  CrawlRunSummary,
  ListCrawlRunsResponse,
  LlmProvider,
  LlmSettings,
  StartCrawlRunRequest,
} from '@pantry-finder/shared'

// Start a crawl run (executed by the crawler worker, tools/crawler/worker.ts)
// and follow the latest one. The full history is on /crawler/runs.
const api = useApi()
const toast = useToast()
const { stopping, stop } = useCrawlRunActions()

// Only one run can be active at a time, so the newest is the one to watch (1 read).
const { data, pending, error, refresh } = await useAsyncData(
  'crawl-runs-latest',
  () => api<ListCrawlRunsResponse>('/admin/crawl-runs', { query: { limit: 1 } }),
)

const latest = computed(() => data.value?.runs[0] ?? null)
const activeRun = computed(() => (latest.value && isActiveRun(latest.value) ? latest.value : null))

// ---- start ----

const MODE_ITEMS: { label: string; value: CrawlRunMode }[] = [
  { label: 'Dry run', value: 'dry-run' },
  { label: 'Apply', value: 'apply' },
]
/** Shown as the Mode field's hint for the selected mode. */
const MODE_HINTS: Record<CrawlRunMode, string> = {
  'dry-run': 'writes nothing, only logs',
  apply: 'updates pantries + review queue',
}

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
    data.value = { runs: [run] }
    logOpen.value = true
  } catch (err) {
    toast.add({ title: 'Could not start the crawl', description: apiErrorMessage(err), color: 'error' })
  } finally {
    starting.value = false
  }
}

// ---- latest run ----

const logOpen = ref(false)
const errorsOpen = ref(false)
watch(() => latest.value?.id, () => (errorsOpen.value = false))

const pollLatest = async () => {
  const run = latest.value
  if (!run) return
  const fresh = await api<CrawlRunSummary>(`/admin/crawl-runs/${run.id}`)
  if (latest.value?.id === fresh.id) data.value = { runs: [fresh] }
}

const stopRun = async (run: CrawlRunSummary) => {
  if (await stop(run)) await pollLatest().catch(() => {})
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(async () => {
    if (!activeRun.value) return
    try {
      await pollLatest()
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
      <h1 class="text-xl font-semibold">Crawler</h1>
      <div class="flex items-center gap-1">
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
        <UButton
          to="/crawler/runs"
          label="View all runs"
          trailing-icon="i-lucide-arrow-right"
          color="neutral"
          variant="outline"
        />
      </div>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <UCard>
      <template #header>
        <h2 class="font-medium">Start crawl</h2>
      </template>

      <div class="flex flex-col gap-6">
        <!-- Scope takes the left half (two narrow inputs), the mode the right half. -->
        <div class="grid gap-x-6 gap-y-4 md:grid-cols-4">
          <UFormField label="Pantries" hint="least recently crawled first">
            <UInputNumber
              v-model="form.limit"
              :min="1"
              :max="MAX_CRAWL_LIMIT"
              :disabled="!!form.pantryId.trim()"
              class="w-full"
            />
          </UFormField>
          <UFormField label="…or one pantry" hint="optional">
            <UInput v-model="form.pantryId" placeholder="Pantry ID" class="w-full" />
          </UFormField>
          <!-- Cards held to the input height (h-8) so the row lines up. -->
          <UFormField label="Mode" :hint="MODE_HINTS[form.mode]" class="md:col-span-2">
            <URadioGroup
              v-model="form.mode"
              :items="MODE_ITEMS"
              variant="card"
              legend="Mode"
              :ui="{ legend: 'sr-only', fieldset: 'grid gap-3 grid-cols-2', item: 'h-8 py-0 px-3 items-center' }"
            />
          </UFormField>
        </div>

        <USeparator />

        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-start gap-x-8 gap-y-4">
            <UFormField label="LLM">
              <URadioGroup
                v-model="form.llm"
                :items="LLM_ITEMS"
                legend="LLM provider"
                orientation="horizontal"
                :ui="{ legend: 'sr-only' }"
                class="h-8 flex items-center"
              />
            </UFormField>
            <LlmSettingsFields :key="form.llm" v-model="form.settings[form.llm]" :provider="form.llm" />
          </div>
          <UAlert
            v-if="peak && form.llm === 'deepseek'"
            color="warning"
            variant="subtle"
            icon="i-lucide-clock"
            title="DeepSeek peak time (Mon–Fri 01–04 / 06–10 UTC): LLM prices are doubled right now."
          />
        </div>
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-(--ui-text-muted)">
            <template v-if="activeRun">A run is in progress — wait for it or stop it.</template>
            <template v-else>Both modes fetch the sites and call the LLM, so dry runs cost money too.</template>
          </p>
          <UButton
            label="Start crawl"
            icon="i-lucide-play"
            :loading="starting && !confirmOpen"
            :disabled="!!activeRun"
            @click="requestStart"
          />
        </div>
      </template>
    </UCard>

    <UCard v-if="latest">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-medium">Latest run</h2>
            <span class="text-sm text-(--ui-text-muted)">{{ formatDateTime(latest.startedAt) }}</span>
            <CrawlRunStatus :run="latest" />
          </div>
          <div class="flex gap-1">
            <UButton
              v-if="canStopRun(latest)"
              label="Stop"
              icon="i-lucide-square"
              color="error"
              variant="outline"
              size="xs"
              :loading="stopping === latest.id"
              @click="stopRun(latest)"
            />
            <UButton
              v-if="latest.mode === 'apply'"
              :to="{ path: '/changes', query: { runId: latest.id } }"
              label="Changes"
              icon="i-lucide-history"
              color="neutral"
              variant="ghost"
              size="xs"
            />
            <UButton
              v-if="latest.requestedBy"
              label="Log"
              icon="i-lucide-scroll-text"
              color="neutral"
              :variant="logOpen ? 'soft' : 'ghost'"
              size="xs"
              @click="logOpen = !logOpen"
            />
          </div>
        </div>
      </template>

      <div class="flex flex-col gap-4">
        <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt class="text-xs text-(--ui-text-muted)">Mode</dt>
            <dd>{{ latest.mode }} · {{ crawlRunScope(latest) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-(--ui-text-muted)">LLM</dt>
            <dd>{{ crawlRunLlmLine(latest) || '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-(--ui-text-muted)">Fetched / failed / auto-updated / to review</dt>
            <dd>
              {{ latest.counts.fetched }} / {{ latest.counts.failed }} /
              {{ latest.counts.autoUpdated }} / {{ latest.counts.reviewItemsCreated }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-(--ui-text-muted)">Errors</dt>
            <dd>
              <span v-if="latest.errors.length === 0" class="text-(--ui-text-dimmed)">—</span>
              <UButton
                v-else
                :label="`${latest.errors.length} error(s)`"
                color="error"
                variant="link"
                size="xs"
                class="px-0"
                @click="errorsOpen = !errorsOpen"
              />
            </dd>
          </div>
        </dl>
        <ul v-if="errorsOpen && latest.errors.length" class="text-xs font-mono whitespace-pre-wrap">
          <li v-for="(e, i) in latest.errors" :key="i">{{ e }}</li>
        </ul>
        <CrawlRunLog v-if="logOpen" :run-id="latest.id" :active="isActiveRun(latest)" />
      </div>
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
