<script setup lang="ts">
const { show } = useAuthModal()

usePageSeo({
  title: 'PantryFinder - Find Free Food Pantries Near You',
  description:
    'Find free food pantries near you with PantryFinder. Search 1,400+ pantries across 60+ cities by address to see hours, available food, and contact info.',
  path: '/',
  brandSuffix: false,
})

// pantryCountDisplay / cityCountDisplay / stateCountDisplay come from app/utils/siteStats.ts (auto-imported),
// which reads app/data/site-stats.json — regenerated from Firestore by the sitemap tool.
const STATS = [
  { number: pantryCountDisplay, label: 'Food Pantries Listed' },
  { number: cityCountDisplay,   label: 'Cities Covered' },
  { number: stateCountDisplay,  label: 'States Covered' },
  { number: '100%',             label: 'Free, Always' },
]

const STEPS = [
  { num: '01', title: 'Search Your Area',        desc: 'Enter your address or city and set a search radius to find pantries near you.', icon: 'i-lucide-search' },
  { num: '02', title: 'Check Hours & Details',   desc: 'View open schedules, food types available, and contact info for each pantry.',   icon: 'i-lucide-clock' },
  { num: '03', title: 'Connect & Follow',        desc: 'Love a pantry, follow for updates, and help keep information accurate for everyone.', icon: 'i-lucide-heart' },
]

const CATEGORIES = [
  'Fresh Produce',
  'Meat & Protein',
  'Dairy & Eggs',
  'Bread & Bakery',
  'Canned Goods',
  'Dry Goods',
  'Baby Food',
  'Pet Supplies',
  'Personal Care',
  'Household Items',
  'Frozen Meals',
  'Halal & Kosher',
]

const { tags: quickTags } = useNearbyTags()

const searchBar = ref<{ setAddress: (value: string) => void } | null>(null)

const onSearch = (location: string) => {
  navigateTo({ path: '/search', query: { location, radius: '5' } })
}

const onTagClick = (tag: string) => {
  searchBar.value?.setAddress(tag)
  onSearch(tag)
}

let revealObserver: IntersectionObserver | null = null

onMounted(() => {
  const els = document.querySelectorAll('.reveal')
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add('visible')
    })
  }, { threshold: 0.12 })
  els.forEach((el) => revealObserver!.observe(el))
})

onUnmounted(() => {
  revealObserver?.disconnect()
})
</script>

