<script setup lang="ts">
import { CONTACT_CATEGORY_LABELS } from '@pantry-finder/shared'
import type { ContactMessageStatus, ContactMessageSummary, ListContactMessagesResponse } from '@pantry-finder/shared'
import type { TableColumn } from '@nuxt/ui'

// `contact_messages`: Contact Us messages from signed-in users, newest first.
const api = useApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const tabs = [
  { label: 'Unread', value: 'new' },
  { label: 'All', value: 'all' },
]

const filter = computed<'new' | 'all'>({
  get: () => (route.query.status === 'all' ? 'all' : 'new'),
  set: (value) => router.replace({ query: { status: value } }),
})
const statusQuery = computed(() => (filter.value === 'all' ? undefined : filter.value))

const messages = ref<ContactMessageSummary[]>([])
const nextCursor = ref<string | undefined>()
const loadingMore = ref(false)

const { pending, error, refresh } = await useAsyncData(
  'contact-messages',
  async () => {
    const res = await api<ListContactMessagesResponse>('/admin/contact-messages', {
      query: { status: statusQuery.value },
    })
    messages.value = res.messages
    nextCursor.value = res.nextCursor
    return true
  },
  { watch: [filter] },
)

const loadMore = async () => {
  loadingMore.value = true
  try {
    const res = await api<ListContactMessagesResponse>('/admin/contact-messages', {
      query: { status: statusQuery.value, cursor: nextCursor.value },
    })
    messages.value.push(...res.messages)
    nextCursor.value = res.nextCursor
  } catch (err) {
    toast.add({ title: 'Load failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    loadingMore.value = false
  }
}

const expanded = ref(new Set<string>())
const toggleExpanded = (id: string) => {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
}

const updating = ref<string | null>(null)
const setStatus = async (m: ContactMessageSummary, status: ContactMessageStatus) => {
  updating.value = m.id
  try {
    await api(`/admin/contact-messages/${m.id}`, { method: 'PATCH', body: { status } })
    if (filter.value === 'new' && status === 'read') {
      messages.value = messages.value.filter((x) => x.id !== m.id)
    } else {
      messages.value = messages.value.map((x) => (x.id === m.id ? { ...x, status } : x))
    }
  } catch (err) {
    toast.add({ title: 'Update failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    updating.value = null
  }
}

const deleteTarget = ref<ContactMessageSummary | null>(null)
const deleteOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (value) => { if (!value) deleteTarget.value = null },
})
const deleting = ref(false)
const remove = async () => {
  const target = deleteTarget.value
  if (!target) return
  deleting.value = true
  try {
    await api(`/admin/contact-messages/${target.id}`, { method: 'DELETE' })
    messages.value = messages.value.filter((x) => x.id !== target.id)
    deleteTarget.value = null
    toast.add({ title: 'Message deleted', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Delete failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    deleting.value = false
  }
}

const replyHref = (m: ContactMessageSummary) =>
  `mailto:${m.userEmail}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`

const columns: TableColumn<ContactMessageSummary>[] = [
  { accessorKey: 'createdAt', header: 'When' },
  { accessorKey: 'userEmail', header: 'From' },
  { accessorKey: 'message', header: 'Message' },
  { id: 'actions', header: '' },
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Messages</h1>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
    </div>

    <UTabs v-model="filter" :items="tabs" :content="false" />

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UTable :data="messages" :columns="columns" :loading="pending" empty="No messages.">
        <template #createdAt-cell="{ row }">
          <div class="whitespace-nowrap">{{ formatDateTime(row.original.createdAt) }}</div>
          <UBadge v-if="row.original.status === 'new'" label="New" color="primary" variant="subtle" size="sm" />
        </template>
        <template #userEmail-cell="{ row }">
          <div class="text-sm">{{ row.original.userName ?? '—' }}</div>
          <div class="text-xs text-(--ui-text-muted)">{{ row.original.userEmail }}</div>
        </template>
        <template #message-cell="{ row }">
          <div class="max-w-md">
            <div class="text-xs text-(--ui-text-muted)">{{ CONTACT_CATEGORY_LABELS[row.original.category] }}</div>
            <div class="font-medium">{{ row.original.subject }}</div>
            <p
              class="text-sm whitespace-pre-wrap break-words cursor-pointer"
              :class="{ 'line-clamp-2': !expanded.has(row.original.id) }"
              @click="toggleExpanded(row.original.id)"
            >{{ row.original.message }}</p>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              :label="row.original.status === 'new' ? 'Mark read' : 'Mark unread'"
              size="xs"
              color="neutral"
              variant="outline"
              :loading="updating === row.original.id"
              @click="setStatus(row.original, row.original.status === 'new' ? 'read' : 'new')"
            />
            <UButton
              aria-label="Reply by email"
              icon="i-lucide-reply"
              size="xs"
              color="neutral"
              variant="ghost"
              :to="replyHref(row.original)"
              external
            />
            <UButton
              aria-label="Delete"
              icon="i-lucide-trash-2"
              size="xs"
              color="error"
              variant="ghost"
              @click="deleteTarget = row.original"
            />
          </div>
        </template>
      </UTable>
    </UCard>

    <div v-if="nextCursor" class="flex justify-center">
      <UButton label="Load more" color="neutral" variant="outline" :loading="loadingMore" @click="loadMore" />
    </div>

    <UModal v-model:open="deleteOpen" title="Delete message">
      <template #body>
        <p class="text-sm">Permanently deletes this message from {{ deleteTarget?.userEmail }}.</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="deleteOpen = false" />
          <UButton label="Delete" color="error" :loading="deleting" @click="remove" />
        </div>
      </template>
    </UModal>
  </div>
</template>
