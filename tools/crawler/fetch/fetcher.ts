/**
 * Polite page fetching: robots.txt is obeyed, and each host gets its own queue
 * allowing one request per second (or the site's Crawl-delay, if longer).
 * Uses Node's built-in fetch (undici).
 */
import PQueue from 'p-queue';
import robotsParserModule from 'robots-parser';

// robots-parser is CommonJS (`module.exports = fn`) but its typings declare an
// ES default export, so under NodeNext the types see a namespace object.
const robotsParser = robotsParserModule as unknown as typeof robotsParserModule.default;

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 10_000;
const BOT_NAME = 'PantryFinderBot';

type Robots = ReturnType<typeof robotsParser>;

export interface FetchResult {
  url: string;
  /** After redirects. */
  finalUrl: string;
  /** HTTP status, or 0 for network errors / timeouts / robots-disallowed. */
  status: number;
  robotsAllowed: boolean;
  html?: string;
  error?: string;
}

export function hostOf(url: string): string {
  return new URL(url).host.toLowerCase();
}

/** Host without a leading `www.`, for "same site" comparisons. */
export function siteOf(url: string): string {
  return hostOf(url).replace(/^www\./, '');
}

export class Fetcher {
  private readonly queues = new Map<string, PQueue>();
  private readonly robots = new Map<string, Promise<Robots | null>>();
  readonly userAgent: string;

  constructor(contact: string) {
    this.userAgent = `${BOT_NAME}/1.0 (+${contact})`;
  }

  async fetchPage(url: string): Promise<FetchResult> {
    const robots = await this.robotsFor(url);
    if (robots && robots.isAllowed(url, BOT_NAME) === false) {
      return { url, finalUrl: url, status: 0, robotsAllowed: false, error: 'Disallowed by robots.txt' };
    }
    return this.enqueue(url, async () => {
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { 'User-Agent': this.userAgent, Accept: 'text/html,application/xhtml+xml' },
        });
        const base = { url, finalUrl: res.url || url, status: res.status, robotsAllowed: true };
        if (!res.ok) {
          await res.body?.cancel();
          return { ...base, error: `HTTP ${res.status}` };
        }
        const type = res.headers.get('content-type') ?? '';
        if (!/html/i.test(type)) {
          await res.body?.cancel();
          return { ...base, error: `Not HTML (${type || 'no content-type'})` };
        }
        return { ...base, html: await readCapped(res) };
      } catch (err) {
        return { url, finalUrl: url, status: 0, robotsAllowed: true, error: errorMessage(err) };
      }
    });
  }

  private enqueue<T>(url: string, task: () => Promise<T>): Promise<T> {
    return this.queueFor(hostOf(url)).add(task) as Promise<T>;
  }

  private queueFor(host: string, intervalMs = MIN_INTERVAL_MS): PQueue {
    let queue = this.queues.get(host);
    if (!queue) {
      queue = new PQueue({ concurrency: 1, intervalCap: 1, interval: intervalMs });
      this.queues.set(host, queue);
    }
    return queue;
  }

  /** robots.txt per host, fetched once. A 4xx means "no rules"; a 5xx or network error blocks the host. */
  private robotsFor(url: string): Promise<Robots | null> {
    const { origin, host } = new URL(url);
    let pending = this.robots.get(host);
    if (!pending) {
      const robotsUrl = `${origin}/robots.txt`;
      pending = this.enqueue(url, async () => {
        try {
          const res = await fetch(robotsUrl, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'User-Agent': this.userAgent },
          });
          if (res.status >= 400 && res.status < 500) {
            await res.body?.cancel();
            return null;
          }
          if (!res.ok) {
            await res.body?.cancel();
            return robotsParser(robotsUrl, 'User-agent: *\nDisallow: /');
          }
          return robotsParser(robotsUrl, await readCapped(res));
        } catch {
          return robotsParser(robotsUrl, 'User-agent: *\nDisallow: /');
        }
      }).then((robots) => {
        const delay = robots?.getCrawlDelay(BOT_NAME);
        if (delay && delay * 1000 > MIN_INTERVAL_MS) {
          // Replace the host queue with a slower one; it is idle at this point.
          this.queues.set(host.toLowerCase(), new PQueue({
            concurrency: 1,
            intervalCap: 1,
            interval: Math.min(delay * 1000, MAX_INTERVAL_MS),
          }));
        }
        return robots;
      });
      this.robots.set(host, pending);
    }
    return pending;
  }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    return cause?.code ? `${err.message} (${cause.code})` : err.message;
  }
  return String(err);
}
