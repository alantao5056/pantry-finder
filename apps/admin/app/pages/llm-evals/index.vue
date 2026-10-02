<script setup lang="ts">
import type {
  ListLlmComparesResponse,
  ListLlmEvalsResponse,
  LlmCompareSummary,
  LlmEvalModelStats,
  LlmEvalSummary,
  StartLlmCompareRequest,
} from '@pantry-finder/shared'

// Two ways to judge the crawler's LLMs: a side-by-side run of both providers on
// one pantry (executed by the crawler worker), and the blind-graded tier
// comparisons (tools/crawler `compare-tiers`).
const api = useApi()
const toast = useToast()

const { data, pending, error, refresh } = await useAsyncData(
  'llm-evals',
  () => api<ListLlmEvalsResponse>('/admin/llm-evals'),
)
const {
  data: compares,
  pending: comparesPending,
  error: comparesError,
  refresh: refreshCompares,
} = await useAsyncData('llm-compares', () => api<ListLlmComparesResponse>('/admin/llm-compares'))

const refreshAll = async () => {
  await Promise.all([refresh(), refreshCompares()])
}

// ---- compare on one pantry ----

const pantryId = ref('')
const starting = ref(false)

const startCompare = async () => {
  const id = pantryId.value.trim()
  if (!id) return
  starting.value = true
  try {
    const body: StartLlmCompareRequest = { pantryId: id }
    const compare = await api<LlmCompareSummary>('/admin/llm-compares', { method: 'POST', body })
    await navigateTo(`/llm-evals/compare/${compare.id}`)
  } catch (err) {
    toast.add({ title: 'Could not start the comparison', description: apiErrorMessage(err), color: 'error' })
  } finally {
    starting.value = false
  }
}

// ---- tier comparisons ----

const graded = (m: LlmEvalModelStats) => m.grades.correct + m.grades.partial + m.grades.wrong
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—')
const costPerThousandSites = (e: LlmEvalSummary, m: LlmEvalModelStats) => {
  const cost = estimateCost(m.model, m.inputTokens, m.outputTokens)
  return cost === null || !e.itemCount ? '—' : `$${((cost / e.itemCount) * 1000).toFixed(2)}`
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">LLM eval</h1>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="pending || comparesPending"
        @click="refreshAll()"
      />
    </div>

    <UCard>
      <template #header>
        <h2 class="font-medium">Compare DeepSeek and Gemini on one pantry</h2>
      </template>
      <div class="flex flex-col gap-4">
        <form class="flex flex-wrap items-end gap-4" @submit.prevent="startCompare">
          <UFormField label="Pantry ID">
            <UInput v-model="pantryId" placeholder="Pantry ID" class="w-64" />
          </UFormField>
          <UButton
            type="submit"
            label="Run comparison"
            icon="i-lucide-columns-2"
            :loading="starting"
            :disabled="!pantryId.trim()"
          />
        </form>
        <p class="text-xs text-(--ui-text-muted)">
          A dry run: the crawler worker fetches the pantry's site once and asks both LLMs for every field, as on a
          first visit. Nothing is written to the pantry or the review queue; the two LLM calls are real.
        </p>

        <UAlert v-if="comparesError" color="error" variant="subtle" :title="apiErrorMessage(comparesError)" />
        <table v-if="compares?.compares.length" class="w-full text-sm">
          <thead class="text-left text-(--ui-text-muted)">
            <tr>
              <th class="font-normal">Pantry</th>
              <th class="font-normal">Run</th>
              <th class="font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in compares.compares" :key="c.id" class="border-t border-(--ui-border)">
              <td class="py-1.5">
                <ULink :to="`/llm-evals/compare/${c.id}`" class="font-medium">{{ c.pantryName }}</ULink>
                <span class="text-xs text-(--ui-text-muted) font-mono"> {{ c.pantryId }}</span>
              </td>
              <td>{{ formatDateTime(c.createdAt) }}</td>
              <td><UBadge :label="c.status" :color="LLM_COMPARE_STATUS_COLORS[c.status]" variant="subtle" size="sm" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <h2 class="text-lg font-semibold mt-2">Tier comparisons</h2>
    <p class="text-sm text-(--ui-text-muted)">
      Created by <code>npm run compare-tiers:&lt;env&gt; -- --apply</code> in tools/crawler. Grade each site's
      proposals blind, then pick the model for <code>DEEPSEEK_MODEL</code>.
    </p>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />
    <p v-if="data && !data.evals.length" class="text-sm text-(--ui-text-muted)">No comparisons yet.</p>

    <UCard v-for="e in data?.evals ?? []" :key="e.id">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="font-semibold">{{ formatDateTime(e.createdAt) }}</span>
            <span class="text-sm text-(--ui-text-muted)"> · {{ e.env }} · {{ e.itemCount }} sites</span>
          </div>
          <UButton :to="`/llm-evals/${e.id}`" label="Grade" icon="i-lucide-scale" size="sm" />
        </div>
      </template>
      <table class="w-full text-sm">
        <thead class="text-left text-(--ui-text-muted)">
          <tr>
            <th class="font-normal">Model</th>
            <th class="font-normal">Graded</th>
            <th class="font-normal">Correct</th>
            <th class="font-normal">Partial</th>
            <th class="font-normal">Wrong</th>
            <th class="font-normal">Tokens in / out</th>
            <th class="font-normal">Est. cost / 1000 sites</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in e.models" :key="m.model">
            <td class="font-mono">{{ m.model }}</td>
            <td>{{ graded(m) }}</td>
            <td>{{ pct(m.grades.correct, graded(m)) }}</td>
            <td>{{ pct(m.grades.partial, graded(m)) }}</td>
            <td>{{ pct(m.grades.wrong, graded(m)) }}</td>
            <td>{{ m.inputTokens.toLocaleString() }} / {{ m.outputTokens.toLocaleString() }}</td>
            <td>{{ costPerThousandSites(e, m) }}</td>
          </tr>
        </tbody>
      </table>
    </UCard>
  </div>
</template>
