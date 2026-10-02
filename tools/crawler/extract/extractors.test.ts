import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekExtractor } from './DeepSeekExtractor.js';
import type { PantryContext } from './Extractor.js';
import { GeminiExtractor } from './GeminiExtractor.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch with one canned chat completion; returns the requests made. */
function mockFetch(content: unknown): { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] {
  const calls: ReturnType<typeof mockFetch> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string),
    });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 120, completion_tokens: 30 },
      }),
    );
  }) as typeof fetch;
  return calls;
}

const ctx: PantryContext = { name: 'Test Pantry', city: 'Springfield', state: 'IL', services: [], targets: ['phone'] };
const pages = [{ url: 'https://example.org/', blocks: [{ id: 'p0b1', text: 'Call 555-123-4567' }] }];
const answer = {
  fields: [{ target: 'phone', candidates: [{ blocks: ['p0b1'], value: '555-123-4567', uncertain: false }] }],
  addresses: [],
  phones: ['555-123-4567'],
};

test('DeepSeek: endpoint, key and thinking switched off', async () => {
  const calls = mockFetch(answer);
  const extractor = new DeepSeekExtractor('ds-key', 'deepseek-flash');
  const result = await extractor.proposeMappings(pages, ctx);

  assert.equal(extractor.provider, 'deepseek');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer ds-key');
  assert.equal(calls[0].body.model, 'deepseek-flash');
  assert.deepEqual(calls[0].body.thinking, { type: 'disabled' });
  assert.equal('reasoning_effort' in calls[0].body, false);
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 30 });
  assert.deepEqual(result.proposals, [
    { target: 'phone', candidates: [{ blockIds: ['p0b1'], value: '555-123-4567', uncertain: false }] },
  ]);
});

test('Gemini: OpenAI-compatible endpoint, key and reasoning effort', async () => {
  const calls = mockFetch(answer);
  const extractor = new GeminiExtractor('g-key', 'gemini-3.5-flash-lite', 'minimal');
  const result = await extractor.proposeMappings(pages, ctx);

  assert.equal(extractor.provider, 'gemini');
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer g-key');
  assert.equal(calls[0].body.model, 'gemini-3.5-flash-lite');
  assert.equal(calls[0].body.reasoning_effort, 'minimal');
  assert.equal('thinking' in calls[0].body, false);
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.deepEqual(result.phones, ['555-123-4567']);
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 30 });
});

test('a region with no value parses to an empty, uncertain one', async () => {
  mockFetch({ value: null, uncertain: true });
  const extractor = new GeminiExtractor('g-key', 'gemini-3.5-flash-lite', 'minimal');
  const parsed = await extractor.parseRegion('schedules', 'Office hours Mon–Fri', { ...ctx, targets: ['schedules'] });

  assert.deepEqual(parsed.value, []);
  assert.equal(parsed.uncertain, true);
});
