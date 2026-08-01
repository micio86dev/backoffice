<template>
  <div data-testid="unsupported-gate" role="main" aria-labelledby="unsupported-title">
    <h1 id="unsupported-title">{{ $t('unsupported.title') }}</h1>
    <p>{{ $t('unsupported.message') }}</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  name: 'unsupported',
  // Pre-gate surface — never wrapped in the authenticated admin shell (D11/task 15.3).
  layout: false,
})

const { t } = useI18n()

useHead({
  // WCAG 2.4.2 (Page Titled): non-empty <title> required — and the title is
  // user-facing, so it goes through i18n exactly like the <h1> below it.
  title: () => t('head.title.unsupported'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>
