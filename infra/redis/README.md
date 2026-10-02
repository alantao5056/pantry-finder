# Redis (API cache)

The API caches geocoding results, the city browse index, pantry/user lookups,
and search rate-limit buckets in a localhost Redis so they survive deploys and
restarts. When `REDIS_URL` is unset the API falls back to in-process caches
(this is the dev default — `npm run dev` needs no Redis).

`deploy.yml` writes `REDIS_URL=redis://127.0.0.1:6379` into the API's
`.env.production`. The steps below are one-time manual host setup; the systemd
units live on the host, not in this repo.

## One-time host setup

1. Install Redis (binds to loopback with protected-mode by default):

   ```sh
   sudo apt install redis-server
   ```

2. Apply the settings from [`pantry-finder.conf`](pantry-finder.conf) (append
   to `/etc/redis/redis.conf` or add as an include), then:

   ```sh
   sudo systemctl restart redis-server
   ```

3. Order the API after Redis with a drop-in (`sudo systemctl edit
   pantry-finder-api`):

   ```ini
   [Unit]
   Wants=redis-server.service
   After=redis-server.service
   ```

   Use `Wants`, not `Requires`: the API fails open (treats Redis errors as
   cache misses and allows rate-limited requests), so Redis being down must
   never block API startup.

## Operations

- Check the Redis service is running:

  ```sh
  sudo systemctl status redis-server
  ```

- Key namespace: everything is under `pf:*` (`pf:geo:*`, `pf:city:*`,
  `pf:pantry:*`, `pf:user:*`, `pf:rl:*`). Rate-limit buckets: search
  `pf:rl:ip:*` / `pf:rl:user:*`, submissions `pf:rl:submit:*`, browse
  endpoints `pf:rl:browse:*`.
- Flush the city browse cache after a pantry data re-import (instead of
  waiting out the 48h TTL or redeploying):

  ```sh
  redis-cli --scan --pattern 'pf:city:*' | xargs -r redis-cli del
  redis-cli --scan --pattern 'pf:pantry:*' | xargs -r redis-cli del
  ```

- Sanity checks: `redis-cli INFO memory` should report
  `maxmemory_policy:allkeys-lru`; `redis-cli --scan --pattern 'pf:*'` lists
  live cache keys.
- Memory usage and entry count:

  ```sh
  # Memory: used vs. the maxmemory cap, plus eviction policy and evicted count
  redis-cli INFO memory | grep -E 'used_memory_human|maxmemory_human|maxmemory_policy'
  redis-cli INFO stats | grep evicted_keys

  # Total keys, and a per-namespace breakdown of the pf:* caches
  redis-cli DBSIZE
  for ns in geo city pantry user rl; do \
    printf 'pf:%s:\t%s\n' "$ns" "$(redis-cli --scan --pattern "pf:$ns:*" | wc -l)"; \
  done

  # Size of a single key (bytes)
  redis-cli MEMORY USAGE <key>
  ```
