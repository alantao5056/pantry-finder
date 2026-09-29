<script setup lang="ts">
import type { ListChangesResponse, PantryChangeSummary, RevertRunResponse, TargetValue } from '@pantry-finder/shared'
import type { TableColumn } from '@nuxt/ui'

// `pantry_changes`: every write to a live pantry, newest first, with rollback.
// Filter by crawl run (?runId=) or pantry (?pantryId=).
const api = useApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const pantryUrl = usePantryUrl()

const runId = computed(() => (route.query.runId as string) || undefined)
const pantryId = computed(() => (route.query.pantryId as string) || undefined)

const changes = ref<PantryChangeSummary[]>([])
const nextCursor = ref<string | undefined>()
const loadingMore = ref(false)

const { pending, error, refresh } = await useAsyncData(
  'changes',
  async () => {
    const res = await api<ListChangesResponse>('/admin/changes', {
      query: { runId: runId.value, pantryId: pantryId.value },
    })
    changes.value = res.changes
    nextCursor.value = res.nextCursor
    return true
  },
  { watch: [runId, pantryId] },
)

const loadMore = async () => {
  loadingMore.value = true
  try {
    const res = await api<ListChangesResponse>('/admin/changes', {
      query: { runId: runId.value, pantryId: pantryId.value, cursor: nextCursor.value },
    })
    changes.value.push(...res.changes)
    nextCursor.value = res.nextCursor
  } catch (err) {
    toast.add({ title: 'Load failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    loadingMore.value = false
  }
}

const clearFilter = () => router.replace({ query: {} })

const columns: TableColumn<PantryChangeSummary>[] = [
  { accessorKey: 'createdAt', header: 'When' },
  { accessorKey: 'pantryId', header: 'Pantry / field' },
  { accessorKey: 'oldValue', header: 'Old' },
  { accessorKey: 'newValue', header: 'New' },
  { accessorKey: 'actor', header: 'By' },
  { id: 'actions', header: '' },
]

const isRevertable = (c: PantryChangeSummary) => c.kind === 'update' && !!c.target && !c.revertOf && !c.revertedAt

// Admin approvals clear the API's cached copies themselves; this is for changes
// the API didn't make (a local crawler run can't reach its in-memory cache).
const evicting = ref<string | null>(null)
const evictCache = async (id: string) => {
  evicting.value = id
  try {
    await api(`/admin/pantries/${id}/evict-cache`, { method: 'POST' })
    toast.add({ title: 'Cache cleared', description: 'The site now shows the current data.', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Clear cache failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    evicting.value = null
  }
}

const reverting = ref<string | null>(null)
const revert = async (c: PantryChangeSummary) => {
  reverting.value = c.id
  try {
    await api(`/admin/changes/${c.id}/revert`, { method: 'POST' })
    toast.add({ title: 'Change reverted', color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Revert failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    reverting.value = null
  }
}

const revertRunOpen = ref(false)
const revertingRun = ref(false)
const revertRun = async () => {
  revertingRun.value = true
  try {
    const res = await api<RevertRunResponse>(`/admin/crawl-runs/${runId.value}/revert`, { method: 'POST' })
    revertRunOpen.value = false
    toast.add({
      title: `Reverted ${res.reverted} change(s)`,
      description: res.conflicts.length
        ? `${res.conflicts.length} skipped: ${res.conflicts.map((c) => c.reason).join('; ')}`
        : undefined,
      color: res.conflicts.length ? 'warning' : 'success',
    })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Revert failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    revertingRun.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">Change log</h1>
      <div class="flex items-center gap-2">
        <UButton
          v-if="runId"
          label="Revert whole run"
          icon="i-lucide-undo-2"
          color="error"
          variant="outline"
          @click="revertRunOpen = true"
        />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
      </div>
    </div>

    <div v-if="runId || pantryId" class="flex items-center gap-2 text-sm">
      <span class="text-(--ui-text-muted)">Filtered by {{ runId ? `crawl run ${runId}` : `pantry ${pantryId}` }}</span>
      <UButton label="Show all" size="xs" color="neutral" variant="link" @click="clearFilter" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable :data="changes" :columns="columns" :loading="pending" empty="No changes.">
        <template #createdAt-cell="{ row }">
          <div>{{ formatDateTime(row.original.createdAt) }}</div>
          <div class="text-xs text-(--ui-text-muted)">{{ row.original.kind }} · {{ row.original.source }}</div>
        </template>
        <template #pantryId-cell="{ row }">
          <ULink :to="pantryUrl(row.original.pantryId)" target="_blank" class="font-mono text-xs">{{ row.original.pantryId }}</ULink>
          <div class="text-sm">{{ row.original.target ? targetLabel(row.original.target) : row.original.field ?? '—' }}</div>
          <UButton
            v-if="!pantryId"
            label="All changes to this pantry"
            size="xs"
            color="neutral"
            variant="link"
            class="px-0"
            :to="{ path: '/changes', query: { pantryId: row.original.pantryId } }"
          />
          <UButton
            label="Clear cache"
            size="xs"
            color="neutral"
            variant="link"
            class="px-0 ml-2"
            :loading="evicting === row.original.pantryId"
            @click="evictCache(row.original.pantryId)"
          />
        </template>
        <template #oldValue-cell="{ row }">
          <div class="max-w-xs"><TargetValueView :value="row.original.oldValue as TargetValue" /></div>
        </template>
        <template #newValue-cell="{ row }">
          <div class="max-w-xs"><TargetValueView :value="row.original.newValue as TargetValue" /></div>
        </template>
        <template #actor-cell="{ row }">
          <div class="text-sm">{{ row.original.actor }}</div>
          <UButton
            v-if="row.original.runId && !runId"
            label="Run"
            size="xs"
            color="neutral"
            variant="link"
            class="px-0"
            :to="{ path: '/changes', query: { runId: row.original.runId } }"
          />
          <UButton
            v-if="row.original.reviewItemId"
            label="Review"
            size="xs"
            color="neutral"
            variant="link"
            class="px-0 ml-2"
            :to="`/reviews/${row.original.reviewItemId}`"
          />
        </template>
        <template #actions-cell="{ row }">
          <UBadge v-if="row.original.revertedAt" label="Reverted" color="neutral" variant="subtle" />
          <UBadge v-else-if="row.original.revertOf" label="Revert" color="info" variant="subtle" />
          <UButton
            v-else-if="isRevertable(row.original)"
            label="Revert"
            icon="i-lucide-undo-2"
            size="xs"
            color="neutral"
            variant="outline"
            :loading="reverting === row.original.id"
            @click="revert(row.original)"
          />
        </template>
      </UTable>
    </UCard>

    <div v-if="nextCursor" class="flex justify-center">
      <UButton label="Load more" color="neutral" variant="outline" :loading="loadingMore" @click="loadMore" />
    </div>

    <UModal v-model:open="revertRunOpen" title="Revert whole crawl run">
      <template #body>
        <p class="text-sm">
          Every field this run changed goes back to its previous value, newest first. Fields edited again
          since are skipped. The mappings involved are marked for re-check, so the next run sends their
          changes to review instead of re-applying them.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="revertRunOpen = false" />
          <UButton label="Revert run" color="error" :loading="revertingRun" @click="revertRun" />
        </div>
      </template>
    </UModal>
  </div>
</template>
