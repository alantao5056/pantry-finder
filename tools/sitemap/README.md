# Sitemap generator

Generates `sitemap.xml` for [pantryfinder.org](https://pantryfinder.org), covering the
static routes plus one canonical URL per pantry (`/pantries/<slug>-<id>`). It reads the
pantry list straight from Firestore, so there's no API endpoint to maintain.

This is a **manual, on-demand** tool. Re-run it when pantry data changes meaningfully
(e.g. a bulk import), then upload the result to the server.

## Setup

```sh
cp tools/sitemap/.env.example tools/sitemap/.env
# edit .env: point FIREBASE_SERVICE_ACCOUNT_PATH at a service-account JSON
# with read access to PROD Firestore
```

The slug logic is shared with the website via `@pantry-finder/shared`, so the URLs match
the site's canonical URLs exactly. `npm run sitemap` rebuilds `@pantry-finder/shared`
first, so changes to `slugify`/`pantrySlugId` are always picked up.

## Run

From the repo root:

```sh
npm run sitemap                       # uses .env for credentials
npm run sitemap -- ./service-account.json   # or pass the JSON path explicitly
```

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
