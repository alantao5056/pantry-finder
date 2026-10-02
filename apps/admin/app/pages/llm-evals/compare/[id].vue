<script setup lang="ts">
import { LLM_PROVIDER_LABELS, sameTargetValue } from '@pantry-finder/shared'
import type {
  LlmCompareDetail,
  LlmCompareResult,
  LlmCompareSummary,
  MappingCandidate,
  MappingTarget,
  SiteCheck,
  StartLlmCompareRequest,
  TargetValue,
} from '@pantry-finder/shared'

// One pantry's site read by both LLMs (tools/crawler/compare.ts), side by side:
// a row per field with the stored value and each LLM's best candidate.
definePageMeta({ key: (route) => route.fullPath })

const route = useRoute()
const api = useApi()
const toast = useToast()
const pantryUrl = usePantryUrl()
const id = route.params.id as string

const POLL_MS = 2000
// Queued this long, the crawler worker is probably not running.
const WORKER_HINT_MS = 30_000

const { data, error, refresh } = await useAsyncData(
  `llm-compare-${id}`,
  () => api<LlmCompareDetail>(`/admin/llm-compares/${id}`),
)

const inProgress = computed(() => data.value?.status === 'queued' || data.value?.status === 'running')
const now = ref(Date.now())
const workerHint = computed(
  () => data.value?.status === 'queued' && now.value - new Date(data.value.createdAt).getTime() > WORKER_HINT_MS,
)

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(async () => {
    if (!inProgress.value) return
    now.value = Date.now()
    try {
      await refresh()
    } catch {
      // Transient; the next tick tries again.
    }
  }, POLL_MS)
})
onBeforeUnmount(() => clearInterval(timer))

// ---- rows ----

type Verdict = 'same' | 'differ' | 'partial' | 'none'

interface Cell {
  /** The LLM's best candidate; undefined when it didn't propose the field. */
  best: MappingCandidate | undefined
  matchesStored: boolean
}

interface Row {
  target: MappingTarget
  stored: TargetValue
  cells: Cell[]
  verdict: Verdict
  verdictLabel: string
}

const VERDICT_COLORS: Record<Verdict, 'success' | 'warning' | 'info' | 'neutral'> = {
  same: 'success',
  differ: 'warning',
  partial: 'info',
  none: 'neutral',
}

const label = (r: LlmCompareResult) => LLM_PROVIDER_LABELS[r.provider]

const rows = computed<Row[]>(() => {
  const d = data.value
  if (!d) return []
  return d.current.map(({ target, value: stored }) => {
    const cells = d.results.map((r): Cell => {
      const best = r.proposals.find((p) => p.target === target)?.candidates[0]
      return { best, matchesStored: !!best && sameTargetValue(target, best.value, stored) }
    })
    const found = cells.flatMap((c, i) => (c.best ? [{ value: c.best.value, result: d.results[i]! }] : []))
    let verdict: Verdict
    let verdictLabel: string
    if (!found.length) {
      verdict = 'none'
      verdictLabel = 'Neither'
    } else if (found.length < cells.length) {
      verdict = 'partial'
      verdictLabel = `Only ${found.map((f) => label(f.result)).join(', ')}`
    } else if (found.every((f) => sameTargetValue(target, f.value, found[0]!.value))) {
      verdict = 'same'
      verdictLabel = 'Same'
    } else {
      verdict = 'differ'
      verdictLabel = 'Differ'
    }
    return { target, stored, cells, verdict, verdictLabel }
  })
})

const onlyDifferences = ref(false)
const visibleRows = computed(() =>
  onlyDifferences.value ? rows.value.filter((r) => r.verdict === 'differ' || r.verdict === 'partial') : rows.value,
)
const agreeCount = computed(() => rows.value.filter((r) => r.verdict === 'same').length)

// Source text is opened per row, so both LLMs' regions line up.
const showAllSources = ref(false)
const openRows = ref(new Set<MappingTarget>())
const isOpen = (target: MappingTarget) => showAllSources.value || openRows.value.has(target)
const toggleRow = (target: MappingTarget) => {
  const next = new Set(openRows.value)
  if (!next.delete(target)) next.add(target)
  openRows.value = next
}

