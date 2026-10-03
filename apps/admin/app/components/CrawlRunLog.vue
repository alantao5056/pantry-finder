<script setup lang="ts">
import type { CrawlRunLogResponse } from '@pantry-finder/shared'

// A crawl run's log: loaded in full once, then only new chunks (`afterSeq`)
// every few seconds while the run is active.
const props = defineProps<{ runId: string; active: boolean }>()

const api = useApi()
const toast = useToast()

const lines = ref<string[]>([])
const lastSeq = ref(0)
const loading = ref(false)

const fetchLog = async () => {
  const runId = props.runId
  const res = await api<CrawlRunLogResponse>(`/admin/crawl-runs/${runId}/log`, { query: { afterSeq: lastSeq.value } })
  if (props.runId !== runId) return
  lines.value.push(...res.lines)
  lastSeq.value = res.lastSeq
}

const load = () => {
  lines.value = []
  lastSeq.value = 0
  loading.value = true
  fetchLog()
    .catch((err) => toast.add({ title: 'Could not load the log', description: apiErrorMessage(err), color: 'error' }))
    .finally(() => (loading.value = false))
}

watch(() => props.runId, load)

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  load()
  timer = setInterval(async () => {
    if (!props.active || loading.value) return
    try {
      await fetchLog()
    } catch {
      // Transient; the next tick tries again.
    }
  }, CRAWL_RUN_POLL_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <p v-if="loading" class="text-sm text-(--ui-text-muted)">Loading…</p>
  <p v-else-if="lines.length === 0" class="text-sm text-(--ui-text-muted)">
    {{ active ? 'Waiting for the crawler…' : 'No log for this run.' }}
  </p>
  <pre v-else class="text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto">{{ lines.join('\n') }}</pre>
</template>
