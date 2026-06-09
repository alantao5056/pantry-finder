// Operational request log → Google Cloud Logging.
//
// SERVER-ONLY. This module pulls in `@google-cloud/logging` (a Node dependency)
// and must never be imported from client/browser code. It is intentionally NOT
// re-exported from `index.ts`; consumers import it via the `@pantry-finder/shared/logging`
// subpath so it only ever lands in a server bundle.
//
// Writes are fire-and-forget (see `logRequest`): a slow or failing logging
// backend never blocks or fails the originating request. Logs are best-effort.
import { Logging, type Log } from '@google-cloud/logging';

export interface RequestLogEntry {
  /** Which tier handled the request. */
  source: 'web' | 'api';
  /** Authenticated user id (JWT `sub`), or null for anonymous traffic. */
  user: string | null;
  /** Client IP. For `web` this is the real visitor IP; for `api` it's `req.ip`. */
  ip: string;
  method: string;
  /** Full request URL: path plus query string (e.g. `/pantries?address=x`). */
  url: string;
  /** Final HTTP status code. */
  status: number;
  /** Request duration in milliseconds. */
  durationMs?: number;
  userAgent?: string;
  referer?: string;
}

const LOG_NAME = 'pantry-finder-requests';

// Common crawler/bot User-Agent markers. The UA is self-reported, so this flags
// honest bots (search engines, social unfurlers, headless tooling) but cannot
// catch scrapers that spoof a browser UA — adequate for log triage.
const BOT_UA = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|bingpreview|whatsapp|telegrambot|headless|lighthouse/i;

function isBot(userAgent?: string): boolean {
  return !!userAgent && BOT_UA.test(userAgent);
}

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

// Lazy singleton. `undefined` = not yet initialized; `null` = initialized but
// disabled (no/invalid credentials) so we no-op without retrying or re-warning.
let cachedLog: Log | null | undefined;

function loadServiceAccount(): ServiceAccount | null {
  // A dedicated, logging-only service account (base64-encoded JSON) is the ONLY
  // accepted credential — deliberately not the broad Firebase admin account, so
  // no tier needs more than `logging.logWriter` to write logs. If it's absent,
  // logging is simply disabled (see getLog).
  const json = process.env.LOG_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  try {
    return JSON.parse(Buffer.from(json, 'base64').toString('utf8')) as ServiceAccount;
  } catch (err) {
    console.warn('[logging] failed to parse LOG_SERVICE_ACCOUNT_JSON', err);
    return null;
  }
}

function getLog(): Log | null {
  if (cachedLog !== undefined) return cachedLog;

  const account = loadServiceAccount();
  if (!account?.client_email || !account.private_key || !account.project_id) {
    // Same graceful-degradation as analytics: boot fine locally without creds.
    console.warn('[logging] Cloud Logging disabled — no service account credentials found');
    cachedLog = null;
    return cachedLog;
  }

  const logging = new Logging({
    projectId: account.project_id,
    credentials: {
      client_email: account.client_email,
      private_key: account.private_key,
    },
  });
  cachedLog = logging.log(LOG_NAME);
  return cachedLog;
}

function severityFor(status: number): 'ERROR' | 'WARNING' | 'INFO' {
  if (status >= 500) return 'ERROR';
  if (status >= 400) return 'WARNING'; // includes 429 rate-limit responses
  return 'INFO';
}

// Fire-and-forget: builds the structured entry and writes it without awaiting,
// so logging never adds latency to — or fails — the originating request.
export function logRequest(entry: RequestLogEntry): void {
  const log = getLog();
  if (!log) return;

  const metadata = {
    resource: { type: 'global' as const },
    severity: severityFor(entry.status),
    // Fast filter facets in the Logs Explorer.
    labels: {
      source: entry.source,
      user: entry.user ?? 'anonymous',
      bot: String(isBot(entry.userAgent)),
    },
    // Native HTTP fields → the Logs Explorer renders these specially.
    httpRequest: {
      requestMethod: entry.method,
      requestUrl: entry.url,
      status: entry.status,
      remoteIp: entry.ip,
      ...(entry.userAgent ? { userAgent: entry.userAgent } : {}),
      ...(entry.referer ? { referer: entry.referer } : {}),
    },
  };

  // jsonPayload duplicates the label values so they're full-text searchable.
  // The query string lives in httpRequest.requestUrl, so it's not repeated here.
  const payload = {
    source: entry.source,
    user: entry.user ?? 'anonymous',
    ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
  };

  log.write(log.entry(metadata, payload)).catch((err) => {
    console.error('[logging] write failed', err);
  });
}
