<script setup lang="ts">
const stats = [
  { value: '10+',     label: 'Pantries Listed' },
  { value: '5',       label: 'Cities Covered' },
  { value: 'Free',    label: 'Always & Forever' },
  { value: 'Updated', label: 'Community-Sourced' },
]

const steps = [
  {
    number: '01',
    icon: 'i-lucide-search',
    title: 'Search Your Area',
    desc: 'Enter your address or city and set a search radius to find pantries near you.',
  },
  {
    number: '02',
    icon: 'i-lucide-clock',
    title: 'Check Hours & Details',
    desc: 'View open schedules, food types available, and contact info for each pantry.',
  },
  {
    number: '03',
    icon: 'i-lucide-heart',
    title: 'Connect & Follow',
    desc: 'Love a pantry, follow for updates, and help keep information accurate for everyone.',
  },
]

const featuredPantries = [
  {
    id: 'O5Fyb4ZkN9EqUhksQZyl',
    name: 'Newton Food Pantry',
    address: '1000 Commonwealth Avenue, Newton, MA 02459',
    openToday: true,
  },
  {
    id: 'yoP10WZfa0WLj3WmBKb8',
    name: 'Centre Street Food Pantry',
    address: '11 Homer Street, Newton, MA 02459',
    openToday: true,
  },
  {
    id: 'Dn8lbl7RYacLyrYofQ07',
    name: 'Watertown Food Pantry',
    address: '80 Mt. Auburn St., Watertown, MA 02472',
    openToday: false,
  },
]

const orbs = [
  { top: '15%', left: '8%',  right: undefined, size: 300, opacity: 0.06, duration: 4, delay: 0   },
  { top: '60%', left: undefined, right: '5%',  size: 400, opacity: 0.05, duration: 5, delay: 1.2 },
  { top: '5%',  left: undefined, right: '20%', size: 200, opacity: 0.08, duration: 6, delay: 2.4 },
]
</script>

