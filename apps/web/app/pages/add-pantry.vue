<script setup lang="ts">
import { US_STATES } from '@pantry-finder/shared'

// ScheduleRow is structurally identical to the type exported by
// ScheduleRowsEditor.vue; redeclared here to avoid a cross-file type import.
interface ScheduleRow {
  weekDay: string
  start: string
  end: string
  notes: string
  everyOtherWeek: boolean
}

interface ServiceRow {
  name: string
  category: string
  program: string
  foods: string[]
  notes: string
  schedules: ScheduleRow[]
}

const api = useApi()
const { user } = useAuth()

usePageSeo({
  title: 'Add a Food Pantry',
  description:
    'Know a food pantry that isn’t listed on PantryFinder yet? Share what you know and our team will review and publish it so more families can find free food near them.',
  path: '/add-pantry',
})

// ── Option lists (mapped to the Firestore pantry schema) ──────────────────
const FOOD_OPTIONS = [
  'Dairy', 'Eggs', 'Fruits & Vegetables', 'Meat',
  'Shelf Stable/Non-Perishable Goods', 'Prepared Food / Grab and Go',
  'Household Products', 'Toiletries / Hygiene Products',
  'Pet Food / Supplies', 'Diapers', 'Bread & Bakery', 'Other',
]

const FOOD_EMOJI: Record<string, string> = {
  'Dairy': '🥛', 'Eggs': '🥚', 'Fruits & Vegetables': '🥦', 'Meat': '🥩',
  'Shelf Stable/Non-Perishable Goods': '🥫', 'Prepared Food / Grab and Go': '🍱',
  'Household Products': '🧹', 'Toiletries / Hygiene Products': '🧴',
  'Pet Food / Supplies': '🐾', 'Diapers': '👶', 'Bread & Bakery': '🍞', 'Other': '📦',
}
const foodEmoji = (f: string) => FOOD_EMOJI[f] ?? '🍽️'

// Categories match the buckets the pantry detail page colour-codes.
const SERVICE_CATEGORIES = [
  'Food Program',
  'Healthcare Screenings/Referrals',
  'Housing Assistance',
  'Tax/Financial Support',
  'Other',
]

// Common service names (datalist hints) + the category each implies, used to
// auto-fill the category when the submitter picks a known service.
const SERVICE_NAME_CATEGORY: Record<string, string> = {
  'Food Distribution': 'Food Program',
  'Hot/Cold Meal Program': 'Food Program',
  'Mobile Pantry': 'Food Program',
  'Senior Box Program': 'Food Program',
  'Healthcare Screenings/Referrals': 'Healthcare Screenings/Referrals',
  'Housing Assistance': 'Housing Assistance',
  'Tax/Financial Support': 'Tax/Financial Support',
  'SNAP Assistance': 'Other',
}
const SERVICE_NAME_OPTIONS = Object.keys(SERVICE_NAME_CATEGORY)

const RELATIONSHIPS = [
  'Pantry Staff / Operator', 'Volunteer', 'Community Member', 'Neighbor / Friend', 'Other',
]

// US state codes for the State field. Shared with the API + browse pages so the
// form can only submit a code that resolves to a real /food-pantries/{state}.
const STATE_CODES = Object.keys(US_STATES).map((c) => c.toUpperCase()).sort()
const STATE_CODE_SET = new Set(STATE_CODES)
const isValidState = (s: string) => STATE_CODE_SET.has(s.trim().toUpperCase())

// ── Form state ────────────────────────────────────────────────────────────
const form = reactive({
  name: '',
  street: '',
  address2: '',
  city: '',
  state: '',
  zipCode: '',
  about: '',
  notes: '',
  phone: '',
  website: '',
  contactName: '',
  firstName: '',
  lastName: '',
  email: '',
  relationship: '',
})

// Pantry-level operating hours (top-level PantryDocument.schedules).
const schedules = ref<ScheduleRow[]>([])

// Services — each with its own foods + schedules (PantryDocument.services).
const newService = (): ServiceRow => ({
  name: '', category: '', program: '', foods: [], notes: '', schedules: [],
})
const services = ref<ServiceRow[]>([])

const addService = () => services.value.push(newService())
const removeService = (i: number) => services.value.splice(i, 1)

function onServiceNameChange(service: ServiceRow) {
  const known = SERVICE_NAME_CATEGORY[service.name.trim()]
  if (known && !service.category) service.category = known
}

