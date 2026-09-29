/**
 * Finds a confirmed mapping's region on a freshly fetched page: by selector
 * first, then by the text anchor (the blocks under the heading with that
 * text, up to the next heading of the same or higher level).
 */
import type { Element } from 'domhandler';
import { regionText, type SegmentedPage } from './segment.js';

const MAX_ANCHOR_BLOCKS = 15;

export interface LocatedRegion {
  rawText: string;
  by: 'selector' | 'anchor';
}

export function locateRegion(
  page: SegmentedPage,
  selector: string | undefined,
  textAnchor: string | undefined,
): LocatedRegion | null {
  if (selector) {
    let els: Element[] = [];
    try {
      els = page.$(selector).toArray() as Element[];
    } catch {
      // A selector that no longer parses counts as not matching.
    }
    const rawText = els.length ? regionText(page, els) : '';
    if (rawText) return { rawText, by: 'selector' };
  }

  if (textAnchor) {
    const wanted = normalizeAnchor(textAnchor);
    const start = page.segments.findIndex((s) => s.headingLevel && normalizeAnchor(s.text) === wanted);
    if (start !== -1) {
      const level = page.segments[start].headingLevel!;
      const lines: string[] = [];
      for (const s of page.segments.slice(start + 1, start + 1 + MAX_ANCHOR_BLOCKS)) {
        if (s.headingLevel && s.headingLevel <= level) break;
        lines.push(s.text);
      }
      if (lines.length) return { rawText: lines.join('\n'), by: 'anchor' };
    }
  }
  return null;
}

function normalizeAnchor(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
