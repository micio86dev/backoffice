<template>
  <!--
    Deliberately non-compliant on R3 ONLY — R1/R2 are satisfied so this
    fixture isolates the exact loophole a whole-file substring check has: the
    catch below never calls the mapper, it only NAMES it in a comment.
  -->
  <form novalidate @submit.prevent="onSubmit">
    <input v-model="name" />
    <FieldError v-if="error">{{ error }}</FieldError>
    <button type="submit">Save</button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FieldError } from '@/components/ui/field'

const name = ref('')
const error = ref<string | undefined>(undefined)

async function onSubmit(): Promise<void> {
  try {
    await Promise.resolve()
  } catch {
    // TODO: this should call applyServerFieldErrors, but it never does —
    // a whole-file substring check for the NAME would wrongly pass this file.
    error.value = 'Something went wrong.'
  }
}
</script>