// ---- per-model summary ----

const foundCount = (r: LlmCompareResult) => r.proposals.length
const uncertainCount = (r: LlmCompareResult) => r.proposals.filter((p) => p.candidates[0]?.uncertain).length
const cost = (r: LlmCompareResult) => {
  const usd = estimateCost(r.model, r.inputTokens, r.outputTokens)
  return usd === null ? '—' : `$${usd.toFixed(4)}`
}

interface CheckView {
  key: string
  label: string
  check: SiteCheck
}

const checksOf = (r: LlmCompareResult): CheckView[] => [
  ...(r.addressCheck ? [{ key: 'address', label: ADDRESS_CHECK_LABELS[r.addressCheck.status], check: r.addressCheck }] : []),
  ...(r.phoneCheck ? [{ key: 'phone', label: PHONE_CHECK_LABELS[r.phoneCheck.status], check: r.phoneCheck }] : []),
]

// ---- run again ----

const rerunning = ref(false)
const rerun = async () => {
  if (!data.value) return
  rerunning.value = true
  try {
    const body: StartLlmCompareRequest = { pantryId: data.value.pantryId }
    const compare = await api<LlmCompareSummary>('/admin/llm-compares', { method: 'POST', body })
    await navigateTo(`/llm-evals/compare/${compare.id}`)
  } catch (err) {
    toast.add({ title: 'Could not start the comparison', description: apiErrorMessage(err), color: 'error' })
  } finally {
    rerunning.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <UButton to="/llm-evals" label="LLM eval" icon="i-lucide-arrow-left" color="neutral" variant="link" class="px-0" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <template v-if="data">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 class="text-xl font-semibold flex flex-wrap items-center gap-2">
            {{ data.pantryName }}
            <UBadge :label="data.status" :color="LLM_COMPARE_STATUS_COLORS[data.status]" variant="subtle" />
          </h1>
          <p class="text-sm text-(--ui-text-muted)">
            <span class="font-mono">{{ data.pantryId }}</span> · {{ formatDateTime(data.createdAt) }} · by {{ data.requestedBy }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <ExternalLinkButton :to="pantryUrl(data.pantryId)" label="Pantry page" />
          <ExternalLinkButton v-if="data.url" :to="data.url" label="Website" />
          <UButton
            label="Run again"
            icon="i-lucide-rotate-cw"
            size="xs"
            :loading="rerunning"
            :disabled="inProgress"
            @click="rerun"
          />
        </div>
      </div>

      <UAlert
        v-if="inProgress"
        color="info"
        variant="subtle"
        icon="i-lucide-loader"
        :title="data.status === 'queued' ? 'Waiting for the crawler worker…' : 'Fetching the site and asking both LLMs…'"
        :description="workerHint ? 'Still queued — is the crawler worker running? (npm run worker:<env> in tools/crawler)' : undefined"
      />
      <UAlert v-if="data.error" color="error" variant="subtle" title="The comparison failed" :description="data.error" />

      <template v-if="data.status === 'completed'">
        <div class="grid gap-4 md:grid-cols-2">
          <UCard v-for="r in data.results" :key="r.provider">
            <template #header>
              <div class="flex flex-wrap items-baseline gap-2">
                <span class="font-semibold">{{ label(r) }}</span>
                <span class="text-sm font-mono text-(--ui-text-muted)">{{ r.model }}</span>
              </div>
            </template>
            <UAlert v-if="r.error" color="error" variant="subtle" :title="r.error" />
            <div v-else class="flex flex-col gap-3">
              <dl class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                <div>
                  <dt class="text-xs text-(--ui-text-muted)">Fields found</dt>
                  <dd class="font-medium">{{ foundCount(r) }} / {{ data.current.length }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-(--ui-text-muted)">Unsure</dt>
                  <dd class="font-medium">{{ uncertainCount(r) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-(--ui-text-muted)">Tokens in / out</dt>
                  <dd class="font-medium">{{ r.inputTokens.toLocaleString() }} / {{ r.outputTokens.toLocaleString() }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-(--ui-text-muted)">Est. cost</dt>
                  <dd class="font-medium">{{ cost(r) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-(--ui-text-muted)">Time</dt>
                  <dd class="font-medium">{{ (r.durationMs / 1000).toFixed(1) }}s</dd>
                </div>
              </dl>
              <div v-for="c in checksOf(r)" :key="c.key" class="flex flex-wrap items-center gap-2 text-sm">
                <UBadge :label="c.label" :color="SITE_CHECK_COLORS[c.check.status]" variant="subtle" size="sm" />
                <span class="text-(--ui-text-muted)">{{ c.check.found.join(' · ') }}</span>
              </div>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="font-medium">
                Fields
                <span class="text-sm font-normal text-(--ui-text-muted)">
                  · the LLMs agree on {{ agreeCount }} of {{ rows.length }}
                </span>
              </h2>
              <div class="flex flex-wrap gap-4">
                <USwitch v-model="onlyDifferences" label="Only differences" />
                <USwitch v-model="showAllSources" label="Show source text" />
              </div>
            </div>
          </template>

          <div class="overflow-x-auto">
            <div class="min-w-3xl" :style="{ '--compare-cols': data.results.length + 1 }">
              <div class="compare-row compare-head">
                <div>Field</div>
                <div>Stored now</div>
                <div v-for="r in data.results" :key="r.provider">
                  {{ label(r) }}
                  <div class="font-normal font-mono normal-case text-(--ui-text-muted)">{{ r.model }}</div>
                </div>
              </div>

              <p v-if="!visibleRows.length" class="py-3 text-sm text-(--ui-text-muted)">
                {{ rows.length ? 'No differences: both LLMs returned the same values.' : 'No fields.' }}
              </p>

              <div v-for="row in visibleRows" :key="row.target" class="compare-row">
                <div class="flex flex-col items-start gap-1.5">
                  <span class="text-sm font-medium">{{ targetLabel(row.target, data.serviceNames) }}</span>
                  <UBadge :label="row.verdictLabel" :color="VERDICT_COLORS[row.verdict]" variant="subtle" size="sm" />
                  <UButton
                    v-if="row.verdict !== 'none' && !showAllSources"
                    :label="isOpen(row.target) ? 'Hide source' : 'Source'"
                    :icon="isOpen(row.target) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    color="neutral"
                    variant="link"
                    size="xs"
                    class="px-0"
                    @click="toggleRow(row.target)"
                  />
                </div>

                <div><TargetValueView :value="row.stored" /></div>

                <div v-for="(cell, i) in row.cells" :key="data.results[i]!.provider" class="flex flex-col gap-2 min-w-0">
                  <span v-if="!cell.best" class="text-sm text-(--ui-text-dimmed)">Not found</span>
                  <template v-else>
                    <TargetValueView :value="cell.best.value" />
                    <div class="flex flex-wrap gap-1">
                      <UBadge v-if="cell.best.uncertain" label="Unsure" color="warning" variant="subtle" size="sm" />
                      <UBadge v-if="cell.matchesStored" label="= stored" color="neutral" variant="outline" size="sm" />
                    </div>
                    <div v-if="isOpen(row.target)" class="flex flex-col gap-1">
                      <div class="text-xs text-(--ui-text-muted) flex flex-wrap gap-x-2">
                        <ULink :to="cell.best.url" target="_blank" class="truncate">{{ cell.best.url }}</ULink>
                        <span v-if="cell.best.textAnchor">under “{{ cell.best.textAnchor }}”</span>
                      </div>
                      <pre class="raw-text">{{ cell.best.rawText }}</pre>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <p v-if="data.pages.length" class="text-xs text-(--ui-text-muted)">
          Pages shown to both LLMs:
          <template v-for="(page, i) in data.pages" :key="page">
            <span v-if="i"> · </span><ULink :to="page" target="_blank">{{ page }}</ULink>
          </template>
        </p>
      </template>
    </template>
  </div>
</template>
