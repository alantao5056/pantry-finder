<script setup lang="ts">
import type { ServiceDraft } from '@pantry-finder/shared'

const services = defineModel<ServiceDraft[]>({ required: true })

const addService = () => {
  services.value.push({ name: '', categoryDescription: '', foodOfferings: [], schedules: [] })
}
const removeService = (i: number) => services.value.splice(i, 1)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="(service, i) in services"
      :key="i"
      class="rounded-lg border border-(--ui-border) p-3 flex flex-col gap-3"
    >
      <div class="grid md:grid-cols-3 gap-2">
        <UFormField label="Service name">
          <UInput v-model="service.name" class="w-full" />
        </UFormField>
        <UFormField label="Category">
          <UInput v-model="service.categoryDescription" class="w-full" />
        </UFormField>
        <UFormField label="Program type">
          <UInput v-model="service.foodProgramTypeDescription" class="w-full" />
        </UFormField>
      </div>
      <UFormField label="Food offerings">
        <UInputTags v-model="service.foodOfferings" placeholder="Type and press Enter" class="w-full" />
      </UFormField>
      <UFormField label="Notes">
        <UInput v-model="service.notes" class="w-full" />
      </UFormField>
      <UFormField label="Schedules">
        <ScheduleEditor v-model="service.schedules" />
      </UFormField>
      <UButton
        label="Remove service"
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="sm"
        class="self-end"
        @click="removeService(i)"
      />
    </div>
    <UButton
      label="Add service"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      class="self-start"
      @click="addService"
    />
  </div>
</template>
