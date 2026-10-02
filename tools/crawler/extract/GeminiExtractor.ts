/**
 * Gemini via its OpenAI-compatible chat API, in JSON mode.
 * Models (ai.google.dev/gemini-api/docs/models, 2026-10): `gemini-3.5-flash-lite`
 * (cheapest), `gemini-3.8-flash`, `gemini-3.1-pro-preview`.
 */
import { OpenAiChatExtractor } from './OpenAiChatExtractor.js';

export class GeminiExtractor extends OpenAiChatExtractor {
  readonly provider = 'gemini';
  protected readonly label = 'Gemini';
  protected readonly apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  /**
   * Gemini 3 models can't switch thinking off (it is billed as output), only
   * turn it down, and the lowest level depends on the model: `minimal` on the
   * Flash-Lite models, `low` on 3.7 / 3.8 Flash and Pro.
   */
  constructor(
    apiKey: string,
    model: string,
    private readonly reasoningEffort: string,
  ) {
    super(apiKey, model);
  }

  protected extraBody(): Record<string, unknown> {
    return { reasoning_effort: this.reasoningEffort };
  }
}
