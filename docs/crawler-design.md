# Pantry Crawler & Admin — Design

Status: agreed design, decided 2026-09-26. M1 implemented (see
[M1 implementation notes](#m1-implementation-notes)); M2–M5 not started.

## Goal

Crawl pantries' own websites and food-bank listing pages to correct existing
pantry data and discover new pantries. Automate as much as possible; anything
uncertain goes to a human in an admin site, and every human decision is
**remembered** so the same question is never asked twice.

## Scope (phase 1)

Facts from the prod backup of 2026-09-20: 17,411 pantries, 3,764 (22%) with a
`website`, spread over 2,826 distinct hosts (2,543 used by a single pantry).

- **In scope:** the 3,764 pantries that have a `website`, plus a seed list of
  food-bank listing pages maintained in the admin. The initial seed list is
  generated from hosts that serve multiple pantries in existing data.
- **Out of scope:** the 13,647 pantries without a website, and the 118
  facebook.com sites (login wall, ToS forbids scraping).
- **Crawl etiquette:** obey robots.txt; User-Agent `PantryFinderBot` with a
  contact address; at most 1 request/second per host.

## Core mechanism: what gets remembered

| Memory | Stored in | Meaning |
|---|---|---|
| Identity mapping | `review_items` resolution → pantry link | "Source record X *is* our pantry Y" (or is new, or is junk — ignore). |
| Field mapping | `field_mappings` | Page URL + CSS selector (with a text-anchor fallback) + row key (for multi-pantry pages) → target field. For schedules, the target names a specific `services[i]` or top-level `schedules`. |
| Extraction cache | `extraction_cache` | Hash of the raw region text → confirmed parsed value. If the raw text is unchanged, the value is reused with no LLM call; if it changes, it is re-parsed. |

How human actions map to memory:

- Human **corrects a parsed value** (right region, wrong parse, e.g.
  "2nd & 4th Tue") → written to `extraction_cache`.
- Human **corrects the region** (wrong place on the page) → `field_mappings`
  selector / text anchor updated.

Locating a region: try the selector first; if it matches nothing, fall back to
the text anchor (e.g. "the block under the *Hours* heading"). If both fail, the
mapping is marked `broken` and goes to review.

For listing pages that contain many pantries, the mapping also stores a
**row key** (normalized address, or name + address) that finds the pantry's row
on the page; fields are then located within that row.

## Automatic vs. human

**Applied to live `pantries` automatically**, with a change-log entry per
field, when the field mapping is already confirmed:
`phone`, `schedules` (top-level or per-service), `aboutUs`, `notes`,
`contactName`, `website`.

**Always routed to human review:**

- new mappings and broken mappings
- new pantries and dedup match candidates
- missing pantries
- changes to `name` or address fields (`address1`, `city`, `state`, `zipCode`) —
  these require re-geocoding and affect the browse index and sitemap
- suspicious values (below)
- user submissions (the existing `pantry_submissions` queue)

**Suspicious-value guardrails** — any of these downgrades an automatic update
to review:

- schedules go from non-empty to empty
- more than half of the operating days change
- phone number fails format validation
- text contains words like *closed*, *permanently*, *cancelled*, *suspended*
- the LLM flags its own parse as uncertain
- every mapping on a site breaks in the same run (likely a redesign, not a data
  change)

**Source precedence:** crawled data wins over the original bulk-imported
data. Each pantry records per-field provenance in
`fieldSources` so a future re-import can respect it.

**Missing pantries:** a pantry absent from its source for **2 consecutive
runs** goes to review. If confirmed closed, the document is moved to
`pantries_archive` (search and browse code stays unchanged; restorable).
Hearted pantries that were archived show as "closed" on the detail page.

**Dedup of discovered pantries:** candidate match when normalized address is
identical, or distance < 100 m and names are similar. Review shows the top 3
existing candidates; the human picks "same as …" or "new".

## Rollback

`pantry_changes` stores old and new values per field. The admin supports:

- reverting a single change
- reverting every change from one crawl run

A reverted mapping is marked `needs_recheck` so the next run does not re-apply
the bad value.

## LLM

- Provider: **DeepSeek**, behind an `Extractor` interface (same pattern as
  `Geocoder`) so the provider can be swapped in one place.
- Used for: (1) proposing field mappings on first visit to a site;
  (2) parsing free-text regions (mainly schedules) into `ScheduleSchema[]`.
- JSON output mode; responses validated with zod.
- Before committing, run a **50-site sample** through both V4.1 Flash and V4
  Pro; the human grades results in the admin and picks the tier.
- Prefer off-peak hours (peak = Mon–Fri 01:00–04:00 and 06:00–10:00 UTC, when
  prices double). The crawler warns when started during peak.
- Rough cost estimate (third-party pricing, verify against the official page):

  | Tier | First full run | Ongoing / month |
  |---|---|---|
  | V4.1 Flash | ~$9 | ~$2 |
  | V4 Pro | ~$36 | ~$7 |

  Assumptions: ~10k input / 1.5k output tokens per pantry on first run;
  afterwards ~10% of regions change weekly and ~2% of mappings break.

## Data model (Firestore)

New collections:

| Collection | One doc per | Key contents |
|---|---|---|
| `crawl_runs` | crawler run | status, start/end, env, counts (fetched, failed, auto-updated, new review items), errors, resume checkpoint |
| `crawl_sources` | URL | `needsBrowser`, robots result, last fetch time / HTTP status, consecutive-miss count |
| `field_mappings` | pantry × field | URL, selector, text anchor, row key, target (field or service index), status `active` / `broken` / `needs_recheck`, confirmedBy / confirmedAt |
| `extraction_cache` | raw-text hash | confirmed parsed value, confirmedBy / confirmedAt |
| `review_items` | review task | `type`: `new_mapping` / `broken_mapping` / `new_pantry` / `match_candidate` / `missing_pantry` / `suspicious_value` / `user_submission`; region raw text, URL, fetch time; proposed value; status |
| `pantry_changes` | changed field | pantryId, runId or reviewer, field, old, new, source, timestamp |
| `pantries_archive` | closed pantry | archived pantry document + closedAt |

Schema changes:

- `PantryDocument`: add `fieldSources` (per field: source + timestamp) and
  `lastCrawledAt`. Also declare the `source` / `pantryId` fields already present
  in prod data but missing from `pantry.schema.ts`.
- `UserDocument`: add `role` (`'admin'` set manually in Firestore; no
  admin-management UI).
- `pantry_submissions`: migrated into, or referenced by, `review_items`.

Review items store only the region's raw text, URL, and fetch time — not full
HTML snapshots. The admin links to the live URL for context.

## Components

**`tools/crawler`** — TypeScript, own `package.json`, same conventions as
`tools/firestore`.

- fetch via undici + cheerio; per-site `needsBrowser` flag switches to
  Playwright only when needed
- p-queue with per-host rate limiting
- env files `.env.dev01` / `.env.dev02` / `.env.prod`
- progress checkpointed in `crawl_runs`; interrupted runs resume
- run **manually** by the maintainer (no cron in phase 1)
- run summary reminds to re-run `tools/sitemap` when pantries were added or
  addresses changed

**`apps/admin`** — Nuxt 4 + Nuxt UI, deployed at `admin.pantryfinder.org`.

- reuses the API `session` cookie (`COOKIE_DOMAIN=pantryfinder.org` already
  covers subdomains)
- third systemd service added to `.github/workflows/deploy.yml`
- pages: crawler status (`crawl_runs`), review queue, change log with rollback,
  seed-list management

**`apps/api`**

- `requireAdmin` middleware
- admin endpoints: review queue (list / resolve), change log + rollback, crawl
  status, seed list
- approving a review item writes to live data **immediately**
- add `https://admin.pantryfinder.org` (and the local admin dev origin) to the
  CORS allowlist in `apps/api/src/index.ts`

**`packages/shared`** — logic used by both the API and the crawler: applying a
mapping result, writing change-log entries, geocoding.

## Review UI (phase 1)

Text-based: show the LLM's candidate regions (raw text, selector, parsed
value) next to the current value; the human picks a candidate or edits the
parsed value. Visual click-to-map on a rendered page snapshot is deferred to M5.

## Environments

Develop and validate entirely on **dev01**, seeded from prod with
`tools/firestore`. Only after a full end-to-end pass on dev01 has been reviewed in
the admin does the maintainer run the crawler against prod — every prod run is
started by hand.

## Milestones

1. **M1** — data model, `role` / `requireAdmin`, `apps/admin` skeleton, crawler
   status page, user-submission review (immediately useful: the submission
   queue currently has no way out).
2. **M2** — single-pantry sites, end to end: fetch → LLM-proposed mapping →
   review → confirm → auto-update → change log → rollback; plus the 50-site
   LLM tier comparison.
3. **M3** — suspicious-value guardrails, broken-mapping handling,
   missing-pantry flow, `pantries_archive`.
4. **M4** — food-bank listing pages, new-pantry discovery, dedup.
5. **M5** — visual click-to-map.

## M1 implementation notes

Decisions made while building M1, on top of the design above:

- **Admin login:** `apps/admin` has its own email/password login page (calls
  the existing `/auth/login`). No Google/Microsoft sign-in, so the OAuth client
  configs are unchanged. Admin accounts must therefore have a password.
- **Rendering:** client-only SPA (`ssr: false`) served by a Node process
  (`pantry-finder-admin` systemd unit, which also sets the prod port; dev
  server on 3002).
  The deploy workflow restarts that unit, so the server (unit, nginx, DNS,
  TLS) must be set up before the first deploy; server config is maintained
  outside this repo.
- **Submissions → queue:** `pantry_submissions` still stores what the user
  sent; `POST /pantries/submissions` now also creates the linked
  `review_items` doc in the same batch. Pre-M1 submissions are queued with
  `tools/firestore` → `npm run backfill-review-items:<env>`.
- **Approving a submission:** the admin edits a prefilled form; existing
  pantries within 100 m are shown as possible duplicates. Approval geocodes the
  address, then in one transaction creates the pantry (via `GeoTransaction`,
  so the `g` geohash is written), a `create` entry in `pantry_changes`, and
  marks both the review item and the submission approved. Fields the admin
  changed are attributed to `admin` in `fieldSources`, the rest to
  `user_submission`. Rejecting requires a reason.
- **Admin API:** `/admin/*`, all behind `requireAdmin` (re-reads
  `users/{email}.role` on every request, uncached). Wire types live in
  `packages/shared/src/admin.ts`.
- **Collections created in M1:** `review_items`, `pantry_changes` (written),
  `crawl_runs` (read only; the crawler writes it in M2). `crawl_sources`,
  `field_mappings`, `extraction_cache` and `pantries_archive` are defined in M2
  / M3 alongside the code that uses them.
- **Index:** `review_items (status ASC, createdAt DESC)` in
  `infra/firestore/firestore.indexes.json` (auto-deployed to prod on merge;
  deploy to dev with `npm run deploy-indexes:<env> -- --apply` from
  `tools/firestore`).
