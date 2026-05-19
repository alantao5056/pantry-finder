<script setup lang="ts">
const { show } = useAuthModal()

const STATS = [
  { number: '1,400+', label: 'Food Pantries Listed', icon: '🏪' },
  { number: '60+',    label: 'Cities Covered',        icon: '📍' },
  { number: '28K+',   label: 'Families Served Monthly', icon: '👨‍👩‍👧‍👦' },
  { number: '100%',   label: 'Free, Always',          icon: '💚' },
]

const STEPS = [
  { num: '01', title: 'Search Your Area',        desc: 'Enter your address or city and set a search radius to find pantries near you.', icon: 'i-lucide-search' },
  { num: '02', title: 'Check Hours & Details',   desc: 'View open schedules, food types available, and contact info for each pantry.',   icon: 'i-lucide-clock' },
  { num: '03', title: 'Connect & Follow',        desc: 'Love a pantry, follow for updates, and help keep information accurate for everyone.', icon: 'i-lucide-heart' },
]

const CATEGORIES = [
  { icon: '🥦', label: 'Fresh Produce' },
  { icon: '🥩', label: 'Meat & Protein' },
  { icon: '🥛', label: 'Dairy & Eggs' },
  { icon: '🍞', label: 'Bread & Bakery' },
  { icon: '🥫', label: 'Canned Goods' },
  { icon: '🌾', label: 'Dry Goods' },
  { icon: '🍼', label: 'Baby Food' },
  { icon: '🐾', label: 'Pet Supplies' },
  { icon: '🧴', label: 'Personal Care' },
  { icon: '🏠', label: 'Household Items' },
  { icon: '❄️', label: 'Frozen Meals' },
  { icon: '🌿', label: 'Halal & Kosher' },
]

const TESTIMONIALS = [
  {
    quote: 'I was too ashamed to ask for help, but PantryFinder made it feel simple and private. Found a pantry two blocks from my apartment within minutes.',
    name: 'Maria T.', location: 'Newton, MA', avatar: 'MT', color: '#dcf4e6',
  },
  {
    quote: 'As a pantry coordinator, getting listed here tripled our walk-in traffic. The families we now reach would have never found us otherwise.',
    name: 'Pastor James K.', location: 'Waltham, MA', avatar: 'JK', color: '#faf5ec',
  },
  {
    quote: 'The schedule info is so accurate. I drove 20 minutes and they were actually open — with halal options too. I cried, honestly.',
    name: 'Aisha M.', location: 'Brighton, MA', avatar: 'AM', color: '#f0faf4',
  },
]

const { tags: quickTags } = useNearbyTags()

const OPERATOR_FEATURES = [
  { icon: '⚡', text: 'Live in under 5 minutes' },
  { icon: '📅', text: 'Real-time schedule management' },
  { icon: '📊', text: "See who's visiting your listing" },
  { icon: '💸', text: 'Completely free, forever' },
]

const searchBar = ref<{ setAddress: (value: string) => void } | null>(null)

const onSearch = (location: string) => {
  navigateTo({ path: '/search', query: { location, radius: '5' } })
}

const onTagClick = (tag: string) => {
  searchBar.value?.setAddress(tag)
}

let revealObserver: IntersectionObserver | null = null

