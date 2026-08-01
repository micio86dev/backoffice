<template>
  <div>
    <p data-testid="health-status">ok</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  name: 'health',
  // Machine-facing infra check — never wrapped in the authenticated admin
  // shell (D11/task 15.3).
  layout: false,
})

// WCAG 2.4.2 (Page Titled): every page needs a non-empty <title>.
useHead({
  title: 'Health',
})
</script>
