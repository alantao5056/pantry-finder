# Crawler

Keeps pantry data current by reading pantries' own websites
(design: [`docs/crawler-design.md`](../../docs/crawler-design.md)). Run by hand,
against one environment at a time; develop and validate on `dev01` before any
`prod` run.

Phase M2 covers **single-pantry sites**: pantries whose website no other pantry
uses (hosts shared by several pantries are food-bank listings, M4), excluding
Facebook/Instagram.

Options go after a bare `--` (`npm run crawl:dev01 -- --limit 5 --apply`).
Without `--apply` nothing is written — but fetches and **LLM calls are real**
(they cost money), and the run prints what it would have done.

## Setup

```sh
cp tools/crawler/.env.example tools/crawler/.env.dev01   # likewise .env.dev02 / .env.prod
# edit: Firebase service account, DEEPSEEK_API_KEY, CRAWLER_CONTACT, REDIS_URL
```

`REDIS_URL` points at the Redis the environment's API caches in. After each
automatic update the crawler deletes the API's cached copies of that pantry
(detail page and city list), so the site shows the change at once; without it
the site catches up when the cache expires (24h / 48h). Prod Redis listens on
the VPS loopback only, so a prod run needs an SSH tunnel
(`ssh -N -L 6380:127.0.0.1:6379 <user>@<prod-host>`, then
`REDIS_URL=redis://127.0.0.1:6380`). The run says at startup whether Redis is
reachable; if not, it carries on without clearing.

Locally the API usually runs without Redis (empty `REDIS_URL`), caching
in-process where the crawler can't reach; leave `REDIS_URL` unset here and use
**Clear cache** on a change in the admin change log (or restart the API) to
see a crawled update on the local site.

`.env.*` files are git-ignored; `.env.example` is tracked (add it with
`git add -f`, since the root `.gitignore` matches `.env.*`).

Before the first run on an environment, deploy the composite indexes the admin
change log uses: `npm run deploy-indexes:dev01 -- --apply` from `tools/firestore`.

## Crawl

From `tools/crawler`:

```sh
npm run crawl:dev01                          # dry run on the 100 least recently crawled pantries
npm run crawl:dev01 -- --limit 5 --apply     # 5 of them, writing results
npm run crawl:dev01 -- --pantry <pantryId>   # one pantry (any site)
```

Each run takes the `--limit` (default 100) eligible pantries with the oldest
`lastCrawledAt` (never-crawled first, then by id), so repeated `--apply` runs
rotate through every site. `lastCrawledAt` is stamped on every visit in
`--apply` mode — whatever the outcome (pending review, failed fetch, …) — so
dead sites go to the back of the line. Dry runs stamp nothing and pick the
same pantries each time.

Other options: `--concurrency N` (pantries in parallel, default 8; each host
still gets at most one request per second).

What a run does per pantry:

1. Fetches the homepage (robots.txt obeyed, User-Agent
   `PantryFinderBot/1.0 (+CRAWLER_CONTACT)`). A page that looks client-rendered
   (almost no text) is flagged `needsBrowser` in `crawl_sources` and skipped.
2. **Targets without a mapping** (phone, email, contact name, about, notes,
   pantry hours, each service's hours): fetches up to 5 likely same-site pages
   (hours/contact/about…), asks the LLM where each value is, and files one
   `new_mapping` review item with up to 3 candidate regions per target. Not
   repeated while that review is pending, nor while the pages are unchanged.
   The same call reports the addresses and phone numbers the site states; the
   item records whether one matches the pantry's (`address.ts`, `phone.ts`),
   shown as badges in the admin.
3. **Confirmed mappings**: re-reads the region (CSS selector, falling back to
   the heading text above it). Unchanged text is skipped outright; changed text
   is parsed from the extraction cache or by the LLM and applied to the pantry
   with a `pantry_changes` entry — unless a guardrail trips (hours emptied,
   closure wording, LLM unsure, mapping reverted before), which files a
   `suspicious_value` review item instead. A region that can't be found marks
   the mapping `broken` (handled in M3).
4. A homepage that redirects to another site files a `suspicious_value` item
   for `website`; the website is never changed automatically.

Each `--apply` run is recorded in `crawl_runs` (admin → Crawler) with counts,
and recent errors. Ctrl+C saves progress and marks the run `aborted`; the
pantries it didn't reach are first in line for the next run.

Review items, the change log (with per-change and per-run revert) and the tier
comparison live in the admin site.

## Starting runs from the admin (worker)

The admin's **Crawler** page can start the same runs: dry run or apply, a
number of pantries (default 100) or one pantry ID, and stop a run in progress.
The API only queues the run (`crawl_runs` doc with status `queued`); the
**worker** — a long-running process — picks it up, crawls, and streams the log
into `crawl_runs/{id}/log`, which the page shows under **Log**.

```sh
npm run worker:dev01     # local: executes runs queued from a local admin against dev01
```

In prod the worker is the `pantry-finder-crawler` systemd service
(`npm run start:worker`, i.e. `node --env-file=.env.production dist/worker.js`
in `tools/crawler`; the deploy writes `.env.production` from GitHub secrets
and restarts the service). Redis is on the same host, so the API cache is
cleared without a tunnel.

- One run at a time: the admin refuses to start another while one is queued or
  running (CLI runs count too).
- **Stop** lets the pantries in progress finish, then marks the run `aborted`.
- The worker refreshes `heartbeatAt` every 30 s. A running run without a
  heartbeat for 2 minutes shows as **stale** in the admin; starting a new run
  (or restarting the worker) marks it `failed`.
- Stopping or restarting the worker (e.g. a deploy) marks its current run
  `aborted`; the pantries it didn't reach are first in line next time.
- Dry runs from the admin are recorded in `crawl_runs` (mode `dry-run`) so
  their log can be read; CLI dry runs still record nothing.

## LLM tier comparison

```sh
npm run compare-tiers:dev01 -- --sample 50           # dry run: calls both models, prints token totals
npm run compare-tiers:dev01 -- --sample 50 --apply   # stores results in llm_evals
```

Runs first-visit proposals for a random sample through `DEEPSEEK_MODEL_FLASH`
and `DEEPSEEK_MODEL_PRO`. Grade them blind in the admin (**LLM eval**), then
set `DEEPSEEK_MODEL`. Touches no pantry data.

DeepSeek prices double Mon–Fri 01:00–04:00 and 06:00–10:00 UTC; both scripts
warn when started then.

## Debugging

```sh
npm run inspect -- https://example.org
```

Fetches one URL the way the crawler does (no Firestore, no LLM) and prints its
text blocks, their selectors and headings, and the extra pages it would follow.

`npm run typecheck` type-checks the tool (tsx runs it without checking).
`npm run build` compiles it to `dist/` for the worker service (part of the
root `npm run build`).
