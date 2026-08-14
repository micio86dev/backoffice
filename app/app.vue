<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ConsentBanner :path="route.fullPath" :enabled="analyticsConfigured" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// WCAG 3.1.1 (Language of Page, Level A) — `<html lang>` must follow the
// ACTIVE locale, not a build-time constant. `nuxt.config.ts` only supplies the
// pre-hydration default for the generated SPA shell; with
// `strategy: 'prefix_except_default'` a static `lang="it"` means every
// `/en/*` route serves English content announced with Italian phonetics.
//
// This is invisible to axe: `html-has-lang` and `html-lang-valid` both PASS on
// the broken version, because a lang attribute IS present and IS valid —
// neither rule can tell that it is the WRONG one. Only a test that compares
// the value ACROSS two locales discriminates (tests/unit/app.spec.ts and
// tests/e2e/html-lang.spec.ts).
//
// Depends on every locale declaring a `language` tag in nuxt.config.ts —
// localeHead reads `locale.language`, never `locale.code`, and silently emits
// nothing when it is absent. tests/unit/nuxt-config.spec.ts guards that.
//
// `seo: false` because the ONLY thing wanted here is `htmlAttrs.lang`. Left on,
// @nuxtjs/i18n also emits canonical + hreflang link tags, which this app's
// `noindex, nofollow` policy (D30) makes dead markup — hreflang and canonical
// describe an indexing decision that has already been refused.
//
// This does NOT silence the console warning, despite an earlier version of
// this comment claiming it does. The warning fires inside `createHeadContext`
// (`@nuxtjs/i18n` `runtime/routing/head.js:15`), invoked UNCONDITIONALLY at
// `:86`, BEFORE `options.seo` is even read at `:96` — so `seo: false` cannot
// reach it either way. What actually silences it is `i18n.baseUrl`
// (form-clarity-and-console-warnings, D8) — the warning's own trigger is
// `joinURL('', '/') === ''`, a falsy `baseUrl`, unrelated to `seo`. Declared
// in `nuxt.config.ts`, but that alone does not reach the browser: this is a
// static (`ssr: false`) build, whose public runtime config is embedded
// client-side as JSON, which cannot carry a function value. See
// `app/plugins/i18n-base-url.client.ts` for what actually makes it work.
const localeHead = useLocaleHead({ seo: false })
const htmlLang = computed(() => localeHead.value.htmlAttrs?.lang ?? 'it')

// D30 — backoffice ALWAYS injects noindex in every environment.
// The admin panel must never be indexed by search engines.
useHead({
  htmlAttrs: { lang: htmlLang },
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const runtimeConfig = useRuntimeConfig()
const route = useRoute()

/**
 * Whether this deployment has anything to ask permission FOR.
 *
 * With no measurement or project ID configured, nothing would load whatever the
 * operator answered — so the banner would be asking about a decision that has
 * no effect, which is worse than not asking.
 *
 * Computed here rather than inside the banner: the runtime config belongs to
 * the app shell, and a component that reaches for it is a component that cannot
 * be mounted in a test without one.
 */
const analyticsConfigured = computed(
  () =>
    String(runtimeConfig.public.gaMeasurementId ?? '') !== '' ||
    String(runtimeConfig.public.clarityProjectId ?? '') !== ''
)
</script>
