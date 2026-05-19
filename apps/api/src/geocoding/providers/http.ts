export type FetchJsonOptions = {
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
  headers?: Record<string, string>;
};

export async function fetchJsonWithRetry<T>(
  url: string,
  opts: FetchJsonOptions
): Promise<T> {
  let attempt = 0;
  let lastErr: any;

  while (attempt <= opts.maxRetries) {
    try {
      return await fetchJsonOnce<T>(url, opts.timeoutMs, opts.headers);
    } catch (err: any) {
      lastErr = err;

      const status = err?.status as number | undefined;
      const retriable =
        status === undefined || status === 429 || (status >= 500 && status <= 599);

      if (!retriable || attempt === opts.maxRetries) break;

      const delay = jitterDelay(opts.baseDelayMs * Math.pow(2, attempt));
      await sleep(delay);
      attempt++;
    }
  }

  throw lastErr;
}

async function fetchJsonOnce<T>(
  url: string,
  timeoutMs: number,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "Accept": "application/json", ...extraHeaders },
    });

    const text = await resp.text();

    if (!resp.ok) {
      const e: any = new Error(`Upstream request failed: ${resp.status}`);
      e.status = resp.status;
      e.bodySnippet = text.slice(0, 300);
      throw e;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      const e: any = new Error("Upstream returned non-JSON response.");
      e.status = resp.status;
      e.bodySnippet = text.slice(0, 300);
      throw e;
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      const e: any = new Error(`Request timed out after ${timeoutMs}ms.`);
      e.status = undefined;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitterDelay(ms: number): number {
  const jitter = 0.2;
  const delta = ms * jitter;
  return Math.max(0, Math.round(ms - delta + Math.random() * 2 * delta));
}
