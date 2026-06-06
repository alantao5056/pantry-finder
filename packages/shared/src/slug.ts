// Builds a URL-friendly slug from arbitrary text (lowercase, accents stripped,
// non-alphanumerics collapsed to single hyphens). Shared so the web app's
// canonical pantry URLs and any external tooling (e.g. the sitemap generator)
// produce byte-identical slugs.
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Canonical route param for a pantry: "<slug>-<id>". The Firestore id stays the
// authoritative part — it's a hyphen-free auto-id, so it can always be recovered
// as the segment after the final hyphen.
export function pantrySlugId(pantry: { name: string; id: string }): string {
  const slug = slugify(pantry.name);
  return slug ? `${slug}-${pantry.id}` : pantry.id;
}
