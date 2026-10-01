<script setup lang="ts">
import type { RedisKeyGroup, RedisKeyStatsResponse, RedisStatusResponse } from '@pantry-finder/shared'
import type { TableColumn } from '@nuxt/ui'

// Read-only view of the API's Redis (caches + rate limiter): server health from
// PING/INFO, and per-cache key counts from a SCAN that only runs on request.
const api = useApi()
const toast = useToast()

const { data, pending, error, refresh } = await useAsyncData(
  'redis-status',
  () => api<RedisStatusResponse>('/admin/redis'),
)

const server = computed(() => (data.value?.backend === 'redis' && data.value.connected ? data.value : null))
const down = computed(() => (data.value?.backend === 'redis' && !data.value.connected ? data.value : null))

const memoryPercent = computed(() => {
  const s = server.value
  return s && s.maxMemoryBytes > 0 ? Math.round((s.usedMemoryBytes / s.maxMemoryBytes) * 100) : null
})

type Row = { label: string; value: string; warn?: boolean }

const cards = computed<{ title: string; rows: Row[]; progress?: number }[]>(() => {
  const s = server.value
  if (!s) return []
  const lookups = s.keyspaceHits + s.keyspaceMisses
  return [
    {
      title: 'Connection',
      rows: [
        { label: 'Status', value: s.clientStatus },
        { label: 'Ping', value: `${s.pingMs} ms` },
        { label: 'Redis version', value: s.version },
        { label: 'Uptime', value: formatDuration(s.uptimeSeconds) },
        { label: 'Clients', value: String(s.connectedClients) },
        { label: 'Commands / sec', value: String(s.opsPerSec) },
      ],
    },
    {
      title: 'Memory',
      progress: memoryPercent.value ?? undefined,
      rows: [
        { label: 'Used', value: formatBytes(s.usedMemoryBytes) },
        {
          label: 'Limit',
          value: s.maxMemoryBytes > 0 ? `${formatBytes(s.maxMemoryBytes)} (${memoryPercent.value}% used)` : 'none',
        },
        { label: 'Eviction policy', value: s.maxMemoryPolicy },
        { label: 'Fragmentation ratio', value: s.fragmentationRatio.toFixed(2) },
      ],
    },
    {
      title: 'Cache health',
      rows: [
        { label: 'Keys', value: s.totalKeys.toLocaleString() },
        {
          label: 'Hit rate (all caches)',
          value: lookups > 0 ? `${((s.keyspaceHits / lookups) * 100).toFixed(1)}%` : '—',
        },
        { label: 'Evicted keys', value: s.evictedKeys.toLocaleString(), warn: s.evictedKeys > 0 },
        { label: 'Expired keys', value: s.expiredKeys.toLocaleString() },
      ],
    },
    {
      title: 'Persistence',
      rows: [
        { label: 'Last snapshot', value: formatDateTime(s.lastSaveAt) },
        { label: 'Last snapshot status', value: s.lastSaveOk ? 'ok' : 'failed', warn: !s.lastSaveOk },
      ],
    },
  ]
})

// ---- keys per cache ----

const columns: TableColumn<RedisKeyGroup>[] = [
  { accessorKey: 'label', header: 'Cache' },
  { accessorKey: 'prefix', header: 'Prefix' },
  { accessorKey: 'ttlMs', header: 'TTL' },
  { accessorKey: 'count', header: 'Keys' },
  { accessorKey: 'approxBytes', header: '≈ Memory' },
]

const keys = ref<RedisKeyStatsResponse | null>(null)
const scanning = ref(false)

const scan = async () => {
  scanning.value = true
  try {
    keys.value = await api<RedisKeyStatsResponse>('/admin/redis/keys')
  } catch (err) {
    toast.add({ title: 'Could not scan the keys', description: apiErrorMessage(err), color: 'error' })
  } finally {
    scanning.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Redis</h1>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <UAlert
      v-else-if="data?.backend === 'in-memory'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Redis is not in use"
      description="REDIS_URL is not set for this API, so its caches and rate limits live in process memory and reset on restart."
    />

    <UAlert
      v-else-if="down"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Redis is unreachable"
      :description="`Connection status: ${down.clientStatus}. ${down.error}. The API keeps serving without its caches or rate limits.`"
    />

    <template v-if="server">
      <div class="grid gap-4 sm:grid-cols-2">
        <UCard v-for="card in cards" :key="card.title">
          <template #header>
            <h2 class="font-medium">{{ card.title }}</h2>
          </template>
          <UProgress
            v-if="card.progress !== undefined"
            :model-value="card.progress"
            :color="card.progress >= 90 ? 'warning' : 'primary'"
            class="mb-3"
          />
          <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <template v-for="row in card.rows" :key="row.label">
              <dt class="text-(--ui-text-muted)">{{ row.label }}</dt>
              <dd :class="{ 'text-(--ui-warning)': row.warn }">{{ row.value }}</dd>
            </template>
          </dl>
        </UCard>
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-medium">
              Keys per cache
              <span v-if="keys" class="text-sm font-normal text-(--ui-text-muted)">
                ({{ keys.scanned.toLocaleString() }} scanned)
              </span>
            </h2>
            <UButton
              :label="keys ? 'Scan again' : 'Scan keys'"
              icon="i-lucide-scan-search"
              color="neutral"
              variant="outline"
              size="xs"
              :loading="scanning"
              @click="scan"
            />
          </div>
        </template>
        <p v-if="!keys" class="p-4 text-sm text-(--ui-text-muted)">
          Counting walks the whole keyspace, so it only runs when you ask.
        </p>
        <template v-else>
          <UAlert
            v-if="keys.truncated"
            color="warning"
            variant="subtle"
            class="m-4"
            title="The scan stopped at its key cap; the real counts are higher."
          />
          <UTable :data="keys.groups" :columns="columns">
            <template #prefix-cell="{ row }">
              <code v-if="row.original.prefix" class="text-xs">{{ row.original.prefix }}</code>
              <span v-else class="text-(--ui-text-dimmed)">—</span>
            </template>
            <template #ttlMs-cell="{ row }">
              {{ row.original.ttlMs === null ? '—' : formatDuration(row.original.ttlMs / 1000) }}
            </template>
            <template #count-cell="{ row }">
              {{ row.original.count.toLocaleString() }}
            </template>
            <template #approxBytes-cell="{ row }">
              {{ row.original.count === 0 ? '—' : formatBytes(row.original.approxBytes) }}
            </template>
          </UTable>
        </template>
      </UCard>
    </template>
  </div>
</template>
