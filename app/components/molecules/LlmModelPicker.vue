<template>
  <Field>
    <FieldLabel :for="id">{{ label }}</FieldLabel>
    <select
      :id="id"
      data-testid="llm-model-picker"
      autocomplete="off"
      :class="formControlClass"
      :value="modelValue ?? ''"
      @change="onChange"
    >
      <!--
      Absent means "provider default" — the same doctrine
      AvatarTemplateForm.vue already uses for an unset config knob: without a
      way back to absent, an operator who binds a model could never unbind it
      again from this control.
    -->
      <option value="">{{ $t('avatar_templates.llm.picker.none') }}</option>

      <optgroup :label="$t('avatar_templates.llm.picker.groupManaged')">
        <option
          v-for="model in managedModels"
          :key="model.key"
          :value="model.key"
          :disabled="!isSelectable(model)"
        >
          {{ model.display_name }}
          <template v-if="!model.is_available">
            {{ ' ' }}({{ $t('avatar_templates.llm.picker.withdrawn') }})
          </template>
        </option>
      </optgroup>

      <!--
      Rendered AND disabled — deliberately, not hidden (admin-backoffice spec
      delta): showing this group answers "does BEAI support real-time voice
      models" without a support ticket, and its disabled state answers "not
      yet" honestly. The server rejects `native_duplex` with 422
      `mode_unsupported` (I2), so this control must never let one through —
      the whole `<optgroup disabled>` PLUS each `<option disabled>` is
      belt-and-suspenders against a test environment that does not honour the
      HTML disabled-option selection rule.
    -->
      <optgroup :label="$t('avatar_templates.llm.picker.groupLive')" disabled>
        <option v-for="model in liveModels" :key="model.key" :value="model.key" disabled>
          {{ model.display_name }}
        </option>
      </optgroup>
    </select>
  </Field>
</template>

<script setup lang="ts">
// LlmModelPicker (pluggable-conversation-llm PR P8, design D0/D1/D4 I2/I5).
//
// Grouped by MODE, not by vendor: "Text (managed)" is the only enabled group
// today, and "Live — coming soon" exists to be seen, not to be used (I2 makes
// `native_duplex` a 422 server-side regardless of what this control allows,
// but the control must never offer it as if it worked).
//
// Selected by `key` — the vendor's own model id (design D1's natural key) —
// because `LlmModelResource` does not serialize a numeric `id`. There is no
// numeric id anywhere on this wire; see `types/llm.ts`'s `LlmModel` docblock.
//
// I5's grandfathering trap: a model already bound to THIS template
// (`modelValue === model.key`) stays selectable even when `is_available`
// turns false, because the invariant is gated on `isDirty('llm_model_id')`
// server-side — unbinding or leaving it alone must both keep working. Any
// OTHER unavailable model stays disabled, exactly like a Live model, because
// binding one FOR THE FIRST TIME is exactly what I5 refuses.
import { computed } from 'vue'
import { Field, FieldLabel } from '@/components/ui/field'
import { formControlClass } from '@/components/ui/form-control'
import type { LlmModel } from '@/types/llm'

const props = defineProps<{
  id: string
  label: string
  models: LlmModel[]
  /** The bound model's `key`, or `null` — no binding (provider default). */
  modelValue: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const managedModels = computed(() => props.models.filter((model) => model.mode === 'managed'))
const liveModels = computed(() => props.models.filter((model) => model.mode === 'native_duplex'))

function isSelectable(model: LlmModel): boolean {
  if (model.is_available) return true

  // Grandfathered: this template is ALREADY bound to it (I5 is gated on
  // `isDirty('llm_model_id')`), so leaving it selected — or unbinding it —
  // must keep working even though it can no longer be chosen fresh.
  return model.key === props.modelValue
}

function onChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  const selectedOption = select.selectedOptions[0]

  // Defence in depth: `disabled` on an `<option>`/`<optgroup>` already stops
  // a real user picking it, but a script (or a test environment that does
  // not enforce the HTML rule) can still assign `.value` directly. Reverting
  // here is what makes "the UI must never let it be submitted" (I2) true
  // regardless of how the change was triggered.
  if (selectedOption?.disabled) {
    select.value = props.modelValue ?? ''
    return
  }

  emit('update:modelValue', select.value === '' ? null : select.value)
}
</script>
