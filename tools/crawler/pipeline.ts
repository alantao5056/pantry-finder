/**
 * Per-pantry crawl logic (docs/crawler-design.md, M2: single-pantry sites).
 *
 *   targets with no mapping  → LLM proposes regions → `new_mapping` review
 *   active mappings          → re-read region → unchanged text is skipped;
 *                              otherwise parse (extraction cache, else LLM) and
 *                              apply automatically, unless a guardrail trips
 *   needs_recheck mappings   → same, but every change goes to review
 *
 * In dry-run mode nothing is written; decisions are printed instead.
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  parseTarget,
  pruneUndefined,
  type MappingTarget,
  type SuspiciousReason,
  type TargetValue,
} from '@pantry-finder/shared';
import {
  COLLECTIONS,
  PantryWriteError,
  mappingId,
  planFieldUpdates,
  rawHash,
  writeFieldUpdates,
  type CrawlSourceDocument,
  type ExtractionCacheDocument,
  type FieldMappingDocument,
  type PantryDocument,
  type ReviewItemDocument,
} from '@pantry-finder/shared/firestore';
import { createHash } from 'node:crypto';
import type { Fetcher } from './fetch/fetcher.js';
import { errorMessage, hostOf, siteOf } from './fetch/fetcher.js';
import type { Extractor, PantryContext, Usage } from './extract/Extractor.js';
import { suspiciousReasons } from './guardrails.js';
import type { SiteCache } from './site-cache.js';
import { locateRegion } from './page/locate.js';
import {
  contentHash,
  loadPage,
  loadSite,
  normalizeWebsite,
  pagesForExtraction,
  toCandidates,
  type LoadedPage,
} from './site.js';

export type StoredPantry = Omit<PantryDocument, 'id'>;

export interface RunStats {
  fetched: number;
  failed: number;
  autoUpdated: number;
  reviewItemsCreated: number;
  skippedUnchanged: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  errors: string[];
}

export function emptyStats(): RunStats {
  return {
    fetched: 0,
    failed: 0,
    autoUpdated: 0,
    reviewItemsCreated: 0,
    skippedUnchanged: 0,
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    errors: [],
  };
}

const MAX_ERRORS = 100;

/** Targets the crawler looks for on a pantry. `website` is only ever changed through review. */
export function targetsFor(p: StoredPantry): MappingTarget[] {
  return [
    'phone',
    'contactName',
    'aboutUs',
    'notes',
    'schedules',
    ...(p.services ?? []).map((_s, i) => `services.${i}.schedules` as MappingTarget),
  ];
}

export function pantryContext(p: StoredPantry, targets: MappingTarget[]): PantryContext {
  return {
    name: p.name,
    city: p.city,
    state: p.state,
    services: (p.services ?? []).map((s, i) => ({ index: i, name: s.name, category: s.categoryDescription })),
    targets,
  };
}

/** A `crawl_sources` doc plus the crawler-only bookkeeping fields stored on homepages. */
type SourceState = CrawlSourceDocument & { proposalHash?: string; redirectReviewedUrl?: string };

