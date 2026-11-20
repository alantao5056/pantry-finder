<script setup lang="ts">
import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
  CONTACT_MESSAGE_MAX,
  CONTACT_SUBJECT_MAX,
  type ContactCategory,
} from '@pantry-finder/shared'

usePageSeo({
  title: 'Contact PantryFinder',
  description:
    'Send PantryFinder a message about wrong pantry information, updating a pantry you run, or a problem with the website.',
  path: '/contact',
})

const origin = useRequestURL().origin
useHead(() => ({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(buildBreadcrumbJsonLd([
        { name: 'Home', url: `${origin}/` },
        { name: 'Contact' },
      ])),
    },
  ],
}))

const api = useApi()
const { isLoggedIn } = useAuth()
const { show: showAuthModal } = useAuthModal()

const form = reactive({
  category: '' as ContactCategory | '',
  subject: '',
  message: '',
})
const errors = reactive({ category: false, subject: false, message: false })
const submitting = ref(false)
const submitted = ref(false)
const serverError = ref<string | null>(null)

function validate(): boolean {
  errors.category = !form.category
  errors.subject = !form.subject.trim()
  errors.message = !form.message.trim()
  return !errors.category && !errors.subject && !errors.message
}

async function onSubmit() {
  serverError.value = null
  if (!validate()) return

  submitting.value = true
  try {
    await api('/contact', { method: 'POST', body: { ...form } })
    submitted.value = true
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (err: any) {
    if (err?.status === 401) {
      showAuthModal('login')
      serverError.value = 'Please sign in again to send your message.'
    } else {
      serverError.value =
        err?.data?.message ?? err?.data?.error ?? 'Something went wrong sending your message. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}

function sendAnother() {
  form.category = ''
  form.subject = ''
  form.message = ''
  submitted.value = false
}

const notice = computed(() => {
  if (submitted.value) {
    return {
      title: 'Thanks for your message!',
      message: 'We read every message and will reply to your account email if needed.',
      buttonLabel: 'Send another message',
      buttonClass: 'btn-secondary',
      action: sendAnother,
    }
  }
  if (!isLoggedIn.value) {
    return {
      title: 'Sign in to send a message',
      message: 'A free account lets us reply to you and keeps the inbox free of spam.',
      buttonLabel: 'Sign In',
      buttonClass: 'btn-primary',
      action: () => showAuthModal('login'),
    }
  }
  return null
})
</script>

<template>
  <div class="min-h-[calc(100dvh-4rem-1px)] bg-[var(--cream-light)] font-sans">
    <!-- Breadcrumb bar -->
    <div class="crumb-bar">
      <nav class="crumb-row" aria-label="Breadcrumb">
        <NuxtLink to="/" class="crumb-link">Home</NuxtLink>
        <span class="crumb-sep">›</span>
        <span class="crumb-current">Contact</span>
      </nav>
    </div>

    <!-- Header -->
    <div class="bg-white border-b border-[var(--border-soft)]">
      <div class="max-w-[760px] mx-auto px-6 pt-10 pb-8">
        <h1 class="text-[clamp(26px,3.5vw,32px)] font-bold leading-tight mb-2 text-[var(--text-dark)]">
          Contact Us
        </h1>
        <p class="text-[15px] leading-relaxed max-w-[540px] text-[var(--text-mid)]">
          Found wrong information, run a pantry, or have a question about the site? Send us a message.
        </p>
      </div>
    </div>

    <div class="max-w-[760px] mx-auto px-6 pt-8 pb-20">
      <!-- Sent / signed out -->
      <LogoMessage
        v-if="notice"
        class="form-section-card py-12"
        :title="notice.title"
        :message="notice.message"
      >
        <button type="button" class="btn--lg mt-7" :class="notice.buttonClass" @click="notice.action">
          {{ notice.buttonLabel }}
        </button>
      </LogoMessage>

      <!-- Form -->
      <form v-else class="form-section-card" @submit.prevent="onSubmit">
        <div class="mb-[18px]">
          <label class="field-label field-label-required" for="ct-category">Topic</label>
          <select
            id="ct-category"
            v-model="form.category"
            class="form-select"
            :class="{ 'has-error': errors.category }"
            @change="errors.category = false"
          >
            <option value="">Select one…</option>
            <option v-for="c in CONTACT_CATEGORIES" :key="c" :value="c">{{ CONTACT_CATEGORY_LABELS[c] }}</option>
          </select>
          <p v-if="errors.category" class="field-error">Please select a topic.</p>
        </div>

        <div class="mb-[18px]">
          <label class="field-label field-label-required" for="ct-subject">Subject</label>
          <input
            id="ct-subject"
            v-model="form.subject"
            type="text"
            :maxlength="CONTACT_SUBJECT_MAX"
            class="form-input"
            :class="{ 'has-error': errors.subject }"
            @input="errors.subject = false"
          />
          <p v-if="errors.subject" class="field-error">Subject is required.</p>
        </div>

        <div class="mb-[18px]">
          <label class="field-label field-label-required" for="ct-message">Message</label>
          <textarea
            id="ct-message"
            v-model="form.message"
            rows="7"
            :maxlength="CONTACT_MESSAGE_MAX"
            class="form-textarea"
            :class="{ 'has-error': errors.message }"
            placeholder="If it's about a specific pantry, include its name and address."
            @input="errors.message = false"
          />
          <div class="flex justify-between gap-4">
            <p v-if="errors.message" class="field-error">Message is required.</p>
            <p class="ml-auto mt-1 text-xs text-[var(--text-soft)]">{{ form.message.length }} / {{ CONTACT_MESSAGE_MAX }}</p>
          </div>
        </div>

        <p v-if="serverError" class="alert-error text-sm rounded-[12px] px-4 py-3 mb-4">{{ serverError }}</p>

        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="submitting"
            class="btn-primary btn--lg disabled:opacity-50 disabled:cursor-not-allowed"
          >{{ submitting ? 'Sending…' : 'Send Message' }}</button>
        </div>
      </form>
    </div>

    <FooterSimple />
  </div>
</template>
