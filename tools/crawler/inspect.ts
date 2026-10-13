/**
 * Debug aid, no Firestore and no LLM: fetch a URL the way the crawler does and
 * print its blocks and the extra pages it would follow.
 *   npm run inspect -- https://example.org
 */
import { Fetcher } from './fetch/fetcher.js';
import { pickLinks } from './page/links.js';
import { segmentPage } from './page/segment.js';
import { sitemapUrls } from './site.js';

const url = process.argv[2];
if (!url) throw new Error('Usage: npm run inspect -- <url>');

const fetcher = new Fetcher(process.env.CRAWLER_CONTACT ?? 'https://pantryfinder.org');
const res = await fetcher.fetchPage(url);
console.log(`status ${res.status} final ${res.finalUrl}${res.error ? ` error: ${res.error}` : ''}`);
if (res.html) {
  const page = segmentPage(res.html);
  console.log(`text ${page.textLength} chars, JS-rendered: ${page.looksJsRendered}\n`);
  for (const s of page.segments) {
    const tag = s.headingLevel ? `H${s.headingLevel}` : '  ';
    console.log(`[${s.id}] ${tag} ${s.text.replace(/\n/g, ' ⏎ ')}\n        ${s.selector}${s.anchor ? `  ⟵ ${s.anchor}` : ''}`);
  }
  const sitemap = await sitemapUrls(fetcher, res.finalUrl);
  console.log(`\nSitemap: ${sitemap.length} URLs`);
  console.log('Extra pages:', pickLinks(res.html, res.finalUrl, sitemap));
}
