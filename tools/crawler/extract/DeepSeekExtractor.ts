/**
 * DeepSeek via its OpenAI-compatible chat API, in JSON mode.
 * Models (api-docs.deepseek.com, 2026-09): `deepseek-flash` = V4.1 Flash,
 * `deepseek-v4-pro` = V4 Pro.
 */
import type { DeepSeekReasoningEffort, LlmSettings } from '@pantry-finder/shared';
import { OpenAiChatExtractor } from './OpenAiChatExtractor.js';

export class DeepSeekExtractor extends OpenAiChatExtractor {
  readonly provider = 'deepseek';
  protected readonly label = 'DeepSeek';
  protected readonly apiUrl = 'https://api.deepseek.com/chat/completions';

  /**
   * Thinking is on by default (effort high) and billed as output, so it is
   * off unless an effort is given. Thinking ignores `temperature` (no error).
   */
  constructor(
    apiKey: string,
    model: string,
    private readonly thinking?: DeepSeekReasoningEffort,
  ) {
    super(apiKey, model);
  }

  get settings(): LlmSettings {
    return this.thinking ? { model: this.model, thinking: this.thinking } : { model: this.model };
  }

  protected extraBody(): Record<string, unknown> {
    return this.thinking
      ? { thinking: { type: 'enabled' }, reasoning_effort: this.thinking }
      : { thinking: { type: 'disabled' } };
  }
}
