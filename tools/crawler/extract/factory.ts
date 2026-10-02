/**
 * Builds the extractor for an LLM provider from the environment
 * (tools/crawler/.env.<env>). To add a provider: implement `Extractor`, add it
 * to `LlmProvider` in @pantry-finder/shared, and create it here.
 */
import { LLM_PROVIDERS, type LlmProvider } from '@pantry-finder/shared';
import { requireEnvVar } from '../lib.js';
import { DeepSeekExtractor } from './DeepSeekExtractor.js';
import type { Extractor } from './Extractor.js';
import { GeminiExtractor } from './GeminiExtractor.js';

const DEFAULT_GEMINI_REASONING_EFFORT = 'low';

/** Throws when the provider's API key or model isn't configured. */
export function createExtractor(provider: LlmProvider): Extractor {
  switch (provider) {
    case 'deepseek':
      return new DeepSeekExtractor(requireEnvVar('DEEPSEEK_API_KEY'), requireEnvVar('DEEPSEEK_MODEL'));
    case 'gemini':
      return new GeminiExtractor(
        requireEnvVar('GEMINI_API_KEY'),
        requireEnvVar('GEMINI_MODEL'),
        process.env.GEMINI_REASONING_EFFORT || DEFAULT_GEMINI_REASONING_EFFORT,
      );
  }
}

/** The providers with an API key and model in the environment. */
export function configuredProviders(): LlmProvider[] {
  const vars: Record<LlmProvider, string[]> = {
    deepseek: ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'],
    gemini: ['GEMINI_API_KEY', 'GEMINI_MODEL'],
  };
  return LLM_PROVIDERS.filter((p) => vars[p].every((name) => process.env[name]));
}
