# Sitemap generator

Generates `sitemap.xml` for [pantryfinder.org](https://pantryfinder.org), covering the
static routes plus one canonical URL per pantry (`/pantries/<slug>-<id>`). It reads the
pantry list straight from Firestore, so there's no API endpoint to maintain.

The same scan also rebuilds the precomputed **browse index** in Firestore — the
`states/{stateSlug}` and `cities/{stateSlug}_{citySlug}` collections that the API's
`CityService` queries for the `/food-pantries` pages. The API never scans the full
`pantries` collection itself (a ~14k-doc scan per cold start would eat the free-tier
read quota), so this tool is the only writer of that index: until it has run at least
once against an environment, the browse endpoints there return empty/404.

This is a **manual, on-demand** tool. Re-run it when pantry data changes meaningfully
(e.g. a bulk import), then upload the result to the server.

## Setup

```sh
cp tools/sitemap/.env.example tools/sitemap/.env.prod
# edit .env.prod: point FIREBASE_SERVICE_ACCOUNT_PATH at a service-account JSON
# with read access to PROD Firestore and write access to the states/cities
# collections (the browse-index rebuild upserts and deletes docs there)
```

The slug logic is shared with the website via `@pantry-finder/shared`, so the URLs match
the site's canonical URLs exactly. The `generate:*` scripts rebuild
`@pantry-finder/shared` first, so changes to `slugify`/`pantrySlugId` are always picked up.

## Run

From `tools/sitemap`:

```sh
npm run generate:dev                       # uses .env.dev for credentials
npm run generate:prod                      # uses .env.prod for credentials
```

Both rebuild `@pantry-finder/shared` first, then write the sitemap, rebuild the
`states`/`cities` browse index in Firestore (upserting current docs and deleting stale
ones), and refresh `apps/web/app/data/site-stats.json`.

Writes to `tools/sitemap/sitemap.xml` by default (override with `SITEMAP_OUT`).

## Deploy

The generated file is **not** committed to git. Upload it to the web server's static
output directory:

```sh
scp tools/sitemap/sitemap.xml <user>@<host>:<target>/apps/web/.output/public/sitemap.xml
```

It's then served at `https://pantryfinder.org/sitemap.xml`. The deploy workflow
(`.github/workflows/deploy.yml`) uses `appleboy/scp-action`, which is additive (no
`--delete`), so a manually-uploaded `sitemap.xml` survives subsequent deploys.

## Notes

- `<lastmod>` comes from each pantry's `updatedAt` field; pantries without it are listed
  without a `lastmod`.
- Google's per-file limit is 50,000 URLs. With ~1,400 pantries we're far under it. If the
  dataset ever approaches that (e.g. after adding city landing pages), split the output
  into a sitemap index.
