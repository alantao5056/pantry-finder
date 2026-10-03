/**
 * Builds the extractor for an LLM provider from the environment
 * (tools/crawler/.env.<env>). To add a provider: implement `Extractor`, add it
 * to `LlmProvider` in @pantry-finder/shared, and create it here.
 */
import {
  GEMINI_REASONING_EFFORTS,
  LLM_PROVIDERS,
  type GeminiReasoningEffort,
  type LlmProvider,
  type LlmSettings,
} from '@pantry-finder/shared';
import { requireEnvVar } from '../lib.js';
import { DeepSeekExtractor } from './DeepSeekExtractor.js';
import type { Extractor } from './Extractor.js';
import { GeminiExtractor } from './GeminiExtractor.js';

const DEFAULT_GEMINI_REASONING_EFFORT: GeminiReasoningEffort = 'low';

/**
 * `settings` override the env model / effort (validate them with
 * `llmSettingsError` first). Throws when the provider's API key or model
 * isn't configured.
 */
export function createExtractor(provider: LlmProvider, settings: LlmSettings = {}): Extractor {
  switch (provider) {
    case 'deepseek':
      return new DeepSeekExtractor(
        requireEnvVar('DEEPSEEK_API_KEY'),
        settings.model ?? requireEnvVar('DEEPSEEK_MODEL'),
        settings.thinking,
      );
    case 'gemini':
      return new GeminiExtractor(
        requireEnvVar('GEMINI_API_KEY'),
        settings.model ?? requireEnvVar('GEMINI_MODEL'),
        settings.reasoningEffort ?? envGeminiReasoningEffort(),
      );
  }
}

function envGeminiReasoningEffort(): GeminiReasoningEffort {
  const raw = process.env.GEMINI_REASONING_EFFORT || DEFAULT_GEMINI_REASONING_EFFORT;
  if (!(GEMINI_REASONING_EFFORTS as readonly string[]).includes(raw)) {
    throw new Error(`GEMINI_REASONING_EFFORT must be one of ${GEMINI_REASONING_EFFORTS.join(', ')} (got ${raw}).`);
  }
  return raw as GeminiReasoningEffort;
}

/** The providers with an API key and model in the environment. */
export function configuredProviders(): LlmProvider[] {
  const vars: Record<LlmProvider, string[]> = {
    deepseek: ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'],
    gemini: ['GEMINI_API_KEY', 'GEMINI_MODEL'],
  };
  return LLM_PROVIDERS.filter((p) => vars[p].every((name) => process.env[name]));
}