onMounted(() => {
  const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right')
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
      class="relative overflow-hidden flex flex-col justify-center"
      style="background: linear-gradient(160deg, #f0faf4 0%, #fdfbf7 55%, #faf5ec 100%); min-height: 92vh;"
    >
      <!-- Large decorative word -->
      <div
        class="absolute font-serif font-semibold leading-none select-none pointer-events-none"
        style="top: 8%; right: -2%; font-size: clamp(100px, 15vw, 200px); color: rgba(30,122,71,0.045);"
      >food</div>

      <div class="max-w-[1120px] mx-auto py-[20px] pb-[100px] relative z-[1]">
        <div class="max-w-[760px]">

          <!-- Eyebrow -->
          <div
            class="inline-flex items-center gap-2 bg-white border-[1.5px] rounded-[100px] px-4 py-1.5 mb-7"
            style="border-color: #b8e8cc; box-shadow: 0 2px 12px rgba(30,122,71,0.08);"
          >
            <span class="text-[14px]">🌱</span>
            <span class="text-[13px] font-semibold tracking-wide" style="color: var(--green-dark);">
              Free • Community-Powered • Always Up-to-Date
            </span>
          </div>

          <!-- Headline -->
          <h1
            class="font-serif font-semibold mb-5"
            style="font-size: clamp(40px, 6vw, 76px); line-height: 1.08; color: var(--text-dark); letter-spacing: -0.02em;"
          >
            Find Food Pantries,
            <span class="font-serif italic font-medium" style="color: var(--green-dark);">Near You</span>
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
            <div class="text-[28px] mb-2.5">{{ s.icon }}</div>
            <div class="font-serif font-semibold text-[3rem] leading-none" style="color: var(--green-dark);">{{ s.number }}</div>
            <div class="text-[14px] mt-2 font-normal" style="color: var(--text-soft);">{{ s.label }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ HOW IT WORKS ══ -->
    <section id="how-it-works" class="py-[100px] px-6" style="background: var(--cream-light);">
      <div class="max-w-[1120px] mx-auto">
        <div class="text-center mb-16">
          <span class="tag-pill reveal" style="background: #dcf4e6; color: var(--green-dark);">How It Works</span>
          <h2
            class="font-serif font-semibold reveal mt-4"
            style="font-size: clamp(32px, 4vw, 52px); color: var(--text-dark); letter-spacing: -0.02em; line-height: 1.15;"
          >
            Three steps to your<br/>
            <span class="font-serif italic font-medium" style="color: var(--green-mid);">nearest pantry</span>
          </h2>
        </div>

        <div class="relative grid grid-cols-1 md:grid-cols-3 gap-10">
          <!-- Connector line -->
          <div
            class="hidden md:block absolute left-0 right-0 h-0 z-0"
            style="top: 58px; border-top: 2px dashed #b8e8cc;"
          ></div>

          <div
            v-for="(s, i) in STEPS"
            :key="s.num"
            class="reveal relative z-[1]"
            :style="{ transitionDelay: `${i * 0.15}s` }"
          >
            <div class="mb-6">
              <span
                class="block w-14 text-center font-serif text-[16px] font-semibold mb-2"
                style="color: #b8e8cc; letter-spacing: 0.12em;"
              >{{ s.num }}</span>
              <div
                class="w-14 h-14 rounded-2xl flex items-center justify-center border-2"
                style="background: var(--green-light); border-color: #b8e8cc; color: var(--green-dark);"
              >
                <UIcon :name="s.icon" class="size-7" />
              </div>
            </div>
            <h3 class="font-serif font-semibold text-[22px] mb-3" style="color: var(--text-dark);">{{ s.title }}</h3>
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
            <span class="tag-pill reveal" style="background: white; color: var(--green-dark);">What's Available</span>
            <h2
              class="font-serif font-semibold reveal mt-4 mb-5"
              style="font-size: clamp(28px, 3.5vw, 46px); color: var(--text-dark); letter-spacing: -0.02em; line-height: 1.15;"
            >
              Food for every<br/>need &amp; culture
            </h2>
            <p
              class="reveal text-[16px] leading-[1.75] font-light mb-8"
              style="color: var(--text-mid); max-width: 420px;"
            >
              Our pantries collectively stock a wide variety of items — from fresh produce to culturally specific ingredients, baby essentials to pet supplies. No one slips through.
            </p>
            <NuxtLink
              to="/search"
              class="reveal btn-primary"
            >Search All Pantries →</NuxtLink>
          </div>

          <div class="flex flex-wrap gap-2.5">
            <div
              v-for="(c, i) in CATEGORIES"
              :key="c.label"
              class="cat-pill reveal"
              :style="{ transitionDelay: `${(i % 4) * 0.08}s` }"
            >
              <span class="text-[18px]">{{ c.icon }}</span>
              <span>{{ c.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ TESTIMONIALS ══ -->
    <section class="py-[100px] px-6 bg-white">
      <div class="max-w-[1120px] mx-auto">
        <div class="text-center mb-16">
          <span class="tag-pill reveal" style="background: var(--cream-warm); color: #a07850;">Community Voices</span>
          <h2
            class="font-serif font-semibold reveal mt-4"
            style="font-size: clamp(28px, 3.5vw, 46px); color: var(--text-dark); letter-spacing: -0.02em; line-height: 1.15;"
          >
            Real people,<br/>
            <span class="font-serif italic font-medium" style="color: var(--green-mid);">real stories</span>
          </h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            v-for="(t, i) in TESTIMONIALS"
            :key="t.name"
            class="testimonial-card reveal"
            :style="{ transitionDelay: `${i * 0.15}s` }"
          >
            <div class="flex gap-0.5">
              <span v-for="n in 5" :key="n" style="color: #fc7e0a; font-size: 14px;">★</span>
            </div>
            <p class="text-[15px] leading-[1.75] font-light italic my-4 mb-6" style="color: var(--text-mid);">
              "{{ t.quote }}"
            </p>
            <div class="flex items-center gap-3 pt-5 border-t" style="border-color: var(--border-soft);">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-[13px] shrink-0"
                :style="{ background: t.color, color: 'var(--green-dark)' }"
              >{{ t.avatar }}</div>
              <div>
                <div class="font-semibold text-[14px]" style="color: var(--text-dark);">{{ t.name }}</div>
                <div class="text-[13px]" style="color: var(--text-soft);">{{ t.location }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ FOR PANTRY OPERATORS ══ -->
    <section class="py-[100px] px-6" style="background: var(--cream-light);">
      <div class="max-w-[1120px] mx-auto">
        <div
          class="bg-white rounded-[28px] p-16 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-12 items-center border-[1.5px]"
          style="border-color: var(--border-soft); box-shadow: 0 4px 40px rgba(30,122,71,0.06);"
        >
          <div>
            <span class="tag-pill reveal" style="background: var(--cream-warm); color: #a07850;">For Pantry Operators</span>
            <h2
              class="font-serif font-semibold reveal mt-4 mb-4"
              style="font-size: clamp(28px, 3.5vw, 44px); color: var(--text-dark); letter-spacing: -0.02em; line-height: 1.15;"
            >
              Run a pantry?<br/>List it
              <span class="font-serif italic font-medium" style="color: var(--green-mid);">for free.</span>
            </h2>
            <p
              class="reveal text-[16px] leading-[1.75] font-light"
              style="color: var(--text-mid); max-width: 480px;"
            >
              Thousands of families search PantryFinder every week. Get listed in minutes — manage your schedule, food availability, and contact info all in one place.
            </p>
            <div class="reveal flex gap-3 mt-8">
              <button
                type="button"
                class="btn-primary"
              >Add Your Pantry →</button>
              <button
                type="button"
                class="btn-secondary"
              >Learn More</button>
            </div>
          </div>

          <div class="reveal-right flex flex-col gap-4 min-w-[240px]">
            <div
              v-for="f in OPERATOR_FEATURES"
              :key="f.text"
              class="flex items-center gap-3 px-4.5 py-3.5 rounded-[12px]"
              style="background: var(--green-light); padding: 14px 18px;"
            >
              <span class="text-[20px]">{{ f.icon }}</span>
              <span class="text-[14px] font-medium" style="color: var(--text-mid);">{{ f.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ CTA BAND ══ -->
    <section class="cta-band py-[90px] px-6">
      <div class="max-w-[700px] mx-auto text-center relative z-[1]">
        <span class="block mb-5 text-[48px]">🌿</span>
        <h2
          class="reveal font-serif font-semibold text-white mb-4"
          style="font-size: clamp(30px, 4vw, 54px); letter-spacing: -0.02em; line-height: 1.1;"
        >
          No one should go<br/>hungry in our community.
        </h2>
        <p
          class="reveal text-[18px] mb-11 leading-[1.65] font-light"
          style="color: rgba(255,255,255,0.7);"
        >
          Start your search now — it takes less than 30 seconds to find a pantry near you.
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
