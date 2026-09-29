/**
 * DeepSeek via its OpenAI-compatible chat API, in JSON mode.
 * Models (api-docs.deepseek.com, 2026-09): `deepseek-flash` = V4.1 Flash,
 * `deepseek-v4-pro` = V4 Pro.
 */
import { parseTarget, type MappingTarget, type TargetValue } from '@pantry-finder/shared';
import type { Extractor, PageForExtraction, PantryContext, RawProposal, Usage } from './Extractor.js';
import {
  parseParseResponse,
  parseProposeResponse,
  parseSystemPrompt,
  parseUserPrompt,
  proposeSystemPrompt,
  proposeUserPrompt,
} from './prompts.js';

const API_URL = 'https://api.deepseek.com/chat/completions';
const TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

export class DeepSeekExtractor implements Extractor {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async proposeMappings(
    pages: PageForExtraction[],
    ctx: PantryContext,
  ): Promise<{ proposals: RawProposal[]; addresses: string[]; usage: Usage }> {
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
        const res = await fetch(API_URL, {
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
            // Thinking is on by default (effort high) and billed as output; extraction doesn't need it.
            thinking: { type: 'disabled' },
            temperature: 0,
          }),
        });
        if (res.status === 429 || res.status >= 500) throw new RetryableError(`DeepSeek HTTP ${res.status}`);
        if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const body = (await res.json()) as {
          choices: { message: { content: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = body.choices[0]?.message.content ?? '';
        const usage = {
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
        };
        // JSON mode can occasionally return empty content; worth a retry.
        if (!content.trim()) throw new RetryableError('DeepSeek returned empty content');
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