function toggleFood(service: ServiceRow, food: string) {
  const i = service.foods.indexOf(food)
  if (i === -1) service.foods.push(food)
  else service.foods.splice(i, 1)
}

// Prefill submitter info for logged-in users (still editable + required).
watchEffect(() => {
  if (!user.value) return
  if (!form.firstName) form.firstName = user.value.firstName ?? ''
  if (!form.lastName) form.lastName = user.value.lastName ?? ''
  if (!form.email) form.email = user.value.email ?? ''
})

// ── Validation ────────────────────────────────────────────────────────────
const REQUIRED = ['name', 'street', 'city', 'state', 'zipCode', 'firstName', 'lastName', 'email', 'relationship'] as const
type RequiredField = (typeof REQUIRED)[number]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const errors = reactive<Record<string, boolean>>({})
const attempted = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const serverError = ref<string | null>(null)

const hasTextErrors = computed(() => Object.values(errors).some(Boolean))

// A schedule row is complete only with a day, open time, and close time.
const scheduleComplete = (r: ScheduleRow) => !!(r.weekDay && r.start && r.end)
const allSchedulesValid = computed(() =>
  schedules.value.every(scheduleComplete) &&
  services.value.every((s) => s.schedules.every(scheduleComplete)),
)
// Every added service must be named.
const allServicesValid = computed(() => services.value.every((s) => s.name.trim() !== ''))

const formInvalid = computed(
  () => attempted.value && (hasTextErrors.value || !allSchedulesValid.value || !allServicesValid.value),
)

function clearError(field: string) {
  if (errors[field]) errors[field] = false
}

function validate(): boolean {
  attempted.value = true
  for (const f of REQUIRED) {
    errors[f] = form[f as RequiredField].trim() === ''
  }
  if (!errors.email && !EMAIL_RE.test(form.email.trim())) errors.email = true
  if (!errors.state && !isValidState(form.state)) errors.state = true
  return !hasTextErrors.value && allSchedulesValid.value && allServicesValid.value
}

