<script setup lang="ts">
import type { ListLlmEvalsResponse, LlmEvalModelStats, LlmEvalSummary } from '@pantry-finder/shared'

// LLM tier comparisons (tools/crawler `compare-tiers`): results per model once graded.
const api = useApi()

const { data, pending, error, refresh } = await useAsyncData(
  'llm-evals',
  () => api<ListLlmEvalsResponse>('/admin/llm-evals'),
)

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
      <h1 class="text-xl font-semibold">LLM tier comparison</h1>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
    </div>
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
