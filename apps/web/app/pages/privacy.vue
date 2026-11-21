<script setup lang="ts">
usePageSeo({
  title: 'Privacy Policy | PantryFinder',
  description:
    'What information PantryFinder collects, how it is used, and the choices you have.',
  path: '/privacy',
})

const origin = useRequestURL().origin
useHead(() => ({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(buildBreadcrumbJsonLd([
        { name: 'Home', url: `${origin}/` },
        { name: 'Privacy Policy' },
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
        <span class="crumb-current">Privacy Policy</span>
      </nav>
    </div>

    <!-- Header -->
    <div class="bg-white border-b border-[var(--border-soft)]">
      <div class="max-w-[760px] mx-auto px-6 pt-10 pb-8">
        <h1 class="text-[clamp(26px,3.5vw,32px)] font-bold leading-tight mb-2 text-[var(--text-dark)]">
          Privacy Policy
        </h1>
        <p class="text-[15px] leading-relaxed max-w-[540px] text-[var(--text-mid)]">
          Effective November 20, 2026
        </p>
      </div>
    </div>

    <!-- Body -->
    <article class="max-w-[760px] mx-auto px-6 pt-10 pb-20">
      <p class="about-p">
        PantryFinder helps people find food pantries near them. You can search and browse
        pantries without creating an account. This page explains what information the site
        collects and how it is used.
      </p>

      <h2 class="about-h2">Information we collect</h2>
      <ul class="about-list">
        <li>
          <strong>Account information.</strong> If you create an account, we store your email
          address and name. Passwords are stored only in hashed form.
        </li>
        <li>
          <strong>Things you submit.</strong> Pantries you save, pantries you add, and messages
          you send through the contact page.
        </li>
        <li>
          <strong>Automatically collected information.</strong> The addresses you search for,
          your IP address, and basic browser information.
        </li>
      </ul>

      <h2 class="about-h2">How we use it</h2>
      <p class="about-p">
        We use this information to provide search and account features, to prevent abuse, and to
        improve the site. We do not sell your information or use it for advertising.
      </p>

      <h2 class="about-h2">Cookies and third-party services</h2>
      <p class="about-p">
        We use cookies to keep you signed in and to measure site usage with Google Analytics.
        Address lookups, address suggestions, and nearby-location features rely on third-party
        services such as geocoding and map data providers, which receive the information needed
        to answer each request.
      </p>

      <h2 class="about-h2">Your choices</h2>
      <p class="about-p">
        To view or delete your account information, reach out through the
        <NuxtLink to="/contact" class="btn-link-accent">contact page</NuxtLink>.
      </p>

      <h2 class="about-h2">Children</h2>
      <p class="about-p">
        PantryFinder is not directed to children under 13. If we learn that we have collected
        information from a child under 13, we will delete it.
      </p>

      <h2 class="about-h2">Changes to this policy</h2>
      <p class="about-p">
        If this policy changes, we will update the date at the top of this page.
      </p>
    </article>

    <FooterSimple />
  </div>
</template>