<template>
  <div class="font-sans relative z-[1]" style="color: var(--text-dark);">

    <!-- ══ HERO ══ -->
    <section
      class="relative flex flex-col justify-center px-6"
      style="background: linear-gradient(160deg, var(--green-wash) 0%, var(--cream-light) 45%, var(--cream-warm) 100%); min-height: 92vh;"
    >
      <!-- Decorative watermark clip layer: scopes overflow-hidden to just the logo, so
           the hero itself doesn't clip the SearchBar dropdown overflowing below it. -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <!-- Large faded brand-mark watermark, bleeding off the top-right corner -->
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          class="absolute select-none"
          style="top: -6%; right: -8%; width: clamp(360px, 42vw, 640px); opacity: 0.07;"
        />
      </div>

      <div class="w-full max-w-[760px] mx-auto py-[20px] pb-[100px] relative z-[1]">
        <div class="max-w-[760px]">

          <!-- Headline -->
          <h1
            class="font-semibold mb-5"
            style="font-size: clamp(40px, 6vw, 76px); line-height: 1.08; color: var(--text-dark); letter-spacing: -0.02em;"
          >
            Find Food Pantries,
            <span class="italic font-medium" style="color: var(--green-dark);">Near You</span>
          </h1>

          <!-- Sub -->
          <p
            class="leading-[1.65] mb-11 font-light"
            style="font-size: clamp(16px, 2vw, 20px); color: var(--text-mid); max-width: 560px;"
          >
            Connecting communities with nutritious food.
            Discover pantries, check hours, and get help when you need it most.
          </p>

          <!-- Search box -->
          <div class="max-w-[720px] mb-5">
            <SearchBar ref="searchBar" :show-radius="false" @submit="onSearch" />
          </div>

          <!-- Quick tags (fixed height to prevent layout shift) -->
          <div class="flex items-center flex-wrap gap-2 min-h-[32px]">
            <TransitionGroup
              tag="div"
              class="flex items-center flex-wrap gap-2"
              enter-active-class="quick-tag-enter-active"
              enter-from-class="quick-tag-enter-from"
            >
              <span
                v-if="quickTags.length > 0"
                key="__label"
                class="text-[13px] font-medium"
                style="color: var(--text-soft);"
              >Try:</span>
              <button
                v-for="(t, i) in quickTags"
                :key="t"
                type="button"
                class="btn-pill"
                :style="{ '--enter-delay': `${i * 80}ms` }"
                @click="onTagClick(t)"
              >{{ t }}</button>
            </TransitionGroup>
          </div>
        </div>
      </div>

      <!-- Scroll cue -->
      <div
        class="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
        style="color: var(--text-soft);"
      >
        <span class="text-[12px] font-medium" style="letter-spacing: 0.1em;">EXPLORE</span>
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M8 2v20M2 16l6 6 6-6"/>
        </svg>
      </div>
    </section>

    <!-- ══ STATS ══ -->
    <section class="bg-white border-t border-b" style="border-color: var(--border-soft);">
      <div class="max-w-[1120px] mx-auto px-6">
        <div class="grid grid-cols-2 md:grid-cols-4">
          <div
            v-for="(s, i) in STATS"
            :key="s.label"
            class="reveal text-center px-8 py-11"
            :class="i < 3 ? 'md:border-r' : ''"
            :style="{ borderColor: 'var(--border-soft)', transitionDelay: `${i * 0.1}s` }"
          >
            <div class="font-semibold text-[3rem] leading-none" style="color: var(--green-dark);">{{ s.number }}</div>
            <div class="text-[14px] mt-2 font-normal" style="color: var(--text-soft);">{{ s.label }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ HOW IT WORKS ══ -->
    <section id="how-it-works" class="py-[100px] px-6" style="background: var(--cream-light);">
      <div class="max-w-[1120px] mx-auto">
        <div class="text-center mb-16">
          <span class="tag-pill tag-pill--green reveal">How It Works</span>
          <h2
            class="font-semibold reveal mt-4"
            style="font-size: clamp(32px, 4vw, 52px); color: var(--text-dark); letter-spacing: -0.02em; line-height: 1.15;"
          >
            Three steps to your<br/>
            <span class="italic font-medium" style="color: var(--green-mid);">nearest pantry</span>
          </h2>
        </div>

        <div class="relative grid grid-cols-1 md:grid-cols-3 gap-10">
          <!-- Connector line -->
          <div
            class="hidden md:block absolute left-0 right-0 h-0 z-0"
            style="top: 58px; border-top: 2px dashed var(--green-border);"
          ></div>

          <div
            v-for="(s, i) in STEPS"
            :key="s.num"
            class="reveal relative z-[1]"
            :style="{ transitionDelay: `${i * 0.15}s` }"
          >
            <div class="mb-6">
              <span
                class="block w-14 text-center text-[16px] font-semibold mb-2"
                style="color: var(--green-soft); letter-spacing: 0.12em;"
              >{{ s.num }}</span>
              <div
                class="w-14 h-14 rounded-2xl flex items-center justify-center border-2"
                style="background: var(--green-light); border-color: var(--green-border); color: var(--green-dark);"
              >
                <UIcon :name="s.icon" class="size-7" />
              </div>
            </div>
            <h3 class="font-semibold text-[22px] mb-3" style="color: var(--text-dark);">{{ s.title }}</h3>
            <p class="text-[15px] leading-[1.7] font-light" style="color: var(--text-mid);">{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ FOOD CATEGORIES ══ -->
    <section class="py-[100px] px-6" style="background: var(--green-light);">
      <div class="max-w-[1120px] mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <div>
            <span class="tag-pill tag-pill--white reveal">What's Available</span>
            <h2
              class="font-semibold reveal mt-4 mb-5"
              style="font-size: clamp(28px, 3.5vw, 46px); color: var(--text-dark); letter-spacing: -0.02em; line-height: 1.15;"
            >
              Food for every<br/>need &amp; culture
            </h2>
            <p
              class="reveal text-[16px] leading-[1.75] font-light mb-8"
              style="color: var(--text-mid); max-width: 420px;"
            >
              Our pantries collectively stock a wide variety of items, from fresh produce to culturally specific ingredients, baby essentials to pet supplies. No one slips through.
            </p>
            <NuxtLink
              to="/search"
              class="reveal btn-primary"
            >Search All Pantries →</NuxtLink>
          </div>

          <div class="flex flex-wrap gap-2.5">
            <div
              v-for="(c, i) in CATEGORIES"
              :key="c"
              class="cat-pill reveal"
              :style="{ transitionDelay: `${(i % 4) * 0.08}s` }"
            >{{ c }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ FOR PANTRY OPERATORS ══ -->
    <section class="py-[100px] px-6" style="background: var(--cream-light);">
      <div class="max-w-[1120px] mx-auto">
        <div
          class="bg-white rounded-[28px] p-16 border-[1.5px]"
          style="border-color: var(--border-soft); box-shadow: 0 4px 40px rgba(0,0,0,0.04);"
        >
          <div>
            <span class="tag-pill tag-pill--warm reveal">For Pantry Operators</span>
            <h2
              class="font-semibold reveal mt-4 mb-4"
              style="font-size: clamp(28px, 3.5vw, 44px); color: var(--text-dark); letter-spacing: -0.02em; line-height: 1.15;"
            >
              Run a pantry? List it
              <span class="italic font-medium" style="color: var(--green-mid);">for free.</span>
            </h2>
            <p
              class="reveal text-[16px] leading-[1.75] font-light"
              style="color: var(--text-mid); max-width: 480px;"
            >
              Tell us your pantry's hours, services, and contact info. Our team reviews each submission and publishes it so neighbors nearby can find you.
            </p>
            <div class="reveal flex gap-3 mt-8">
              <NuxtLink to="/add-pantry" class="btn-primary">Add Your Pantry →</NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ CTA BAND ══ -->
    <section class="cta-band py-[90px] px-6">
      <div class="max-w-[700px] mx-auto text-center relative z-[1]">
        <h2
          class="reveal font-semibold text-white mb-4"
          style="font-size: clamp(30px, 4vw, 54px); letter-spacing: -0.02em; line-height: 1.1;"
        >
          No one should go<br/>hungry in our community.
        </h2>
        <p
          class="reveal text-[18px] mb-11 leading-[1.65] font-light"
          style="color: rgba(255,255,255,0.7);"
        >
          Start your search now. It takes less than 30 seconds to find a pantry near you.
        </p>
        <div class="reveal flex gap-3 justify-center flex-wrap">
          <NuxtLink
            to="/search"
            class="btn-on-dark btn--lg"
          >Find a Pantry Near Me</NuxtLink>
          <button
            type="button"
            class="btn-on-dark-outline btn--lg"
            @click="show('register')"
          >Create Free Account</button>
        </div>
      </div>
    </section>

    <Footer />
  </div>
</template>
