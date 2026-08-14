<template>
  <!--
    Deliberately non-compliant, on both axes at once — this fixture exists
    so `destructive-action.spec.ts` can prove the guard actually detects a
    violation, not just that it passes vacuously against a repo where every
    real destructive call site already complies.
  -->
  <button type="button" @click="deleteThing(target)">Delete</button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const target = ref({ id: 1 })

function deleteThing(item: { id: number }): void {
  // R2 violation too: a native confirm(), never used anywhere in this repo.
  if (!window.confirm('Are you sure?')) return
  console.log('deleting', item.id)
}
</script>
