<script setup lang="ts">
import type {
  EvalGrade,
  EvalVariantKey,
  LlmEvalDetail,
  LlmEvalItem,
  MappingCandidate,
  MappingTarget,
} from '@pantry-finder/shared'

// Blind grading of one tier comparison: each site shows two models' proposals
// as A / B (shuffled per site). Grade each target per side; a target a side
// didn't propose can still be graded (correctly omitted, or missed).
const route = useRoute()
const api = useApi()
const toast = useToast()
const id = route.params.id as string

const { data, error } = await useAsyncData(`llm-eval-${id}`, () => api<LlmEvalDetail>(`/admin/llm-evals/${id}`))

const reveal = ref(false)
const VARIANTS: EvalVariantKey[] = ['A', 'B']
const GRADES: { value: EvalGrade; label: string; color: 'success' | 'warning' | 'error' }[] = [
  { value: 'correct', label: 'Correct', color: 'success' },
  { value: 'partial', label: 'Partial', color: 'warning' },
  { value: 'wrong', label: 'Wrong', color: 'error' },
]

const targetsOf = (item: LlmEvalItem): MappingTarget[] => {
  const set = new Set<MappingTarget>()
  for (const v of VARIANTS) for (const p of item.variants[v].proposals) set.add(p.target)
  return [...set]
}

const topCandidate = (item: LlmEvalItem, v: EvalVariantKey, target: MappingTarget): MappingCandidate | undefined =>
  item.variants[v].proposals.find((p) => p.target === target)?.candidates[0]

const isGraded = (item: LlmEvalItem) =>
  targetsOf(item).every((t) => VARIANTS.every((v) => item.grades[v][t]))

const gradedCount = computed(() => (data.value?.items ?? []).filter(isGraded).length)

const grade = async (item: LlmEvalItem, variant: EvalVariantKey, target: MappingTarget, g: EvalGrade) => {
  const previous = item.grades[variant][target]
  item.grades[variant][target] = g
  try {
    await api(`/admin/llm-evals/${id}/items/${item.id}/grade`, { method: 'POST', body: { variant, target, grade: g } })
  } catch (err) {
    item.grades[variant][target] = previous
    toast.add({ title: 'Grade not saved', description: apiErrorMessage(err), color: 'error' })
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
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-xl font-semibold">
          Grading · {{ gradedCount }} / {{ data.items.length }} sites done
        </h1>
        <USwitch v-model="reveal" label="Reveal models" />
      </div>

      <UCard v-for="item in data.items" :key="item.id">
        <template #header>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span class="font-semibold">{{ item.pantryName }}</span>
              <UBadge v-if="isGraded(item)" label="Graded" color="success" variant="subtle" size="sm" class="ml-2" />
            </div>
            <ULink :to="item.url" target="_blank" class="text-sm truncate">{{ item.url }}</ULink>
          </div>
        </template>

        <div class="grid md:grid-cols-2 gap-4 mb-2 text-sm font-semibold">
          <div v-for="v in VARIANTS" :key="v">
            {{ v }}<span v-if="reveal" class="font-mono font-normal text-(--ui-text-muted)"> · {{ item.variants[v].model }}</span>
            <span v-if="item.variants[v].error" class="text-(--ui-error) font-normal"> · {{ item.variants[v].error }}</span>
          </div>
        </div>

        <p v-if="!targetsOf(item).length" class="text-sm text-(--ui-text-muted)">Neither model proposed anything.</p>

        <div v-for="target in targetsOf(item)" :key="target" class="border-t border-(--ui-border) py-3">
          <div class="text-xs uppercase text-(--ui-text-muted) mb-2">{{ targetLabel(target) }}</div>
          <div class="grid md:grid-cols-2 gap-4">
            <div v-for="v in VARIANTS" :key="v" class="flex flex-col gap-2">
              <template v-if="topCandidate(item, v, target)">
                <pre class="raw-text">{{ topCandidate(item, v, target)!.rawText }}</pre>
                <TargetValueView :value="topCandidate(item, v, target)!.value" />
              </template>
              <span v-else class="text-sm text-(--ui-text-dimmed)">Not proposed</span>
              <div class="flex gap-1">
                <UButton
                  v-for="g in GRADES"
                  :key="g.value"
                  :label="g.label"
                  size="xs"
                  :color="g.color"
                  :variant="item.grades[v][target] === g.value ? 'solid' : 'outline'"
                  @click="grade(item, v, target, g.value)"
                />
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
