# Firestore ops

Manual, on-demand operations against the PantryFinder Firestore databases,
run from your machine against one environment at a time:

- **Backup / import** — dump and restore whole databases (below)
- **Deploying indexes** — push `infra/firestore/firestore.indexes.json` to an environment
- **One-off migrations** — timestamp and review-item backfills

Options go after a bare `--` (`npm run deploy-indexes:dev01 -- --apply`).
Without it npm swallows them (`--apply` never reaches the script, which just
dry-runs again); dry runs print the exact command to apply.

Backup dumps **every top-level collection** (discovered via `listCollections()`,
nothing hardcoded) into a timestamped folder; import restores a backup folder
into the chosen environment, optionally as an exact mirror.

## Setup

There are three environments: `dev01`, `dev02`, and `prod`, each with its own
env file:

```sh
cp tools/firestore/.env.example tools/firestore/.env.dev01
cp tools/firestore/.env.example tools/firestore/.env.dev02
cp tools/firestore/.env.example tools/firestore/.env.prod
# edit each: point FIREBASE_SERVICE_ACCOUNT_PATH at the service-account JSON
# for that environment (or set base64 FIREBASE_SERVICE_ACCOUNT_JSON)
```

## Backup

From `tools/firestore`:

```sh
npm run backup:dev01   # dev01 Firestore -> backups/dev01/<YYYY-MM-DD_HHmmss>/
npm run backup:dev02   # dev02 Firestore -> backups/dev02/<YYYY-MM-DD_HHmmss>/
npm run backup:prod    # prod Firestore  -> backups/prod/<YYYY-MM-DD_HHmmss>/
```

Each run creates a fresh folder (date + time, never collides) containing one
`<collection>.jsonl` per collection, a `manifest.json` (source env, project ID,
timestamp, per-collection doc counts), and a `firestore.indexes.json` snapshot
of the source database's composite indexes (exported with firebase-tools, same
shape as `infra/firestore/firestore.indexes.json`) so the backup is
self-contained. The `backups/` tree is git-ignored.

## Import

From `tools/firestore`:

```sh
# upsert everything in a prod backup into dev01
npm run import:dev01 -- ./backups/prod/2026-07-07_143005

# only some collections, as an exact mirror (deletes extra target docs)
npm run import:prod -- ./backups/prod/2026-07-07_143005 --collections pantries,users --replace

# non-interactive
npm run import:dev02 -- ./backups/dev02/2026-07-07_143005 --yes
```

- **Indexes deploy first**: if the backup contains `firestore.indexes.json`,
  its composite indexes are deployed to the target project before any data is
  written (additive — firebase-tools without `--force` never deletes existing
  indexes, matching `.github/workflows/firestore-indexes.yml`). Restoring into
  a brand-new database therefore also sets up the indexes its queries need.
  Older backups without the snapshot just skip this step.
- Default mode is **upsert**: same-ID docs are overwritten, target docs missing
  from the backup are kept.
- `--replace` makes the target an exact mirror of the backup: after upserting,
  any target doc whose ID isn't in the backup is deleted (via `listDocuments()`,
  which doesn't consume document reads).
- `--collections a,b` limits the import; names must exist in the backup folder.
- Before writing, the script prints the target project, mode, and collection
  counts, warns loudly on cross-environment imports (e.g. prod backup → dev01),
  and asks for a typed `yes` unless `--yes` is passed.

## Timestamp backfill (one-off migration)

`search_logs.searchedAt` and `pantry_submissions.createdAt` were originally
written as ISO strings instead of Firestore `Timestamp`s. The schemas now
declare `Timestamp`, so existing documents need converting — Firestore orders
by type *before* value, so strings and Timestamps form two disjoint ranges and
an `orderBy`/range query would silently miss one of them.

```sh
# dry run (default): reports what would change, writes nothing
npm run backfill:dev01 -- search_logs searchedAt

# actually convert
npm run backfill:dev01 -- search_logs searchedAt --apply
npm run backfill:dev01 -- pantry_submissions createdAt --apply
```

Only the named field is touched (`update()`, not `set()`), and only when its
current value is a string — so the script is idempotent and a second run is a
no-op. No document is created or deleted. Values that don't parse as dates are
reported and skipped rather than written back as `Invalid Date`.

Take a backup before running with `--apply` against prod. Note that restoring
an older backup reintroduces the string values; just re-run the backfill after.

## Deploying indexes

CI deploys `infra/firestore/firestore.indexes.json` to **prod** when it changes
on `main`. To push the file to a dev project (or to prod ahead of a merge):

```sh
npm run deploy-indexes:dev01              # dry run: shows indexes to add / extra in project
npm run deploy-indexes:dev01 -- --apply   # deploy
npm run deploy-indexes:prod -- --apply    # asks for a typed "yes" (add --yes to skip)
```

Additive only, same as CI: indexes that exist in the project but not in the
file are listed and left alone, never deleted. Deploying only starts the index
build — see *Index backfill takes time* below.

## Review-item backfill (one-off migration)

The admin review queue lists `review_items`; since crawler/admin M1 the submit
endpoint creates one alongside every `pantry_submissions` doc. Submissions made
before that have none and would never appear in the admin. This creates the
missing `review_items` entry for each pending submission:

```sh
npm run backfill-review-items:dev01             # dry run
npm run backfill-review-items:dev01 -- --apply
```

Idempotent (submissions already queued are skipped) and create-only. Run the
timestamp backfill first if any `pantry_submissions.createdAt` is still a
string — such submissions are reported and skipped.

## Backup format

One JSONL file per collection; each line is `{"id": "<docId>", "data": {...}}`.
Firestore-specific values are tagged so import restores the real types
(a `GeoPoint` restored as a plain object would break GeoFirestore radius search):

| Firestore type      | Serialized as                                             |
| ------------------- | --------------------------------------------------------- |
| `Timestamp`         | `{"__fs":"timestamp","seconds":n,"nanoseconds":n}`        |
| `GeoPoint`          | `{"__fs":"geopoint","latitude":n,"longitude":n}`          |
| `DocumentReference` | `{"__fs":"ref","path":"..."}`                             |
| Bytes               | `{"__fs":"bytes","base64":"..."}`                         |

## Notes

- **firebase-tools via npx:** index export/deploy shells out to
  `npx --yes firebase-tools`, authenticated with the same service account
  (`GOOGLE_APPLICATION_CREDENTIALS`) — no `firebase login` needed. The first
  run downloads firebase-tools, so it needs network access to npm.
- **Index backfill takes time:** deploying indexes only starts their build;
  Firestore backfills them in the background (minutes at ~14k docs). Queries
  that need a still-building index fail with `FAILED_PRECONDITION` until it
  finishes — check status in the console's Indexes page.
- **Read quota:** a full backup reads every document (~14k+ reads), roughly a
  third of the Firestore free-tier daily read quota (50k) — same order as a
  sitemap-tool run. Don't run backups in a loop.
- After importing pantry data, re-run the sitemap tool (`tools/sitemap`) so the
  `states`/`cities` browse index matches the new dataset. (A full backup+import
  round-trips those index collections too, but a partial `--collections pantries`
  import leaves them stale.)
- There are no subcollections in this schema; the tool only handles top-level
  collections. If subcollections are ever added, extend backup.ts accordingly.
