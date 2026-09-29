<script setup lang="ts">
// Confirms deleting a pending crawler review item, so the crawler processes
// the pantry afresh. Returns to the review queue afterwards.
const props = defineProps<{ itemId: string }>()
const open = defineModel<boolean>('open', { required: true })

const api = useApi()
const toast = useToast()
const deleting = ref(false)

const remove = async () => {
  deleting.value = true
  try {
    await api(`/admin/review-items/${props.itemId}`, { method: 'DELETE' })
    open.value = false
    toast.add({ title: 'Review deleted', color: 'success' })
    await navigateTo('/reviews')
  } catch (err) {
    toast.add({ title: 'Delete failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Delete review">
    <template #body>
      <p class="text-sm">
        Deletes this review and clears the crawler's memory of it. The pantry is crawled again first on the next run,
        which may create a new review. Unlike Reject, nothing is recorded.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton label="Delete" color="error" :loading="deleting" @click="remove" />
      </div>
    </template>
  </UModal>
</template>
