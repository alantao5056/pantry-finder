<script setup lang="ts">
// Opens a pantry for editing by its id.
const input = ref('')

const pantryId = computed(() => input.value.trim())
const valid = computed(() => !!pantryId.value && !/[\s/]/.test(pantryId.value))

const open = () => {
  if (valid.value) void navigateTo(`/pantries/${encodeURIComponent(pantryId.value)}`)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold">Pantries</h1>
    <UCard>
      <form class="flex flex-col gap-3" @submit.prevent="open">
        <UFormField label="Pantry ID">
          <UInput v-model="input" class="w-full" autofocus />
        </UFormField>
        <UButton type="submit" label="Edit pantry" icon="i-lucide-pencil" class="self-start" :disabled="!valid" />
      </form>
    </UCard>
  </div>
</template>