function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export class PantryCrawler {
  constructor(
    private readonly db: Firestore,
    private readonly fetcher: Fetcher,
    private readonly extractor: Extractor,
    private readonly runId: string | null,
    private readonly apply: boolean,
    readonly stats: RunStats,
    private readonly siteCache: SiteCache,
  ) {}

  async process(id: string, pantry: StoredPantry): Promise<void> {
    try {
      await this.processInner(id, pantry);
    } catch (err) {
      this.error(id, errorMessage(err));
    }
    // Stamped on failures too, so a dead site moves to the back of the rotation
    // (select.ts) instead of taking a slot in every run.
    if (this.apply) {
      try {
        await this.db.collection(COLLECTIONS.pantries).doc(id).update({ lastCrawledAt: Timestamp.now() });
      } catch (err) {
        this.error(id, `lastCrawledAt: ${errorMessage(err)}`);
      }
    }
  }

  private async processInner(id: string, pantry: StoredPantry): Promise<void> {
    const website = normalizeWebsite(pantry.website ?? '');
    if (!website) return this.error(id, `Unusable website ${JSON.stringify(pantry.website)}`);

    const mappingSnap = await this.db.collection(COLLECTIONS.fieldMappings).where('pantryId', '==', id).get();
    const mappings = new Map(
      mappingSnap.docs.map((d) => [(d.data() as FieldMappingDocument).target, { id: d.id, ...(d.data() as FieldMappingDocument) }]),
    );

    const home = await loadPage(this.fetcher, website);
    const homeSource = await this.recordSource(home);
    if (!home.page) {
      this.stats.failed++;
      return this.error(id, `${website}: ${home.fetch.error ?? 'no content'}`);
    }
    this.stats.fetched++;
    if (home.page.looksJsRendered) {
      return this.log(id, `${website} looks JS-rendered; marked needsBrowser, skipped`);
    }

    if (siteOf(home.fetch.finalUrl) !== siteOf(website)) {
      await this.redirectReview(id, pantry, website, home, homeSource);
    }

    // Pages fetched for this pantry, by URL, so mappings reuse them.
    const pages = new Map<string, LoadedPage>([
      [home.url, home],
      [home.fetch.finalUrl, home],
    ]);

    const hasPendingProposal = [...mappings.values()].some((m) => m.status === 'proposed');
    const unmapped = targetsFor(pantry).filter((t) => !mappings.has(t));
    if (unmapped.length && !hasPendingProposal) {
      await this.propose(id, pantry, website, home, homeSource, unmapped, pages);
    }

    for (const m of mappings.values()) {
      if (m.status !== 'active' && m.status !== 'needs_recheck') continue;
      await this.refresh(id, pantry, m, pages);
    }
  }

  // ---- first visit: propose mappings ----

  private async propose(
    id: string,
    pantry: StoredPantry,
    website: string,
    home: LoadedPage,
    homeSource: SourceState,
    targets: MappingTarget[],
    pages: Map<string, LoadedPage>,
  ): Promise<void> {
    const site = await loadSite(this.fetcher, home);
    for (const p of site.slice(1)) {
      pages.set(p.url, p);
      pages.set(p.fetch.finalUrl, p);
      await this.recordSource(p);
    }
    const forLlm = pagesForExtraction(site);
    const hash = contentHash(forLlm, targets);
    if (homeSource.proposalHash === hash) {
      return this.log(id, 'site unchanged since last proposal; not re-proposing');
    }

    const ctx = pantryContext(pantry, targets);
    const { proposals: raw, usage } = await this.extractor.proposeMappings(forLlm, ctx);
    this.countLlm(usage);
    const proposals = toCandidates(site, raw);

    if (!this.apply) {
      this.log(id, `would propose ${proposals.length} target(s):`);
      for (const p of proposals) {
        const c = p.candidates[0];
        console.log(`    ${p.target} ← ${JSON.stringify(c.value).slice(0, 160)}${c.uncertain ? ' (uncertain)' : ''}\n      ${c.url} :: ${c.textAnchor ?? c.selector}`);
      }
      return;
    }

    const now = Timestamp.now();
    const batch = this.db.batch();
    batch.set(
      this.db.collection(COLLECTIONS.crawlSources).doc(urlHash(home.url)),
      { proposalHash: hash },
      { merge: true },
    );
    if (proposals.length) {
      const itemRef = this.db.collection(COLLECTIONS.reviewItems).doc();
      const item: ReviewItemDocument = {
        type: 'new_mapping',
        status: 'pending',
        title: pantry.name,
        subtitle: `${pantry.city}, ${pantry.state} · ${hostOf(website)}`,
        pantryId: id,
        ...(this.runId ? { runId: this.runId } : {}),
        newMapping: { website, fetchedAt: now, proposals },
        createdAt: now,
      };
      batch.create(itemRef, pruneUndefined(item));
      for (const p of proposals) {
        const mapping: FieldMappingDocument = {
          pantryId: id,
          target: p.target,
          status: 'proposed',
          reviewItemId: itemRef.id,
          updatedAt: now,
        };
        batch.set(this.db.collection(COLLECTIONS.fieldMappings).doc(mappingId(id, p.target)), mapping);
      }
      this.stats.reviewItemsCreated++;
    }
    await batch.commit();
    this.log(id, `proposed ${proposals.length} target(s)`);
  }

  // ---- later visits: refresh confirmed mappings ----

  private async refresh(
    id: string,
    pantry: StoredPantry,
    m: FieldMappingDocument & { id: string },
    pages: Map<string, LoadedPage>,
  ): Promise<void> {
    if (!m.url) return;
    let loaded = pages.get(m.url);
    if (!loaded) {
      loaded = await loadPage(this.fetcher, m.url);
      pages.set(m.url, loaded);
      await this.recordSource(loaded);
    }
    if (!loaded.page) {
      // A failed fetch isn't a broken mapping; try again next run.
      return this.error(id, `${m.target}: ${m.url}: ${loaded.fetch.error ?? 'no content'}`);
    }

    const region = locateRegion(loaded.page, m.selector, m.textAnchor);
    if (!region) {
      this.error(id, `${m.target}: region not found on ${m.url}; mapping marked broken`);
      if (this.apply) await this.updateMapping(m.id, { status: 'broken' });
      return;
    }

    const kind = parseTarget(m.target)?.kind === 'schedules' ? 'schedules' : 'text';
    const hash = rawHash(kind, region.rawText);
    if (hash === m.lastRawHash) {
      this.stats.skippedUnchanged++;
      return;
    }

    // A confirmed parse of identical text is reused; otherwise ask the LLM.
    let value: TargetValue;
    let uncertain = false;
    const cached = await this.db.collection(COLLECTIONS.extractionCache).doc(hash).get();
    if (cached.exists) {
      value = (cached.data() as ExtractionCacheDocument).value;
    } else {
      const parsed = await this.extractor.parseRegion(m.target, region.rawText, pantryContext(pantry, [m.target]));
      this.countLlm(parsed.usage);
      value = parsed.value;
      uncertain = parsed.uncertain;
    }

    let plan;
    try {
      plan = planFieldUpdates(pantry, [{ target: m.target, value, mappingId: m.id }]);
    } catch (err) {
      if (err instanceof PantryWriteError && err.code === 'bad_target') {
        this.error(id, `${m.target}: ${err.message}; mapping marked broken`);
        if (this.apply) await this.updateMapping(m.id, { status: 'broken' });
        return;
      }
      throw err;
    }
    if (plan.length === 0) {
      if (this.apply) await this.updateMapping(m.id, { lastRawHash: hash });
      return;
    }

    const change = plan[0];
    const reasons: SuspiciousReason[] = suspiciousReasons(m.target, change.oldValue, change.newValue, region.rawText, uncertain);
    if (m.status === 'needs_recheck') reasons.push('needs_recheck');

    if (reasons.length) {
      this.log(id, `${m.target}: held for review (${reasons.join(', ')})`);
      if (!this.apply) return;
      const now = Timestamp.now();
      const batch = this.db.batch();
      const item: ReviewItemDocument = {
        type: 'suspicious_value',
        status: 'pending',
        title: pantry.name,
        subtitle: `${m.target} · ${pantry.city}, ${pantry.state}`,
        pantryId: id,
        ...(this.runId ? { runId: this.runId } : {}),
        suspicious: {
          target: m.target,
          mappingId: m.id,
          url: loaded.fetch.finalUrl,
          rawText: region.rawText,
          rawHash: hash,
          reasons,
          oldValue: change.oldValue ?? (kind === 'schedules' ? [] : ''),
          newValue: change.newValue,
        },
        createdAt: now,
      };
      batch.create(this.db.collection(COLLECTIONS.reviewItems).doc(), pruneUndefined(item));
      batch.update(this.db.collection(COLLECTIONS.fieldMappings).doc(m.id), { lastRawHash: hash, updatedAt: now });
      await batch.commit();
      this.stats.reviewItemsCreated++;
      return;
    }

    if (!this.apply) {
      this.log(id, `${m.target}: would update ${JSON.stringify(change.oldValue).slice(0, 80)} → ${JSON.stringify(change.newValue).slice(0, 80)}`);
      return;
    }

    // Re-read inside a transaction so a concurrent admin edit isn't overwritten blindly.
    const applied = await this.db.runTransaction(async (tx) => {
      const pantryRef = this.db.collection(COLLECTIONS.pantries).doc(id);
      const snap = await tx.get(pantryRef);
      if (!snap.exists) return 0;
      const fresh = snap.data() as StoredPantry;
      const freshPlan = planFieldUpdates(fresh, [{ target: m.target, value, mappingId: m.id }]);
      const now = Timestamp.now();
      writeFieldUpdates(tx, this.db, pantryRef, fresh, freshPlan, {
        source: 'crawler',
        actor: 'crawler',
        now,
        runId: this.runId ?? undefined,
      });
      tx.update(this.db.collection(COLLECTIONS.fieldMappings).doc(m.id), { lastRawHash: hash, updatedAt: now });
      return freshPlan.length;
    });
    this.stats.autoUpdated += applied;
    if (applied) {
      this.log(id, `${m.target}: updated`);
      await this.siteCache.invalidate({ id, state: pantry.state, city: pantry.city });
    }
  }

  // ---- website moved to another site ----

  private async redirectReview(
    id: string,
    pantry: StoredPantry,
    website: string,
    home: LoadedPage,
    homeSource: SourceState,
  ): Promise<void> {
    const newUrl = home.fetch.finalUrl;
    if (homeSource.redirectReviewedUrl === newUrl) return;
    const reasons: SuspiciousReason[] = ['redirect'];
    this.log(id, `website redirects to ${newUrl}; held for review`);
    if (!this.apply) return;
    const now = Timestamp.now();
    const batch = this.db.batch();
    const item: ReviewItemDocument = {
      type: 'suspicious_value',
      status: 'pending',
      title: pantry.name,
      subtitle: `website · ${pantry.city}, ${pantry.state}`,
      pantryId: id,
      ...(this.runId ? { runId: this.runId } : {}),
      suspicious: {
        target: 'website',
        url: website,
        rawText: `${website} redirects to ${newUrl}`,
        reasons,
        oldValue: pantry.website ?? '',
        newValue: newUrl,
      },
      createdAt: now,
    };
    batch.create(this.db.collection(COLLECTIONS.reviewItems).doc(), pruneUndefined(item));
    batch.set(
      this.db.collection(COLLECTIONS.crawlSources).doc(urlHash(home.url)),
      { redirectReviewedUrl: newUrl },
      { merge: true },
    );
    await batch.commit();
    this.stats.reviewItemsCreated++;
  }

  // ---- bookkeeping ----

  /** Writes `crawl_sources` (apply mode) and returns the stored doc as it was before this fetch. */
  private async recordSource(
    loaded: LoadedPage,
  ): Promise<SourceState> {
    const ref = this.db.collection(COLLECTIONS.crawlSources).doc(urlHash(loaded.url));
    const prev = (await ref.get()).data() as SourceState | undefined;
    const doc: CrawlSourceDocument = {
      url: loaded.url,
      host: hostOf(loaded.url),
      needsBrowser: loaded.page?.looksJsRendered ?? prev?.needsBrowser ?? false,
      robotsAllowed: loaded.fetch.robotsAllowed,
      lastFetchedAt: Timestamp.now(),
      lastStatus: loaded.fetch.status,
      finalUrl: loaded.fetch.finalUrl,
      ...(loaded.fetch.error ? { lastError: loaded.fetch.error } : {}),
    };
    if (this.apply) await ref.set(doc, { merge: true });
    return { ...doc, proposalHash: prev?.proposalHash, redirectReviewedUrl: prev?.redirectReviewedUrl };
  }

  private async updateMapping(id: string, fields: Partial<FieldMappingDocument>): Promise<void> {
    await this.db.collection(COLLECTIONS.fieldMappings).doc(id).update({ ...fields, updatedAt: Timestamp.now() });
  }

  private countLlm(usage: Usage): void {
    this.stats.llmCalls++;
    this.stats.inputTokens += usage.inputTokens;
    this.stats.outputTokens += usage.outputTokens;
  }

  private log(id: string, message: string): void {
    console.log(`  ${id}: ${message}`);
  }

  private error(id: string, message: string): void {
    console.warn(`  ${id}: ERROR ${message}`);
    this.stats.errors.push(`${id}: ${message}`);
    if (this.stats.errors.length > MAX_ERRORS) this.stats.errors.shift();
  }
}

