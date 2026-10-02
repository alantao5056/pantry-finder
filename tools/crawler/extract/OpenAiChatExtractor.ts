/**
 * Extraction through an OpenAI-compatible chat completions API in JSON mode,
 * via Node's built-in fetch. The providers (DeepSeekExtractor, GeminiExtractor)
 * differ only in endpoint and in how they turn thinking down.
 */
import { parseTarget, type LlmProvider, type MappingTarget, type TargetValue } from '@pantry-finder/shared';
import type { Extractor, PageForExtraction, PantryContext, RawProposal, Usage } from './Extractor.js';
import {
  parseParseResponse,
  parseProposeResponse,
  parseSystemPrompt,
  parseUserPrompt,
  proposeSystemPrompt,
  proposeUserPrompt,
} from './prompts.js';

const TIMEOUT_MS = 120_000;
// Waits of 2 s, 4 s and 8 s between attempts.
const MAX_ATTEMPTS = 4;

export abstract class OpenAiChatExtractor implements Extractor {
  abstract readonly provider: LlmProvider;
  /** Provider name for error messages. */
  protected abstract readonly label: string;
  protected abstract readonly apiUrl: string;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  /** Provider-specific request fields, on top of model / messages / JSON mode. */
  protected abstract extraBody(): Record<string, unknown>;

  async proposeMappings(
    pages: PageForExtraction[],
    ctx: PantryContext,
  ): Promise<{ proposals: RawProposal[]; addresses: string[]; phones: string[]; usage: Usage }> {
    const blockIds = new Set(pages.flatMap((p) => p.blocks.map((b) => b.id)));
    const { json, usage } = await this.complete(proposeSystemPrompt(), proposeUserPrompt(pages, ctx));
    return { ...parseProposeResponse(json, ctx, blockIds), usage };
  }

  async parseRegion(
    target: MappingTarget,
    rawText: string,
    ctx: PantryContext,
  ): Promise<{ value: TargetValue; uncertain: boolean; usage: Usage }> {
    const { json, usage } = await this.complete(parseSystemPrompt(), parseUserPrompt(target, rawText, ctx));
    const { value, uncertain } = parseParseResponse(json, target);
    if (value === null) {
      // Nothing parseable: report an empty value and let the guardrails decide.
      return { value: parseTarget(target)?.kind === 'schedules' ? [] : '', uncertain: true, usage };
    }
    return { value, uncertain, usage };
  }

  private async complete(system: string, user: string): Promise<{ json: unknown; usage: Usage }> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
            temperature: 0,
            ...this.extraBody(),
          }),
        });
        if (!res.ok) {
          const message = `${this.label} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
          // Rate limits and overloaded / failing servers pass; anything else won't.
          throw res.status === 429 || res.status >= 500 ? new RetryableError(message) : new Error(message);
        }
        const body = (await res.json()) as {
          choices: { message: { content: string | null } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = body.choices[0]?.message.content ?? '';
        const usage = {
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
        };
        // JSON mode can occasionally return empty content; worth a retry.
        if (!content.trim()) throw new RetryableError(`${this.label} returned empty content`);
        return { json: JSON.parse(content), usage };
      } catch (err) {
        lastError = err;
        const retryable = err instanceof RetryableError || (err as Error).name === 'TimeoutError';
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        await new Promise((r) => setTimeout(r, 2_000 * 2 ** (attempt - 1)));
      }
    }
    throw lastError;
  }
}

class RetryableError extends Error {}
