<script setup lang="ts">
import type {
  ApproveSubmissionResponse,
  PantryDraft,
  SubmissionReviewDetail,
} from '@pantry-finder/shared'

// Detail view for a `user_submission` review item.
const props = defineProps<{ id: string }>()
const api = useApi()
const toast = useToast()
const pantryUrl = usePantryUrl()
const id = props.id

const { data: detail, error, refresh } = await useAsyncData(
  `review-${id}`,
  () => api<SubmissionReviewDetail>(`/admin/review-items/${id}/submission`),
)

// Editable working copy of the submitted pantry; reset whenever the detail reloads.
const draft = ref<PantryDraft | null>(null)
watch(detail, (d) => {
  draft.value = d ? JSON.parse(JSON.stringify(d.draft)) : null
}, { immediate: true })

const isPending = computed(() => detail.value?.item.status === 'pending')

type TextField = 'name' | 'address1' | 'address2' | 'city' | 'state' | 'zipCode' | 'phone' | 'email' | 'website' | 'contactName'
const textFields: { key: TextField; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'address1', label: 'Street address', required: true },
  { key: 'address2', label: 'Address line 2' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State (2-letter)', required: true },
  { key: 'zipCode', label: 'ZIP code', required: true },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'contactName', label: 'Contact name' },
]


const approving = ref(false)
const approvedPantryId = ref<string | null>(null)

const approve = async () => {
  if (!draft.value) return
  approving.value = true
  try {
    const res = await api<ApproveSubmissionResponse>(`/admin/review-items/${id}/approve-submission`, {
      method: 'POST',
      body: { draft: draft.value },
    })
    approvedPantryId.value = res.pantryId
    toast.add({ title: 'Pantry created', color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Approve failed', description: apiErrorMessage(err), color: 'error' })
  } finally {
    approving.value = false
  }
}

const rejectOpen = ref(false)
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />

    <template v-if="detail && draft">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold">{{ detail.item.title }}</h1>
        <UBadge :label="detail.item.status" :color="REVIEW_STATUS_COLORS[detail.item.status]" variant="subtle" />
        <span class="text-sm text-(--ui-text-muted)">Submitted {{ formatDateTime(detail.submittedAt) }}</span>
      </div>

      <UAlert
        v-if="approvedPantryId || detail.pantryId"
        color="success"
        variant="subtle"
        title="Pantry created"
        description="Re-run tools/sitemap so the new pantry shows up on the browse-by-city pages."
      >
        <template #actions>
          <UButton
            :to="pantryUrl((approvedPantryId || detail.pantryId)!)"
            target="_blank"
            label="View on site"
            size="xs"
            color="neutral"
            variant="outline"
          />
        </template>
      </UAlert>
      <UAlert
        v-if="detail.rejectionReason"
        color="neutral"
        variant="subtle"
        title="Rejected"
        :description="detail.rejectionReason"
      />

      <div class="grid lg:grid-cols-2 gap-4">
        <UCard>
          <template #header><h2 class="font-semibold">Submitter</h2></template>
          <dl class="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt class="text-(--ui-text-muted)">Name</dt>
            <dd>{{ detail.submitter.firstName }} {{ detail.submitter.lastName }}</dd>
            <dt class="text-(--ui-text-muted)">Email</dt>
            <dd>{{ detail.submitter.email }}</dd>
            <dt class="text-(--ui-text-muted)">Relationship</dt>
            <dd>{{ detail.submitter.relationship }}</dd>
            <dt class="text-(--ui-text-muted)">Account</dt>
            <dd>{{ detail.submitter.accountEmail || 'Not logged in' }}</dd>
          </dl>
        </UCard>

        <UCard>
          <template #header><h2 class="font-semibold">Possible duplicates</h2></template>
          <UAlert
            v-if="!detail.location"
            color="warning"
            variant="subtle"
            title="The submitted address could not be geocoded."
            description="Approving will fail until the address is corrected."
          />
          <p v-else-if="detail.nearby.length === 0" class="text-sm text-(--ui-text-muted)">
            No existing pantry within 100 m.
          </p>
          <ul v-else class="flex flex-col gap-2 text-sm">
            <li v-for="p in detail.nearby" :key="p.id">
              <ULink :to="pantryUrl(p.id)" target="_blank" class="font-medium">{{ p.name }}</ULink>
              <div class="text-(--ui-text-muted)">{{ p.address }} · {{ p.distanceMeters }} m</div>
            </li>
          </ul>
        </UCard>
      </div>

      <UCard>
        <template #header><h2 class="font-semibold">Pantry</h2></template>
        <fieldset :disabled="!isPending" class="flex flex-col gap-4">
          <div class="grid md:grid-cols-3 gap-3">
            <UFormField v-for="f in textFields" :key="f.key" :label="f.label" :required="f.required">
              <UInput v-model="draft[f.key]" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="About">
            <UTextarea v-model="draft.aboutUs" :rows="3" autoresize class="w-full" />
          </UFormField>
          <UFormField label="Notes">
            <UTextarea v-model="draft.notes" :rows="2" autoresize class="w-full" />
          </UFormField>
          <UFormField label="Operating hours (pantry-level)">
            <ScheduleEditor v-model="draft.schedules" />
          </UFormField>
          <UFormField label="Services">
            <ServicesEditor v-model="draft.services" />
          </UFormField>
        </fieldset>
      </UCard>

      <div v-if="isPending" class="flex justify-end gap-2">
        <UButton label="Reject" color="error" variant="outline" @click="rejectOpen = true" />
        <UButton label="Approve & create pantry" :loading="approving" @click="approve" />
      </div>
    </template>

    <RejectItemModal v-model:open="rejectOpen" :item-id="id" title="Reject submission" @rejected="refresh()" />
  </div>
</template>
