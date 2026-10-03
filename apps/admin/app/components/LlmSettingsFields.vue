<script setup lang="ts">
import { DEEPSEEK_REASONING_EFFORTS, GEMINI_REASONING_EFFORTS, LLM_MODELS } from '@pantry-finder/shared'
import type { DeepSeekReasoningEffort, GeminiReasoningEffort, LlmProvider, LlmSettings } from '@pantry-finder/shared'

// One LLM's model and thinking settings for a crawl run or comparison. A field
// left on "Default (env)" is omitted, so the crawler's env setting applies.
const props = defineProps<{ provider: LlmProvider }>()
const settings = defineModel<LlmSettings>({ required: true })

// Select items can't have an empty value.
const ENV = '__env__'
const envItem = { label: 'Default (env)', value: ENV }

const modelItems = computed(() => [envItem, ...LLM_MODELS[props.provider].map((m) => ({ label: m, value: m }))])
const model = computed({
  get: () => settings.value.model ?? ENV,
  set: (v: string) => (settings.value = { ...settings.value, model: v === ENV ? undefined : v }),
})

// DeepSeek: the effort is kept while thinking is switched off.
const thinkingEffort = ref<DeepSeekReasoningEffort>(settings.value.thinking ?? 'high')
const thinkingItems = DEEPSEEK_REASONING_EFFORTS.map((value) => ({ label: value, value }))
const thinkingOn = computed({
  get: () => !!settings.value.thinking,
  set: (on: boolean) => (settings.value = { ...settings.value, thinking: on ? thinkingEffort.value : undefined }),
})
const thinking = computed({
  get: () => settings.value.thinking ?? thinkingEffort.value,
  set: (v: DeepSeekReasoningEffort) => {
    thinkingEffort.value = v
    settings.value = { ...settings.value, thinking: v }
  },
})

// Gemini
const effortItems = [envItem, ...GEMINI_REASONING_EFFORTS.map((value) => ({ label: value, value }))]
const effort = computed({
  get: () => settings.value.reasoningEffort ?? ENV,
  set: (v: string) =>
    (settings.value = { ...settings.value, reasoningEffort: v === ENV ? undefined : (v as GeminiReasoningEffort) }),
})
</script>

<template>
  <div class="flex flex-wrap items-start gap-4">
    <UFormField label="Model">
      <USelect v-model="model" :items="modelItems" class="w-56" />
    </UFormField>
    <template v-if="provider === 'deepseek'">
      <UFormField label="Thinking" hint="billed as output">
        <div class="flex items-center gap-4 h-8">
          <USwitch v-model="thinkingOn" />
          <URadioGroup
            v-if="thinkingOn"
            v-model="thinking"
            :items="thinkingItems"
            legend="Reasoning effort"
            orientation="horizontal"
            :ui="{ legend: 'sr-only' }"
          />
        </div>
      </UFormField>
    </template>
    <UFormField v-else label="Reasoning effort" hint="lowest allowed depends on the model">
      <USelect v-model="effort" :items="effortItems" class="w-40" />
    </UFormField>
  </div>
</template>