<template>
  <div class="font-sans">

    <!-- ─── Hero ────────────────────────────────────────────── -->
    <section
      class="relative min-h-screen overflow-hidden flex items-center justify-center"
      style="background: linear-gradient(160deg, #0B3D26 0%, #1C4532 40%, #2D6A4F 70%, #52B788 100%)"
    >
      <!-- Floating orbs -->
      <div
        v-for="(orb, i) in orbs"
        :key="i"
        class="absolute rounded-full pointer-events-none"
        :style="{
          top: orb.top,
          left: orb.left,
          right: orb.right,
          width: `${orb.size}px`,
          height: `${orb.size}px`,
          background: `rgba(82,183,136,${orb.opacity})`,
          filter: 'blur(60px)',
          animation: `float ${orb.duration}s ease-in-out infinite`,
          animationDelay: `${orb.delay}s`,
        }"
      />

      <!-- Dot pattern overlay -->
      <div
        class="absolute inset-0 opacity-50 pointer-events-none"
        style="
          background-image: radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 32px 32px;
        "
      />

      <!-- Content -->
      <div class="relative text-center px-6 pt-[100px] pb-[60px] max-w-[760px] w-full animate-slide-up">

        <!-- Badge -->
        <div class="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-1.5 mb-7">
          <UIcon name="i-lucide-leaf" class="size-3.5 text-forest-300" />
          <span class="text-forest-100 text-[13px] font-medium tracking-wide">
            Free • Community-Powered • Always Up-to-Date
          </span>
        </div>

        <!-- Heading -->
        <h1
          class="font-serif font-bold text-white leading-[1.1] mb-5"
          style="font-size: clamp(38px, 6vw, 68px); letter-spacing: -1px;"
        >
          Find Food Pantries<br />
          <em class="text-forest-300">Near You</em>
        </h1>

        <!-- Subtitle -->
        <p
          class="text-white/75 leading-relaxed max-w-[520px] mx-auto mb-10"
          style="font-size: clamp(16px, 2.5vw, 20px);"
        >
          Connecting communities with nutritious food — discover pantries, check hours, and get help when you need it most.
        </p>

        <!-- Search bar -->
        <div class="bg-white/[0.08] backdrop-blur-[16px] border border-white/20 rounded-[18px] p-2 flex gap-2 max-w-[640px] mx-auto shadow-[0_20px_60px_rgba(0,0,0,0.2)]">

          <!-- Address input -->
          <div class="flex-1 flex items-center gap-2.5 bg-white/[0.12] rounded-xl px-4">
            <UIcon name="i-lucide-map-pin" class="size-[18px] text-forest-300 shrink-0" />
            <input
              type="text"
              placeholder="Enter address or city..."
              class="flex-1 bg-transparent border-none outline-none text-white text-[15px] py-3.5 placeholder:text-white/50"
            />
          </div>

          <!-- Radius selector -->
          <select class="radius-select bg-white/[0.12] border-none rounded-xl text-white text-sm px-4 cursor-pointer outline-none appearance-none min-w-[100px]">
            <option v-for="r in ['2', '5', '10', '25', '50']" :key="r" :value="r">{{ r }} miles</option>
          </select>

          <!-- Search button -->
          <button
            class="rounded-xl text-white px-6 py-3.5 text-[15px] font-semibold flex items-center gap-2 whitespace-nowrap hover:opacity-90 transition-opacity"
            style="background: linear-gradient(135deg, #52B788, #2D6A4F)"
          >
            <UIcon name="i-lucide-search" class="size-[18px]" />
            Search
          </button>
        </div>
      </div>

      <!-- Wave divider -->
      <div class="absolute -bottom-px inset-x-0">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" class="w-full h-20 block">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="#F6F4EE" />
        </svg>
      </div>
    </section>

    <!-- ─── Stats bar ────────────────────────────────────────── -->
    <div class="bg-white border-b border-cream-dark py-5 px-6">
      <div class="max-w-[1200px] mx-auto flex justify-center gap-12 flex-wrap">
        <div v-for="stat in stats" :key="stat.label" class="text-center">
          <div class="font-serif text-[28px] font-bold text-forest-700">{{ stat.value }}</div>
          <div class="text-[13px] text-gray-500 font-medium">{{ stat.label }}</div>
        </div>
      </div>
    </div>

    <!-- ─── How it Works ─────────────────────────────────────── -->
    <section class="py-20 px-6 bg-cream">
      <div class="max-w-[1100px] mx-auto">
        <div class="text-center mb-14">
          <h2
            class="font-serif font-bold text-forest-700 mb-3"
            style="font-size: clamp(28px, 4vw, 42px);"
          >How PantryFinder Works</h2>
          <p class="text-gray-500 text-base max-w-[480px] mx-auto">
            Three simple steps to find the food support you need
          </p>
        </div>

        <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-7">
          <div
            v-for="step in steps"
            :key="step.number"
            class="bg-white rounded-[20px] p-8 shadow-[0_4px_20px_rgba(28,69,50,0.07)] border border-cream-muted relative overflow-hidden"
          >
            <!-- Ghost step number -->
            <span
              class="absolute top-5 right-5 font-serif text-[48px] font-bold leading-none select-none pointer-events-none text-forest-700"
              style="opacity: 0.05;"
            >{{ step.number }}</span>

            <!-- Icon -->
            <div class="w-[52px] h-[52px] bg-forest-50 rounded-[14px] flex items-center justify-center mb-5">
              <UIcon :name="step.icon" class="size-6 text-forest-700" />
            </div>

            <h3 class="font-serif font-bold text-xl text-gray-900 mb-2.5">{{ step.title }}</h3>
            <p class="text-gray-500 text-[15px] leading-relaxed">{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── Featured Pantries ────────────────────────────────── -->
    <section class="py-20 px-6 bg-white">
      <div class="max-w-[1100px] mx-auto">
        <div class="flex items-center justify-between mb-10 flex-wrap gap-3">
          <h2
            class="font-serif font-bold text-forest-700"
            style="font-size: clamp(24px, 3.5vw, 38px);"
          >Featured Pantries</h2>
          <button class="flex items-center gap-1.5 border-[1.5px] border-forest-700 text-forest-700 rounded-[10px] px-5 py-2 text-sm font-medium hover:bg-forest-700/5 transition-colors">
            View All <UIcon name="i-lucide-chevron-right" class="size-4" />
          </button>
        </div>

        <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          <div
            v-for="pantry in featuredPantries"
            :key="pantry.id"
            class="bg-cream rounded-2xl p-6 border border-cream-muted"
          >
            <div class="flex justify-between items-start mb-3">
              <h3 class="text-[17px] text-gray-900 flex-1 mr-2">{{ pantry.name }}</h3>
              <span
                v-if="pantry.openToday"
                class="bg-green-100 text-green-900 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
              >Open Today</span>
            </div>
            <div class="flex items-start gap-1.5 text-gray-500 text-[13px] mb-4">
              <UIcon name="i-lucide-map-pin" class="size-3.5 shrink-0 mt-0.5" />
              <span>{{ pantry.address }}</span>
            </div>
            <button class="w-full bg-forest-700 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-forest-800 transition-colors">
              View Details
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── CTA ──────────────────────────────────────────────── -->
    <section
      class="py-20 px-6 text-center"
      style="background: linear-gradient(135deg, #1C4532, #2D6A4F)"
    >
      <h2
        class="font-serif text-white mb-4"
        style="font-size: clamp(28px, 4vw, 44px);"
      >Know a pantry we're missing?</h2>
      <p class="text-white/75 text-base max-w-[500px] mx-auto mb-8">
        Help us keep PantryFinder accurate and complete for everyone in the community.
      </p>
      <button class="bg-white/15 border-[1.5px] border-white/40 text-white rounded-xl px-8 py-3.5 text-base font-medium backdrop-blur-sm hover:bg-white/25 transition-colors">
        Submit a Pantry
      </button>
    </section>

    <!-- ─── Footer ───────────────────────────────────────────── -->
    <Footer />

  </div>
</template>

<style scoped>
/* Dropdown options need a dark background to remain readable */
.radius-select option {
  background: #1C4532;
  color: white;
}
</style>
