<script setup lang="ts">
// Asks for a reason and rejects a review item (any type).
const props = defineProps<{ itemId: string; title?: string }>()
const emit = defineEmits<{ rejected: [] }>()
const open = defineModel<boolean>('open', { required: true })

const api = useApi()
const toast = useToast()
const reason = ref('')
const rejecting = ref(false)

const reject = async () => {
  rejecting.value = true
  try {
    await api(`/admin/review-items/${props.itemId}/reject`, { method: 'POST', body: { reason: reason.value } })
    open.value = false
    toast.add({ title: 'Rejected', color: 'success' })
    emit('rejected')
  } catch (err) {
    toast.add({ title: 'Reject failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    rejecting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title ?? 'Reject'">
    <template #body>
      <UFormField label="Reason" required>
        <UTextarea v-model="reason" :rows="3" class="w-full" />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton label="Reject" color="error" :disabled="!reason.trim()" :loading="rejecting" @click="reject" />
      </div>
    </template>
  </UModal>
</template>
