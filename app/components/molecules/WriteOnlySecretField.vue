<template>
  <Field>
    <FieldLabel :for="id">{{ label }}</FieldLabel>
    <p class="text-muted-foreground text-sm" :data-testid="`${id}-status`">
      {{ configured ? $t('projects.secret.configured') : $t('projects.secret.notSet') }}
    </p>
    <Input
      :id="id"
      type="password"
      autocomplete="new-password"
      :placeholder="$t('projects.secret.placeholder')"
      :model-value="draft"
      :data-testid="id"
      @update:model-value="onInput"
    />
    <FieldDescription>{{ $t('projects.secret.setNew') }}</FieldDescription>
  </Field>
</template>

<script setup lang="ts">
// Write-only secret field (D8/D9): a secret is a WRITE, never a READ. There
// is deliberately no `value`/`modelValue` PROP here — a component that never
// receives the stored secret can never render it, which makes the leak this
// molecule prevents structural rather than a rendering discipline that a
// future edit could accidentally undo.
import { ref } from 'vue'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

defineProps<{
  id: string
  label: string
  configured: boolean
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string | undefined): void
}>()

const draft = ref('')

function onInput(value: string | number): void {
  draft.value = String(value)
  // Untouched or cleared back to empty means "no new value was supplied" —
  // the caller must omit the field from the write payload entirely, per
  // `UpdateOrganizationRequest`'s "omitting it leaves the stored value
  // unchanged" semantics (an empty string is a different, destructive intent
  // that no field in this form ever means).
  emit('update:value', draft.value === '' ? undefined : draft.value)
}
</script>
