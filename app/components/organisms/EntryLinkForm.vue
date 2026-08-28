<template>
  <!--
    `id` is load-bearing, not decoration (feature/form-drawer): the submit
    control lives in FormDrawer's non-scrolling footer, OUTSIDE this element,
    and `<button form="entry-link-form">` is what connects the two.
  -->
  <form id="entry-link-form" data-testid="entry-link-form" novalidate @submit.prevent="onSubmit">
    <FieldGroup>
      <Field :data-invalid="Boolean(errors.candidateRef)">
        <FieldLabel for="entry-link-form-candidate-ref">
          {{ $t('entryLink.form.candidateRef') }}
        </FieldLabel>
        <Input
          id="entry-link-form-candidate-ref"
          v-model="candidateRef"
          autocomplete="off"
          :aria-invalid="Boolean(errors.candidateRef)"
          :aria-describedby="
            errors.candidateRef ? 'entry-link-form-candidate-ref-error' : undefined
          "
          data-testid="entry-link-form-candidate-ref"
        />
        <FieldError
          v-if="errors.candidateRef"
          id="entry-link-form-candidate-ref-error"
          data-testid="entry-link-form-candidate-ref-error"
        >
          {{ errors.candidateRef }}
        </FieldError>
      </Field>

      <Field :data-invalid="Boolean(errors.displayName)">
        <FieldLabel for="entry-link-form-display-name">
          {{ $t('entryLink.form.displayName') }}
        </FieldLabel>
        <Input
          id="entry-link-form-display-name"
          v-model="displayName"
          autocomplete="off"
          :aria-invalid="Boolean(errors.displayName)"
          :aria-describedby="errors.displayName ? 'entry-link-form-display-name-error' : undefined"
          data-testid="entry-link-form-display-name"
        />
        <FieldError
          v-if="errors.displayName"
          id="entry-link-form-display-name-error"
          data-testid="entry-link-form-display-name-error"
        >
          {{ errors.displayName }}
        </FieldError>
      </Field>

      <Alert
        v-if="formMessage"
        variant="destructive"
        role="alert"
        aria-live="polite"
        data-testid="entry-link-form-banner"
      >
        <AlertDescription>{{ formMessage }}</AlertDescription>
      </Alert>

      <!--
        No submit control here — it lives in FormDrawer's non-scrolling footer
        (feature/form-drawer), wired back to this form by its `id`.
      -->
    </FieldGroup>
  </form>
</template>

<script setup lang="ts">
// EntryLinkForm — "Invite candidate" surface (design D4): candidate_ref +
// display_name only. project_id is known from context (the project row the
// operator opened the dialog from), never a third field to pick.
import { ref, watch } from 'vue'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useEntryLinks, type GenerateEntryLinkResponse } from '@/composables/useEntryLinks'
import { applyServerFieldErrors } from '@/utils/http-error'

const MAX_LENGTH = 255

const props = defineProps<{
  projectId: number
}>()

const emit = defineEmits<{
  (e: 'success', link: GenerateEntryLinkResponse): void
  /**
   * feature/form-drawer. This form owns its own request (and therefore its own
   * in-flight flag), but the submit control it belongs to now lives in the
   * drawer footer above it. Publishing the flag is what lets the shared footer
   * disable that control.
   */
  (e: 'update:pending', value: boolean): void
}>()

const { generateEntryLink } = useEntryLinks()
const { t } = useI18n()

const candidateRef = ref('')
const displayName = ref('')
const errors = ref<{ candidateRef?: string; displayName?: string }>({})
const formMessage = ref<string | null>(null)
const submitting = ref(false)

// `immediate` so the drawer footer starts from this form's truth rather than
// from its own prop default.
watch(submitting, (value) => emit('update:pending', value), { immediate: true })

function validateField(value: string, requiredKey: string, tooLongKey: string): string | undefined {
  if (value.trim() === '') return t(requiredKey)
  if (value.length > MAX_LENGTH) return t(tooLongKey, { max: MAX_LENGTH })
  return undefined
}

function validate(): boolean {
  errors.value.candidateRef = validateField(
    candidateRef.value,
    'entryLink.form.candidateRefRequired',
    'entryLink.form.tooLong'
  )
  errors.value.displayName = validateField(
    displayName.value,
    'entryLink.form.displayNameRequired',
    'entryLink.form.tooLong'
  )

  return !errors.value.candidateRef && !errors.value.displayName
}

const SERVER_FIELD_TO_ERROR_KEY = {
  candidate_ref: 'candidateRef',
  display_name: 'displayName',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  if (!validate()) return

  submitting.value = true
  try {
    const response = await generateEntryLink({
      project_id: props.projectId,
      candidate_ref: candidateRef.value,
      display_name: displayName.value,
    })
    emit('success', response)
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = message
    })
    // A field with no control of its own (e.g. role_code/project_id) still
    // has to reach the operator — the server's own message beats a generic
    // banner that hides it.
    formMessage.value =
      unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('entryLink.form.saveError')
  } finally {
    submitting.value = false
  }
}
</script>
