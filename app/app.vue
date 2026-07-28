<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
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
const localeHead = useLocaleHead()
const htmlLang = computed(() => localeHead.value.htmlAttrs?.lang ?? 'it')

// D30 — backoffice ALWAYS injects noindex in every environment.
// The admin panel must never be indexed by search engines.
useHead({
  htmlAttrs: { lang: htmlLang },
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>
