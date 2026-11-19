<script setup lang="ts">
usePageSeo({
  title: 'About PantryFinder',
  description:
    'PantryFinder helps people find free food pantries near them and see when each one is open. Here is who I am and why I built it.',
  path: '/about',
})

const origin = useRequestURL().origin
useHead(() => ({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(buildBreadcrumbJsonLd([
        { name: 'Home', url: `${origin}/` },
        { name: 'About' },
      ])),
    },
  ],
}))
</script>

<template>
  <div class="min-h-[calc(100dvh-4rem-1px)] bg-[var(--cream-light)] font-sans">
    <!-- Breadcrumb bar -->
    <div class="crumb-bar">
      <nav class="crumb-row" aria-label="Breadcrumb">
        <NuxtLink to="/" class="crumb-link">Home</NuxtLink>
        <span class="crumb-sep">›</span>
        <span class="crumb-current">About</span>
      </nav>
    </div>

    <!-- Header -->
    <div class="bg-white border-b border-[var(--border-soft)]">
      <div class="max-w-[760px] mx-auto px-6 pt-10 pb-8">
        <h1 class="text-[clamp(26px,3.5vw,32px)] font-bold leading-tight mb-2 text-[var(--text-dark)]">
          About PantryFinder
        </h1>
        <p class="text-[15px] leading-relaxed max-w-[540px] text-[var(--text-mid)]">
          PantryFinder is a free website for finding food pantries near you, with the hours,
          services, and contact details for each one.
        </p>
      </div>
    </div>

    <!-- Body -->
    <article class="max-w-[760px] mx-auto px-6 pt-10 pb-20">
      <p class="about-p">
        I'm Alan Tao, creator of PantryFinder. I am a 12th grader at Newton North High School and the
        captain of the school's programming club. I designed and built PantryFinder, and I run it by
        myself.
      </p>

      <h2 class="about-h2">Why I built it</h2>
      <p class="about-p">
        In 2024 I volunteered at the food pantry at
        <a href="https://roscon.org/" target="_blank" rel="noopener" class="btn-link-accent">Roslindale Congregational Church</a>
        every weekend,
        handing out food. One kind of moment stuck with me: someone would arrive after distribution
        had ended and ask where else nearby was open today, and we could not answer. The problem in
        that moment was not a lack of food. It was that the information about where food was
        available was hard to find and sometimes out of date.
      </p>
      <p class="about-p">
        In 2025 I started asking whether I could use programming, the thing I am best at, to help
        people beyond the one table I stood behind. I began collecting data at the end of 2025, and
        the site launched in June 2026.
      </p>

      <h2 class="about-h2">What it does</h2>
      <p class="about-p">
        You can search by address, city, or ZIP code, see the results as a list or on a map, and
        open each pantry's page for its hours, services, and contact details. You can also
        <NuxtLink to="/food-pantries" class="btn-link-accent">browse pantries by city</NuxtLink>.
        The listings come from public sources on the web. For some pantries that have their own
        website, a program I wrote reads the site and updates the listing when the information
        there changes.
      </p>
    </article>

    <FooterSimple />
  </div>
</template>
