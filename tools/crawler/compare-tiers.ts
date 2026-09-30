/**
 * LLM tier comparison (docs/crawler-design.md): runs first-visit mapping
 * proposals for a random sample of sites through two models and stores both
 * results in `llm_evals` for blind grading in the admin (LLM eval page).
 * Touches no pantry data. Dry run by default (prints a summary, writes nothing).
 *
 *   npm run compare-tiers:dev01 -- [--sample 50] [--apply]
 */
import PQueue from 'p-queue';
import { randomInt } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { pruneUndefined, type EvalVariantKey, type TargetProposal } from '@pantry-finder/shared';
import { COLLECTIONS, type LlmEvalDocument, type LlmEvalItemDocument } from '@pantry-finder/shared/firestore';
import { DeepSeekExtractor } from './extract/DeepSeekExtractor.js';
import { Fetcher, errorMessage } from './fetch/fetcher.js';
import { applyCommand, hasFlag, initFirestore, intFlag, peakHourWarning, requireEnvArg, requireEnvVar } from './lib.js';
import { pantryContext, targetsFor } from './pipeline.js';
import { allCrawlTargets } from './select.js';
import { loadPage, loadSite, pagesForExtraction, toCandidates } from './site.js';

const env = requireEnvArg();
const apply = hasFlag('apply');
const sampleSize = intFlag('sample') ?? 50;
const { db, projectId } = initFirestore();

const apiKey = requireEnvVar('DEEPSEEK_API_KEY');
const extractors = [
  new DeepSeekExtractor(apiKey, requireEnvVar('DEEPSEEK_MODEL_FLASH')),
  new DeepSeekExtractor(apiKey, requireEnvVar('DEEPSEEK_MODEL_PRO')),
];
const fetcher = new Fetcher(requireEnvVar('CRAWLER_CONTACT'));

console.log(
  `${apply ? 'APPLYING' : 'DRY RUN'}: compare ${extractors.map((e) => e.model).join(' vs ')} on ${sampleSize} sites (env ${env}, project ${projectId})`,
);
peakHourWarning();

// Fisher–Yates over the eligible pantries; fetch failures are replaced from
// the rest of the shuffled list until the sample is full.
const pool = await allCrawlTargets(db);
for (let i = pool.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [pool[i], pool[j]] = [pool[j], pool[i]];
}

const items: LlmEvalItemDocument[] = [];
const totals = new Map(extractors.map((e) => [e.model, { input: 0, output: 0, targets: 0 }]));
const queue = new PQueue({ concurrency: 8 });
let next = 0;

const takeOne = async (): Promise<void> => {
  while (items.length < sampleSize && next < pool.length) {
    const p = pool[next++];
    const home = await loadPage(fetcher, p.url);
    if (!home.page || home.page.looksJsRendered) continue;
    const site = await loadSite(fetcher, home);
    const forLlm = pagesForExtraction(site);
    const ctx = pantryContext(p.pantry, targetsFor(p.pantry));

    const results = await Promise.all(
      extractors.map(async (e) => {
        try {
          const { proposals, usage } = await e.proposeMappings(forLlm, ctx);
          return { model: e.model, proposals: toCandidates(site, proposals), ...usage };
        } catch (err) {
          return { model: e.model, proposals: [] as TargetProposal[], inputTokens: 0, outputTokens: 0, error: errorMessage(err) };
        }
      }),
    );
    if (items.length >= sampleSize) return;
    for (const r of results) {
      const t = totals.get(r.model)!;
      t.input += r.inputTokens;
      t.output += r.outputTokens;
      t.targets += r.proposals.length;
    }
    // Shuffle which model is A, so the grader can't tell them apart.
    const [a, b] = randomInt(2) === 0 ? results : [results[1], results[0]];
    items.push({
      pantryId: p.id,
      pantryName: p.pantry.name,
      url: home.fetch.finalUrl,
      variants: { A: a, B: b } as LlmEvalItemDocument['variants'],
      grades: { A: {}, B: {} } as Record<EvalVariantKey, object>,
    });
    console.log(`[${items.length}/${sampleSize}] ${p.pantry.name}: ${results.map((r) => `${r.model} ${r.proposals.length} target(s)${r.error ? ` ERROR ${r.error}` : ''}`).join(' | ')}`);
  }
};

for (let i = 0; i < 8; i++) void queue.add(takeOne);
await queue.onIdle();

console.log('\nTotals:');
for (const [model, t] of totals) {
  console.log(`  ${model}: ${t.targets} targets proposed, ${t.input} input / ${t.output} output tokens`);
}

if (!apply) {
  console.log(`\nDry run only (the LLM calls above were real). To store results for grading:\n  ${applyCommand()}`);
} else {
  const evalRef = db.collection(COLLECTIONS.llmEvals).doc();
  const evalDoc: LlmEvalDocument = {
    env,
    models: extractors.map((e) => e.model),
    itemCount: items.length,
    createdAt: Timestamp.now(),
  };
  const batch = db.batch();
  batch.set(evalRef, evalDoc);
  for (const item of items) batch.set(evalRef.collection('items').doc(), pruneUndefined(item));
  await batch.commit();
  console.log(`\nStored eval ${evalRef.id}; grade it on the admin's LLM eval page.`);
}
