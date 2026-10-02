/**
 * Fetching a pantry's site into segmented pages, and turning the LLM's block
 * ids back into mapping candidates (selector, text anchor, raw text).
 */
import { createHash } from 'node:crypto';
import {
  normalizeTargetValue,
  sameTargetValue,
  type MappingCandidate,
  type TargetProposal,
} from '@pantry-finder/shared';
import type { FetchResult, Fetcher } from './fetch/fetcher.js';
import { pickLinks } from './page/links.js';
import { locateRegion } from './page/locate.js';
import { segmentPage, type SegmentedPage } from './page/segment.js';
import type { PageForExtraction, RawProposal } from './extract/Extractor.js';

// Keeps a first-visit prompt near the design's ~10k input tokens per pantry.
const MAX_PROMPT_CHARS = 36_000;

export interface LoadedPage {
  url: string;
  fetch: FetchResult;
  page?: SegmentedPage;
}

/** Stored websites sometimes lack a scheme (`www.example.org`). */
export function normalizeWebsite(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export async function loadPage(fetcher: Fetcher, url: string): Promise<LoadedPage> {
  const fetch = await fetcher.fetchPage(url);
  return { url, fetch, page: fetch.html ? segmentPage(fetch.html) : undefined };
}

/** The homepage plus the likeliest hours/contact pages. */
export async function loadSite(fetcher: Fetcher, home: LoadedPage): Promise<LoadedPage[]> {
  if (!home.fetch.html) return [home];
  const links = pickLinks(home.fetch.html, home.fetch.finalUrl);
  const extra = await Promise.all(links.map((url) => loadPage(fetcher, url)));
  return [home, ...extra.filter((p) => p.page && !p.page.looksJsRendered)];
}

/**
 * Pages as numbered blocks (`p<page>b<n>`) for the LLM. Blocks repeated from
 * an earlier page (header, footer) are left out, and each page gets an equal
 * share of the character budget.
 */
export function pagesForExtraction(pages: LoadedPage[]): PageForExtraction[] {
  const seen = new Set<string>();
  const share = Math.floor(MAX_PROMPT_CHARS / Math.max(pages.length, 1));
  return pages.map((p, i) => {
    let used = 0;
    const blocks: PageForExtraction['blocks'] = [];
    for (const s of p.page?.segments ?? []) {
      if (seen.has(s.text)) continue;
      seen.add(s.text);
      if (used + s.text.length > share) break;
      used += s.text.length;
      blocks.push({ id: `p${i}${s.id}`, text: s.text, anchor: s.anchor });
    }
    return { url: p.fetch.finalUrl, blocks };
  });
}

/** Hash of what a proposal would be based on; unchanged pages aren't re-proposed. */
export function contentHash(pages: PageForExtraction[], targets: string[]): string {
  const h = createHash('sha256');
  h.update(targets.join(','));
  for (const p of pages) for (const b of p.blocks) h.update(`\n${b.text}`);
  return h.digest('hex');
}

export function toCandidates(pages: LoadedPage[], raw: RawProposal[]): TargetProposal[] {
  return raw
    .map((r) => ({
      target: r.target,
      candidates: r.candidates
        .map((c): MappingCandidate | null => {
          const pageIndex = Number(/^p(\d+)b/.exec(c.blockIds[0])?.[1]);
          const loaded = pages[pageIndex];
          if (!loaded?.page) return null;
          const segIds = new Set(c.blockIds.map((id) => id.replace(/^p\d+/, '')));
          const segs = loaded.page.segments.filter((s) => segIds.has(s.id));
          if (!segs.length) return null;
          const first = segs[0];
          const selector = [...new Set(segs.map((s) => s.selector))].join(', ');
          // Text as a later run will read it: through the selector, not the chosen elements.
          const rawText = locateRegion(loaded.page, selector, undefined)?.rawText;
          if (!rawText) return null;
          return {
            url: loaded.fetch.finalUrl,
            selector,
            textAnchor: first.headingLevel ? first.text : first.anchor,
            rawText,
            value: normalizeTargetValue(r.target, c.value),
            uncertain: c.uncertain,
          };
        })
        .filter((c): c is MappingCandidate => c !== null)
        // A site often repeats a value (body and footer); keep the LLM's best region for each.
        .filter((c, i, all) => all.findIndex((o) => sameTargetValue(r.target, o.value, c.value)) === i),
    }))
    .filter((p) => p.candidates.length > 0);
}
