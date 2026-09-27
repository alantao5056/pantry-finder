/**
 * Recursively drops keys whose value is `undefined`. The Firestore admin SDK
 * rejects `undefined` anywhere in a document (top level OR nested inside
 * arrays such as services/schedules), so optional fields left undefined must be
 * removed before writing.
 */
export function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => pruneUndefined(v)) as unknown as T;
  }
  // Only plain objects: Timestamp / GeoPoint instances must pass through intact.
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out as T;
  }
  return value;
}
