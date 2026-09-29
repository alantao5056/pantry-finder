/**
 * Splits a page into numbered text blocks. The LLM is shown `[id] text` lines
 * and answers with block ids; the code turns those into CSS selectors, so the
 * LLM never has to invent a selector.
 *
 * A block is the nearest block-level ancestor of a run of text; its text is
 * the text directly inside it (inline children included, nested blocks not).
 */
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

const REMOVE = 'script, style, noscript, svg, iframe, template, object, embed, canvas, nav, form select';

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'dd', 'details', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hgroup', 'li', 'main', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul',
]);

// Pseudo-heading level for short blocks that are entirely bold text.
const BOLD_HEADING_LEVEL = 7;
const MAX_BLOCK_CHARS = 600;

export interface Segment {
  /** Position in the page, e.g. `b12`. */
  id: string;
  el: Element;
  selector: string;
  text: string;
  /** 1–6 for h1–h6, 7 for a short all-bold block; undefined for body text. */
  headingLevel?: number;
  /** Text of the nearest heading before this block. */
  anchor?: string;
}

export interface SegmentedPage {
  $: cheerio.CheerioAPI;
  segments: Segment[];
  /** Total visible text length, used to spot JS-rendered pages. */
  textLength: number;
  /** Looks like a client-rendered app shell (almost no text, script bundles). */
  looksJsRendered: boolean;
}

export function segmentPage(html: string): SegmentedPage {
  const $ = cheerio.load(html);
  const scriptCount = $('script[src]').length;
  const hasAppRoot = $('#root, #app, #__next, #___gatsby, [ng-app], [data-reactroot]').length > 0;
  $(REMOVE).remove();

  const texts = new Map<Element, string[]>();
  const order: Element[] = [];

  const walk = (node: AnyNode, block: Element) => {
    if (node.type === 'text') {
      const t = node.data.replace(/\s+/g, ' ');
      if (t.trim()) {
        if (!texts.has(block)) {
          texts.set(block, []);
          order.push(block);
        }
        texts.get(block)!.push(t);
      }
      return;
    }
    if (node.type !== 'tag') return;
    const el = node as Element;
    if (el.name === 'br') {
      texts.get(block)?.push('\n');
      return;
    }
    const next = BLOCK_TAGS.has(el.name) ? el : block;
    for (const child of el.children) walk(child, next);
  };
  const body = $('body')[0];
  if (body) walk(body, body);

  // Only ids that occur once can anchor a selector (widget ids are often repeated).
  const idCounts = new Map<string, number>();
  $('[id]').each((_i, el) => {
    const id = (el as Element).attribs.id;
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  });
  const uniqueIds = new Set([...idCounts].filter(([, n]) => n === 1).map(([id]) => id));

  const segments: Segment[] = [];
  let anchor: string | undefined;
  let textLength = 0;
  for (const el of order) {
    const text = cleanText(texts.get(el)!.join(''));
    if (text.length < 2) continue;
    textLength += text.length;
    const headingLevel = headingLevelOf($, el, text);
    segments.push({
      id: `b${segments.length}`,
      el,
      selector: selectorFor(el, uniqueIds),
      text: text.length > MAX_BLOCK_CHARS ? `${text.slice(0, MAX_BLOCK_CHARS)}…` : text,
      headingLevel,
      anchor: headingLevel ? undefined : anchor,
    });
    if (headingLevel) anchor = text;
  }

  return {
    $,
    segments,
    textLength,
    looksJsRendered: textLength < 200 && (scriptCount > 0 || hasAppRoot),
  };
}

function cleanText(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function headingLevelOf($: cheerio.CheerioAPI, el: Element, text: string): number | undefined {
  const m = /^h([1-6])$/.exec(el.name);
  if (m) return Number(m[1]);
  if (text.length <= 60 && !text.includes('\n')) {
    const bold = $(el).children('strong, b').text().replace(/\s+/g, ' ').trim();
    if (bold && bold === text) return BOLD_HEADING_LEVEL;
  }
  return undefined;
}

/** Stable-ish CSS path: `#id` when an ancestor has a readable id, then `tag:nth-of-type(n)` steps. */
function selectorFor(el: Element, uniqueIds: Set<string>): string {
  const steps: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.type === 'tag' && cur.name !== 'html') {
    const id = cur.attribs.id;
    if (id && /^[A-Za-z][\w-]*$/.test(id) && !/\d{3,}/.test(id)) {
      steps.unshift(`#${id}`);
      return steps.join(' > ');
    }
    if (cur.name === 'body') {
      steps.unshift('body');
      break;
    }
    const parent: Element | null = cur.parent && cur.parent.type === 'tag' ? (cur.parent as Element) : null;
    const name: string = cur.name;
    const sameTag = parent ? parent.children.filter((c): c is Element => c.type === 'tag' && c.name === name) : [cur];
    steps.unshift(sameTag.length > 1 ? `${name}:nth-of-type(${sameTag.indexOf(cur) + 1})` : name);
    cur = parent;
  }
  return steps.join(' > ');
}

/**
 * The text of a region: every segment whose block is one of `els` or sits
 * inside one of them, in page order. Used both when a mapping is proposed and
 * when it is re-read, so the same page yields the same text (and hash).
 */
export function regionText(page: SegmentedPage, els: Element[]): string {
  const roots = new Set(els);
  const inRegion = (el: Element): boolean => {
    for (let cur: AnyNode | null = el; cur; cur = cur.parent) {
      if (roots.has(cur as Element)) return true;
    }
    return false;
  };
  return page.segments
    .filter((s) => inRegion(s.el))
    .map((s) => s.text)
    .join('\n');
}
