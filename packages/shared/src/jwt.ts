// Decodes the `sub` claim from a JWT WITHOUT verifying the signature.
//
// This is intentionally verification-free: it exists only so the web (Nitro)
// tier can attribute a request log entry to a user from the `session` cookie,
// where the signing secret isn't (and shouldn't be) available. Never use this
// for authorization — a forged token would decode to an arbitrary `sub`. For
// logging that's an acceptable, low-stakes trade.
//
// Isomorphic: works in both Node and the browser, no dependencies. (It only
// runs server-side in practice, but stays dep-free so it's safe to re-export
// from the shared package's main entry.)
export function decodeJwtSub(token?: string | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(payload)
        : Buffer.from(payload, 'base64').toString('utf8');
    const claims = JSON.parse(json) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}
