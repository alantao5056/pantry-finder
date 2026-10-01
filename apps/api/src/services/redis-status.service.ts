import type { RedisKeyGroup, RedisKeyStatsResponse, RedisStatusResponse } from '@pantry-finder/shared';
import { CACHE_PREFIX } from '@pantry-finder/shared';
import { getRedisClient } from '../cache/redisClient';
import { KEY_PREFIX as RATE_LIMIT_PREFIX } from '../cache/rateLimiter';

const HOUR_MS = 60 * 60 * 1000;

// Every key namespace the API writes (the createCache() call sites plus the
// rate limiter). A cache missing here still shows up, under "Other".
const KEY_GROUPS: { label: string; prefix: string; ttlMs: number | null }[] = [
  { label: 'Geocode: address', prefix: 'pf:geo:addr:', ttlMs: 24 * HOUR_MS },
  { label: 'Geocode: ZIP', prefix: 'pf:geo:zip:', ttlMs: 24 * HOUR_MS },
  { label: 'Geocode: location', prefix: 'pf:geo:loc:', ttlMs: 24 * HOUR_MS },
  { label: 'Pantry detail', prefix: CACHE_PREFIX.pantryById, ttlMs: 24 * HOUR_MS },
  { label: 'City pantries', prefix: CACHE_PREFIX.cityPantries, ttlMs: 48 * HOUR_MS },
  { label: 'State list', prefix: 'pf:city:states:', ttlMs: 48 * HOUR_MS },
  { label: 'Cities by state', prefix: 'pf:city:list:', ttlMs: 48 * HOUR_MS },
  { label: 'City entry', prefix: 'pf:city:entry:', ttlMs: 48 * HOUR_MS },
  { label: 'User profile', prefix: 'pf:user:profile:', ttlMs: HOUR_MS },
  { label: 'Rate-limit buckets', prefix: RATE_LIMIT_PREFIX, ttlMs: null },
];

const SCAN_COUNT = 1000;
// Stops a scan of an unexpectedly large keyspace (~200k keys).
const MAX_SCAN_BATCHES = 200;
// Keys per group measured with MEMORY USAGE to estimate the group's size.
const MEMORY_SAMPLE_SIZE = 20;

/** Parses INFO's `key:value` lines; section headers (`# Memory`) are skipped. */
function parseInfo(raw: string): Record<string, string> {
  const info: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const sep = line.indexOf(':');
    if (sep <= 0 || line.startsWith('#')) continue;
    info[line.slice(0, sep)] = line.slice(sep + 1);
  }
  return info;
}

const num = (value: string | undefined): number => Number(value) || 0;

/** Read-only Redis diagnostics for the admin. Uses the API's shared connection. */
export class RedisStatusService {
  /** Never throws: an unreachable Redis is reported as `connected: false`. */
  public async getStatus(): Promise<RedisStatusResponse> {
    const redis = getRedisClient();
    if (!redis) {
      return { backend: 'in-memory' };
    }

    try {
      const startedAt = Date.now();
      await redis.ping();
      const pingMs = Date.now() - startedAt;
      const info = parseInfo(await redis.info());
      const lastSave = num(info.rdb_last_save_time);

      return {
        backend: 'redis',
        connected: true,
        clientStatus: redis.status,
        pingMs,
        version: info.redis_version ?? '',
        uptimeSeconds: num(info.uptime_in_seconds),
        connectedClients: num(info.connected_clients),
        opsPerSec: num(info.instantaneous_ops_per_sec),
        usedMemoryBytes: num(info.used_memory),
        maxMemoryBytes: num(info.maxmemory),
        maxMemoryPolicy: info.maxmemory_policy ?? '',
        fragmentationRatio: num(info.mem_fragmentation_ratio),
        evictedKeys: num(info.evicted_keys),
        expiredKeys: num(info.expired_keys),
        keyspaceHits: num(info.keyspace_hits),
        keyspaceMisses: num(info.keyspace_misses),
        // `db0:keys=123,expires=120,avg_ttl=…`; the line is absent for an empty db.
        totalKeys: num(/keys=(\d+)/.exec(info.db0 ?? '')?.[1]),
        lastSaveAt: lastSave ? new Date(lastSave * 1000).toISOString() : undefined,
        lastSaveOk: info.rdb_last_bgsave_status === 'ok',
      };
    } catch (err) {
      return {
        backend: 'redis',
        connected: false,
        clientStatus: redis.status,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Key count and estimated memory per cache, from one SCAN pass over the
   * keyspace (never KEYS, which blocks Redis). Throws when Redis is unreachable.
   */
  public async getKeyStats(): Promise<RedisKeyStatsResponse> {
    const redis = getRedisClient();
    if (!redis) {
      return { groups: [], scanned: 0, truncated: false };
    }

    const groups: RedisKeyGroup[] = [
      ...KEY_GROUPS.map((g) => ({ ...g, count: 0, approxBytes: 0 })),
      { label: 'Other', prefix: '', ttlMs: null, count: 0, approxBytes: 0 },
    ];
    const samples: string[][] = groups.map(() => []);
    const otherIndex = groups.length - 1;

    let cursor = '0';
    let scanned = 0;
    let batches = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'COUNT', SCAN_COUNT);
      cursor = next;
      batches++;
      for (const key of keys) {
        const found = KEY_GROUPS.findIndex((g) => key.startsWith(g.prefix));
        const index = found === -1 ? otherIndex : found;
        groups[index]!.count++;
        if (samples[index]!.length < MEMORY_SAMPLE_SIZE) samples[index]!.push(key);
      }
      scanned += keys.length;
    } while (cursor !== '0' && batches < MAX_SCAN_BATCHES);

    const sampleKeys = samples.flat();
    if (sampleKeys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of sampleKeys) pipeline.memory('USAGE', key);
      const results = (await pipeline.exec()) ?? [];

      let offset = 0;
      samples.forEach((sample, index) => {
        // A sampled key can expire before it is measured (null result).
        const sizes = results
          .slice(offset, offset + sample.length)
          .map(([, bytes]) => Number(bytes))
          .filter((bytes) => bytes > 0);
        offset += sample.length;
        if (sizes.length > 0) {
          const average = sizes.reduce((sum, bytes) => sum + bytes, 0) / sizes.length;
          groups[index]!.approxBytes = Math.round(average * groups[index]!.count);
        }
      });
    }

    return { groups, scanned, truncated: cursor !== '0' };
  }
}
