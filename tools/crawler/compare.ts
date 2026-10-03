/**
 * LLM comparison on one pantry, queued from the admin (LLM eval page): fetches
 * the pantry's site once and runs the first-visit extraction for every target
 * through each provider, storing the results side by side in `llm_compares`.
 * Unlike a crawl it ignores existing mappings and writes no pantry data,
 * `crawl_sources` or review items. Executed by worker.ts.
 */
import { Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import {
  LLM_PROVIDERS,
  parseTarget,
  pruneUndefined,
  type LlmCompareResult,
  type LlmCompareStatus,
  type LlmProvider,
  type LlmSettings,
} from '@pantry-finder/shared';
import { COLLECTIONS, getTargetValue, type LlmCompareDocument } from '@pantry-finder/shared/firestore';
import { checkAddress } from './address.js';
import type { Extractor } from './extract/Extractor.js';
import { errorMessage, type Fetcher } from './fetch/fetcher.js';
import { checkPhone } from './phone.js';
import { pantryContext, targetsFor, type StoredPantry } from './pipeline.js';
import { loadPage, loadSite, normalizeWebsite, pagesForExtraction, toCandidates } from './site.js';

export interface CompareConfig {
  db: Firestore;
  fetcher: Fetcher;
  env: string;
  /** Throws when the provider isn't configured. */
  extractorFor: (provider: LlmProvider, settings?: LlmSettings) => Extractor;
}

/** Moves a queued comparison to `running`; null if it was taken meanwhile. */
async function claim(db: Firestore, ref: DocumentReference, env: string): Promise<LlmCompareDocument | null> {
  return db.runTransaction(async (tx) => {
    const doc = (await tx.get(ref)).data() as LlmCompareDocument | undefined;
    if (!doc || doc.status !== 'queued') return null;
    const update: Partial<LlmCompareDocument> = { status: 'running', env };
    tx.update(ref, update);
    return { ...doc, ...update };
  });
}

/** Runs one queued comparison to `completed` or `failed`. */
export async function runCompare(config: CompareConfig, ref: DocumentReference): Promise<void> {
  const { db, env } = config;
  const doc = await claim(db, ref, env);
  if (!doc) return;
  const settings = LLM_PROVIDERS.map((p) => `${p} ${JSON.stringify(doc.settings?.[p] ?? {})}`).join(', ');
  console.log(`Compare ${ref.id} by ${doc.requestedBy}: pantry ${doc.pantryId} (${settings})`);
  let update: Partial<LlmCompareDocument>;
  try {
    update = { ...(await compare(config, doc)), status: 'completed' };
  } catch (err) {
    console.warn(`Compare ${ref.id} failed: ${errorMessage(err)}`);
    update = { status: 'failed' satisfies LlmCompareStatus, error: errorMessage(err) };
  }
  await ref.update(pruneUndefined({ ...update, finishedAt: Timestamp.now() }));
}

async function compare(config: CompareConfig, doc: LlmCompareDocument): Promise<Partial<LlmCompareDocument>> {
  const { db, fetcher, extractorFor } = config;
  const { pantryId } = doc;
  const snap = await db.collection(COLLECTIONS.pantries).doc(pantryId).get();
  const pantry = snap.data() as StoredPantry | undefined;
  if (!pantry) throw new Error('Pantry not found.');
  const website = normalizeWebsite(pantry.website ?? '');
  if (!website) throw new Error(`Unusable website ${JSON.stringify(pantry.website)}.`);

  const home = await loadPage(fetcher, website);
  if (!home.page) throw new Error(`${website}: ${home.fetch.error ?? 'no content'}`);
  if (home.page.looksJsRendered) throw new Error(`${website} looks JS-rendered; the crawler skips such sites.`);
  const site = await loadSite(fetcher, home);
  const forLlm = pagesForExtraction(site);
  const targets = targetsFor(pantry);
  const ctx = pantryContext(pantry, targets);

  const results = await Promise.all(
    LLM_PROVIDERS.map(async (provider): Promise<LlmCompareResult> => {
      const startedAt = Date.now();
      let model = '';
      let settings: LlmSettings | undefined;
      try {
        const extractor = extractorFor(provider, doc.settings?.[provider]);
        model = extractor.model;
        settings = extractor.settings;
        const { proposals, addresses, phones, usage } = await extractor.proposeMappings(forLlm, ctx);
        return {
          provider,
          model,
          settings,
          proposals: toCandidates(site, proposals),
          addressCheck: checkAddress(pantry, addresses),
          phoneCheck: checkPhone(pantry, phones),
          phones,
          ...usage,
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          provider,
          model,
          settings,
          proposals: [],
          phones: [],
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - startedAt,
          error: errorMessage(err),
        };
      }
    }),
  );

  return {
    url: home.fetch.finalUrl,
    pages: forLlm.map((p) => p.url),
    serviceNames: (pantry.services ?? []).map((s) => s.name),
    current: targets.map((target) => ({
      target,
      value: getTargetValue(pantry, target) ?? (parseTarget(target)?.kind === 'schedules' ? [] : ''),
    })),
    results,
  };
}
