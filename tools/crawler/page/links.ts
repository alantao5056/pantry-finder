/**
 * Picks the same-site pages most likely to hold hours/contact details, to
 * fetch alongside the homepage. Links are read from the raw HTML (nav menus
 * are dropped by segmentation but are where these links usually live).
 */
import * as cheerio from 'cheerio';
import { siteOf } from '../fetch/fetcher.js';

export const MAX_EXTRA_PAGES = 5;

const KEYWORDS: [RegExp, number][] = [
  [/hours|schedule|calendar|when/i, 5],
  [/pantry|distribution|food|get[-\s]?help|find[-\s]?food|assistance|visit/i, 4],
  [/contact|location|directions|find[-\s]?us/i, 3],
  [/about|who[-\s]?we|mission|services|programs?/i, 2],
];

const SKIP = /\.(pdf|jpe?g|png|gif|webp|svg|docx?|xlsx?|pptx?|zip|mp[34])(\?|$)|^mailto:|^tel:|^javascript:|donat|volunteer|login|sign[-\s]?in|cart|shop|blog\/|news\//i;

export function pickLinks(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const site = siteOf(pageUrl);
  const home = normalize(pageUrl);
  const scores = new Map<string, number>();

  $('a[href]').each((_i, a) => {
    const href = $(a).attr('href')!.trim();
    if (!href || href.startsWith('#') || SKIP.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol) || siteOf(url.href) !== site) return;
    const key = normalize(url.href);
    if (key === home) return;
    const haystack = `${url.pathname} ${$(a).text()}`;
    let score = 0;
    for (const [re, weight] of KEYWORDS) if (re.test(haystack)) score += weight;
    if (score > 0) scores.set(key, Math.max(scores.get(key) ?? 0, score));
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .slice(0, MAX_EXTRA_PAGES)
    .map(([url]) => url);
}

/** Drops the fragment and a trailing slash so one page isn't fetched twice. */
function normalize(href: string): string {
  const url = new URL(href);
  url.hash = '';
  return url.href.replace(/\/$/, '');
}