// ── Submit ────────────────────────────────────────────────────────────────
async function onSubmit() {
  serverError.value = null
  if (!validate()) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  submitting.value = true
  try {
    await api('/pantries/submissions', {
      method: 'POST',
      body: {
        name: form.name,
        street: form.street,
        address2: form.address2,
        city: form.city,
        state: form.state,
        zipCode: form.zipCode,
        about: form.about,
        notes: form.notes,
        phone: form.phone,
        website: form.website,
        contactName: form.contactName,
        schedules: schedules.value,
        services: services.value.map((s) => ({
          name: s.name,
          category: s.category,
          program: s.program,
          foods: s.foods,
          notes: s.notes,
          schedules: s.schedules,
        })),
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        relationship: form.relationship,
      },
    })
    submitted.value = true
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (err: any) {
    serverError.value =
      err?.data?.message ?? err?.data?.error ?? 'Something went wrong submitting the pantry. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-[calc(100dvh-4rem-1px)] flex flex-col" style="background: var(--cream-light);">
    <!-- ── Success state ──────────────────────────────────────────────── -->
    <div
      v-if="submitted"
      class="flex-1 flex items-center justify-center px-6 py-20"
    >
      <LogoMessage
        class="max-w-[520px] w-full"
        title="Thank you for your submission!"
        :message="[
          'We have received the pantry information you provided. Our team will review it and, once approved, publish it on PantryFinder.',
          'This usually takes 3–5 business days. We may reach out using the contact details you provided if we have any questions.',
        ]"
      >
        <NuxtLink to="/" class="btn-primary btn--lg mt-7">Back to Home</NuxtLink>
      </LogoMessage>
    </div>

    <!-- ── Form ──────────────────────────────────────────────────────────── -->
    <template v-else>
      <!-- Header -->
      <div class="bg-white border-b" style="border-color: var(--border-soft);">
        <div class="max-w-[760px] mx-auto px-6 pt-10 pb-8">
          <div class="flex items-start gap-[18px]">
            <div class="text-[40px] leading-none">🏪</div>
            <div>
              <h1 class="font-serif text-[clamp(26px,3.5vw,32px)] font-bold leading-tight mb-2" style="color: var(--text-dark);">
                Add a Pantry
              </h1>
              <p class="text-[15px] leading-relaxed max-w-[540px]" style="color: var(--text-mid);">
                Know a food pantry that isn’t listed yet? Share what you know and our team will
                review and publish it. The more detail you provide, the better.
              </p>
            </div>
          </div>
        </div>
      </div>

      <form class="w-full max-w-[760px] mx-auto px-6 pt-8 pb-20" @submit.prevent="onSubmit">
        <!-- Validation banner -->
        <div
          v-if="formInvalid"
          class="flex items-center gap-3 rounded-[14px] px-5 py-3.5 mb-6"
          style="background: #fff5f5; border: 1.5px solid #fca5a5;"
        >
          <UIcon name="i-lucide-info" class="size-[18px] shrink-0" style="color: #e11d48;" />
          <span class="text-sm font-medium" style="color: #be123c;">
            Please complete the required fields marked with a red asterisk (*). Each time slot needs a
            day, open, and close time, and each service needs a name.
          </span>
        </div>

        <!-- Pantry Information -->
        <section class="form-section-card">
          <div class="form-section-head">
            <div class="form-section-icon">📋</div>
            <div>
              <div class="font-serif text-[17px] font-semibold leading-tight" style="color: var(--text-dark);">Pantry Information</div>
              <div class="text-[13px] mt-0.5" style="color: var(--text-soft);">Required details to identify and locate the pantry</div>
            </div>
          </div>

          <div class="mb-[18px]">
            <label class="field-label field-label-required" for="ap-name">Pantry Name</label>
            <input
              id="ap-name"
              v-model="form.name"
              type="text"
              placeholder="e.g. Newton Community Food Pantry"
              class="form-input"
              :class="{ 'has-error': errors.name }"
              @input="clearError('name')"
            />
            <p v-if="errors.name" class="field-error">Pantry name is required.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3.5 mb-[18px]">
            <div>
              <label class="field-label field-label-required" for="ap-street">Street Address</label>
              <input
                id="ap-street"
                v-model="form.street"
                type="text"
                placeholder="e.g. 1000 Commonwealth Avenue"
                class="form-input"
                :class="{ 'has-error': errors.street }"
                @input="clearError('street')"
              />
              <p v-if="errors.street" class="field-error">Street address is required.</p>
            </div>
            <div>
              <label class="field-label" for="ap-addr2">Suite / Unit</label>
              <input id="ap-addr2" v-model="form.address2" type="text" placeholder="Suite 200" class="form-input" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3.5 mb-[18px]">
            <div>
              <label class="field-label field-label-required" for="ap-city">City</label>
              <input
                id="ap-city"
                v-model="form.city"
                type="text"
                placeholder="e.g. Newton"
                class="form-input"
                :class="{ 'has-error': errors.city }"
                @input="clearError('city')"
              />
              <p v-if="errors.city" class="field-error">City is required.</p>
            </div>
            <div>
              <label class="field-label field-label-required" for="ap-state">State</label>
              <select
                id="ap-state"
                v-model="form.state"
                class="form-select"
                :class="{ 'has-error': errors.state }"
                @change="clearError('state')"
              >
                <option value="">State</option>
                <option v-for="c in STATE_CODES" :key="c" :value="c">{{ c }}</option>
              </select>
              <p v-if="errors.state" class="field-error">State is required.</p>
            </div>
            <div>
              <label class="field-label field-label-required" for="ap-zip">ZIP Code</label>
              <input
                id="ap-zip"
                v-model="form.zipCode"
                type="text"
                placeholder="02459"
                class="form-input"
                :class="{ 'has-error': errors.zipCode }"
                @input="clearError('zipCode')"
              />
              <p v-if="errors.zipCode" class="field-error">ZIP code is required.</p>
            </div>
          </div>

          <div class="mb-[18px]">
            <label class="field-label" for="ap-about">About this Pantry</label>
            <textarea
              id="ap-about"
              v-model="form.about"
              rows="3"
              placeholder="Any helpful context — parking, entrance location, languages spoken, eligibility requirements…"
              class="form-textarea"
            />
          </div>

          <div>
            <label class="field-label" for="ap-notes">Additional Notes</label>
            <input id="ap-notes" v-model="form.notes" type="text" placeholder="Anything else reviewers should know" class="form-input" />
          </div>
        </section>

        <!-- Contact Information -->
        <section class="form-section-card">
          <div class="form-section-head">
            <div class="form-section-icon">📞</div>
            <div>
              <div class="font-serif text-[17px] font-semibold leading-tight" style="color: var(--text-dark);">Contact Information</div>
              <div class="text-[13px] mt-0.5" style="color: var(--text-soft);">Optional — helps visitors reach the pantry</div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-[18px]">
            <div>
              <label class="field-label" for="ap-phone">Phone Number</label>
              <input id="ap-phone" v-model="form.phone" type="tel" placeholder="617-555-0100" class="form-input" />
            </div>
            <div>
              <label class="field-label" for="ap-contact">Contact Person</label>
              <input id="ap-contact" v-model="form.contactName" type="text" placeholder="e.g. Maria Lopez" class="form-input" />
            </div>
          </div>
          <div>
            <label class="field-label" for="ap-website">Website</label>
            <input id="ap-website" v-model="form.website" type="url" placeholder="https://www.example.org" class="form-input" />
          </div>
        </section>

        <!-- Operating Hours (pantry-level) -->
        <section class="form-section-card">
          <div class="form-section-head">
            <div class="form-section-icon">🕐</div>
            <div>
              <div class="font-serif text-[17px] font-semibold leading-tight" style="color: var(--text-dark);">Operating Hours</div>
              <div class="text-[13px] mt-0.5" style="color: var(--text-soft);">General pantry hours. Service-specific hours can be added per service below.</div>
            </div>
          </div>

          <ScheduleRowsEditor v-model="schedules" add-label="Add a time slot" :show-errors="attempted" />

          <div class="mt-3.5 px-4 py-3 rounded-[12px]" style="background: var(--cream-warm); border: 1px solid #e8d5b0;">
            <p class="text-xs leading-relaxed" style="color: #a07850;">
              <strong>Tip:</strong> For appointment-only slots, add a note in the Notes field.
            </p>
          </div>
        </section>

        <!-- Services -->
        <section class="form-section-card">
          <div class="form-section-head">
            <div class="form-section-icon">🤝</div>
            <div>
              <div class="font-serif text-[17px] font-semibold leading-tight" style="color: var(--text-dark);">Services</div>
              <div class="text-[13px] mt-0.5" style="color: var(--text-soft);">Add each service the pantry runs — its food types and its own hours</div>
            </div>
          </div>

          <p v-if="services.length === 0" class="text-[13px] mb-4" style="color: var(--text-soft);">
            No services added yet. Add a service (e.g. “Food Distribution”) to describe what the
            pantry offers and when.
          </p>

          <div
            v-for="(service, si) in services"
            :key="si"
            class="rounded-[16px] border p-4 sm:p-5 mb-4"
            style="border-color: var(--border-soft); background: var(--green-light);"
          >
            <div class="flex items-center justify-between gap-3 mb-4">
              <span class="font-semibold text-[14px]" style="color: var(--text-dark);">Service {{ si + 1 }}</span>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[12px] font-medium"
                style="color: #e11d48;"
                @click="removeService(si)"
              >
                <UIcon name="i-lucide-trash-2" class="size-3.5" /> Remove
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-[18px]">
              <div>
                <label class="field-label field-label-required" :for="`svc-name-${si}`">Service Name</label>
                <input
                  :id="`svc-name-${si}`"
                  v-model="service.name"
                  type="text"
                  list="svc-name-options"
                  placeholder="e.g. Food Distribution"
                  class="form-input"
                  :class="{ 'has-error': attempted && !service.name.trim() }"
                  @change="onServiceNameChange(service)"
                />
                <p v-if="attempted && !service.name.trim()" class="field-error">Service name is required.</p>
              </div>
              <div>
                <label class="field-label" :for="`svc-cat-${si}`">Category</label>
                <select :id="`svc-cat-${si}`" v-model="service.category" class="form-select">
                  <option value="">Select a category…</option>
                  <option v-for="c in SERVICE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-[18px]">
              <div>
                <label class="field-label" :for="`svc-prog-${si}`">Program Type</label>
                <input
                  :id="`svc-prog-${si}`"
                  v-model="service.program"
                  type="text"
                  placeholder="e.g. Choice Pantry, Pre-packed box"
                  class="form-input"
                />
              </div>
              <div>
                <label class="field-label" :for="`svc-notes-${si}`">Service Notes</label>
                <input
                  :id="`svc-notes-${si}`"
                  v-model="service.notes"
                  type="text"
                  placeholder="e.g. ID required, residents only"
                  class="form-input"
                />
              </div>
            </div>

            <div class="mb-[18px]">
              <label class="field-label">Food Available</label>
              <div class="flex flex-wrap gap-2.5">
                <label
                  v-for="f in FOOD_OPTIONS"
                  :key="f"
                  class="check-pill"
                  :class="{ 'is-checked': service.foods.includes(f) }"
                >
                  <input
                    type="checkbox"
                    :checked="service.foods.includes(f)"
                    class="accent-[var(--green-dark)] w-3.5 h-3.5"
                    @change="toggleFood(service, f)"
                  />
                  {{ foodEmoji(f) }} {{ f }}
                </label>
              </div>
            </div>

            <div>
              <label class="field-label">Service Hours</label>
              <ScheduleRowsEditor v-model="service.schedules" add-label="Add a time slot" :show-errors="attempted" />
            </div>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-2 px-[18px] py-2.5 rounded-[10px] text-[13px] font-semibold"
            style="border: 1.5px dashed var(--green-soft); background: white; color: var(--green-dark);"
            @click="addService"
          >
            <span class="text-base leading-none">+</span> Add a service
          </button>
        </section>

        <!-- Your Information -->
        <section class="form-section-card">
          <div class="form-section-head">
            <div class="form-section-icon">👤</div>
            <div>
              <div class="font-serif text-[17px] font-semibold leading-tight" style="color: var(--text-dark);">Your Information</div>
              <div class="text-[13px] mt-0.5" style="color: var(--text-soft);">Required — so we can verify the listing and follow up if needed</div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-[18px]">
            <div>
              <label class="field-label field-label-required" for="ap-first">First Name</label>
              <input
                id="ap-first"
                v-model="form.firstName"
                type="text"
                autocomplete="given-name"
                placeholder="Jane"
                class="form-input"
                :class="{ 'has-error': errors.firstName }"
                @input="clearError('firstName')"
              />
              <p v-if="errors.firstName" class="field-error">First name is required.</p>
            </div>
            <div>
              <label class="field-label field-label-required" for="ap-last">Last Name</label>
              <input
                id="ap-last"
                v-model="form.lastName"
                type="text"
                autocomplete="family-name"
                placeholder="Smith"
                class="form-input"
                :class="{ 'has-error': errors.lastName }"
                @input="clearError('lastName')"
              />
              <p v-if="errors.lastName" class="field-error">Last name is required.</p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label class="field-label field-label-required" for="ap-email">Your Email</label>
              <input
                id="ap-email"
                v-model="form.email"
                type="email"
                autocomplete="email"
                placeholder="jane@example.com"
                class="form-input"
                :class="{ 'has-error': errors.email }"
                @input="clearError('email')"
              />
              <p v-if="errors.email" class="field-error">A valid email address is required.</p>
            </div>
            <div>
              <label class="field-label field-label-required" for="ap-rel">Your Relationship to This Pantry</label>
              <select
                id="ap-rel"
                v-model="form.relationship"
                class="form-select"
                :class="{ 'has-error': errors.relationship }"
                @change="clearError('relationship')"
              >
                <option value="">Select one…</option>
                <option v-for="r in RELATIONSHIPS" :key="r" :value="r">{{ r }}</option>
              </select>
              <p v-if="errors.relationship" class="field-error">Please select your relationship.</p>
            </div>
          </div>
        </section>

        <!-- Submit -->
        <p
          v-if="serverError"
          class="text-sm rounded-[12px] px-4 py-3 mb-4"
          style="color: #b91c1c; background: #fef2f2;"
        >{{ serverError }}</p>

        <div class="flex items-center justify-between gap-4 flex-wrap mt-2">
          <p class="text-[13px] leading-relaxed max-w-[400px]" style="color: var(--text-soft);">
            Fields marked <span style="color: #e11d48;">*</span> are required. All other information is
            optional but helps us publish accurate listings faster.
          </p>
          <button
            type="submit"
            :disabled="submitting"
            class="btn-primary btn--lg disabled:opacity-50 disabled:cursor-not-allowed"
          >{{ submitting ? 'Submitting…' : 'Submit Pantry' }}</button>
        </div>
      </form>

      <!-- Shared datalist of common service names for every service-name input. -->
      <datalist id="svc-name-options">
        <option v-for="n in SERVICE_NAME_OPTIONS" :key="n" :value="n" />
      </datalist>
    </template>

    <FooterSimple />
  </div>
</template>
