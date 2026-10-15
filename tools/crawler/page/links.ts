/**
 * Picks the same-site pages most likely to hold hours/contact details, to
 * fetch alongside the homepage. Links are read from the raw HTML (nav menus
 * are dropped by segmentation but are where these links usually live).
 */
import * as cheerio from 'cheerio';
import { siteOf } from '../fetch/fetcher.js';

export const MAX_EXTRA_PAGES = 6;

const KEYWORDS: [RegExp, number][] = [
  [/pantry|distribution|food|nutrition|meal|grocer|hunger|feeding|kitchen|cupboard|(?:get|find|need)[-\s]?help|find[-\s]?food|assistance|visit|vincent|svdp/i, 6],
  [/hours|schedule|calendar|when/i, 5],
  [/contact|location|directions|find[-\s]?us/i, 3],
  [/about|who[-\s]?we|mission|services|programs?|ministr|outreach|resources/i, 2],
];

const SKIP = /\.(pdf|jpe?g|png|gif|webp|svg|docx?|xlsx?|pptx?|zip|mp[34])(\?|$)|^mailto:|^tel:|^javascript:|donat|volunteer|login|sign[-\s]?in|cart|shop|blog\/|news\//i;

/** `sitemapUrls` are scored by path alone; they reach pages the homepage doesn't link. */
export function pickLinks(html: string, pageUrl: string, sitemapUrls: string[] = []): string[] {
  const $ = cheerio.load(html);
  const site = siteOf(pageUrl);
  const home = withoutWww(normalize(pageUrl));
  const scores = new Map<string, number>();

  const add = (href: string, text: string) => {
    if (!href || href.startsWith('#') || SKIP.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol) || siteOf(url.href) !== site) return;
    const key = normalize(url.href);
    if (withoutWww(key) === home) return;
    const haystack = `${url.pathname} ${text}`;
    let score = 0;
    for (const [re, weight] of KEYWORDS) if (re.test(haystack)) score += weight;
    if (score > 0) scores.set(key, Math.max(scores.get(key) ?? 0, score));
  };

  $('a[href]').each((_i, a) => add($(a).attr('href')!.trim(), $(a).text()));
  for (const url of sitemapUrls) add(url.trim(), '');

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([url]) => url);

  // One link per path first; query variants only fill leftover slots.
  const paths = new Set<string>();
  const first: string[] = [];
  const variants: string[] = [];
  for (const url of ranked) {
    const path = new URL(url).pathname.toLowerCase();
    if (paths.has(path)) variants.push(url);
    else {
      paths.add(path);
      first.push(url);
    }
  }
  return [...first, ...variants].slice(0, MAX_EXTRA_PAGES);
}

/** `<loc>` values of a sitemap or sitemap index. */
export function sitemapLocs(xml: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  return $('loc')
    .map((_i, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}

/** Drops the fragment and a trailing slash so one page isn't fetched twice. */
function normalize(href: string): string {
  const url = new URL(href);
  url.hash = '';
  return url.href.replace(/\/$/, '');
}

function withoutWww(href: string): string {
  return href.replace(/^(https?:\/\/)www\./i, '$1');
}
