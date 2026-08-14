<template>
  <!--
    Deliberately non-compliant, on all three axes at once — this fixture
    exists so `form-contract.spec.ts` can prove the guard actually detects a
    violation, not just that it passes vacuously against a repo where every
    real form already complies.
  -->
  <form @submit.prevent="onSubmit">
    <input v-model="name" />
    <button type="submit">Save</button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const name = ref('')

async function onSubmit(): Promise<void> {
  try {
    await Promise.resolve()
  } catch {
    // Bare catch — the exact defect this guard's third rule exists to catch:
    // a server validation failure silently discarded instead of reaching the
    // shared field-error mapper.
  }
}
</script>
