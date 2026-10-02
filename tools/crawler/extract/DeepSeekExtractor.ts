/**
 * DeepSeek via its OpenAI-compatible chat API, in JSON mode.
 * Models (api-docs.deepseek.com, 2026-09): `deepseek-flash` = V4.1 Flash,
 * `deepseek-v4-pro` = V4 Pro.
 */
import { OpenAiChatExtractor } from './OpenAiChatExtractor.js';

export class DeepSeekExtractor extends OpenAiChatExtractor {
  readonly provider = 'deepseek';
  protected readonly label = 'DeepSeek';
  protected readonly apiUrl = 'https://api.deepseek.com/chat/completions';

  protected extraBody(): Record<string, unknown> {
    // Thinking is on by default (effort high) and billed as output; extraction doesn't need it.
    return { thinking: { type: 'disabled' } };
  }
}
