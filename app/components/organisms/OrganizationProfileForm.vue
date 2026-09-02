<template>
  <form data-testid="organization-profile-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <Field>
          <FieldLabel for="organization-profile-slug">{{
            $t('settings.organization.slug')
          }}</FieldLabel>
          <p
            id="organization-profile-slug"
            class="text-muted-foreground text-sm"
            data-testid="organization-profile-slug"
          >
            {{ organization.slug }}
          </p>
          <FieldDescription>{{ $t('settings.organization.slugReadOnly') }}</FieldDescription>
        </Field>

        <Field :data-invalid="Boolean(error)">
          <FieldLabel for="organization-profile-name">{{
            $t('settings.organization.name')
          }}</FieldLabel>
          <Input
            id="organization-profile-name"
            v-model="name"
            autocomplete="off"
            :aria-invalid="Boolean(error)"
            :aria-describedby="describedBy"
            data-testid="organization-profile-name"
            @blur="validateName"
          />
          <FieldDescription id="organization-profile-name-help">
            {{ $t('settings.organization.help.name') }}
          </FieldDescription>
          <FieldError
            v-if="error"
            id="organization-profile-name-error"
            data-testid="organization-profile-name-error"
          >
            {{ error }}
          </FieldError>
        </Field>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="organization-profile-banner"
        />

        <Button type="submit" :loading="saving" data-testid="organization-profile-submit">
          {{ $t('projects.action.save') }}
        </Button>
      </FieldGroup>
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
// Organization profile form (D2/D9): name-only edit, slug read-only display
// (a tenancy identifier, never editable). Two-level feedback contract per
// login.vue.
import { computed, ref } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { applyServerFieldErrors } from '@/utils/http-error'

const props = defineProps<{
  organization: OrganizationResponse['data']
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updateOrganization } = useOrganization()
const { t } = useI18n()

const name = ref(props.organization.name)
const error = ref<string | undefined>(undefined)
const saving = ref(false)
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)

const describedBy = computed(() =>
  [error.value ? 'organization-profile-name-error' : null, 'organization-profile-name-help']
    .filter((id): id is string => id !== null)
    .join(' ')
)

function validateName(): boolean {
  error.value = name.value.trim() === '' ? t('settings.organization.nameRequired') : undefined
  return !error.value
}

// Single-field form: the map has one entry, but still runs through the
// shared mapper rather than a hand-rolled `getErrorFields(...)['name']`
// lookup, so this form stays covered by the arch guard's R3 rule.
const SERVER_FIELD_TO_ERROR_KEY = { name: 'name' } as const

async function onSubmit(): Promise<void> {
  formMessage.value = null
  if (!validateName()) return

  saving.value = true
  try {
    await updateOrganization({ name: name.value })
    emit('saved')
  } catch (submitError) {
    const unmapped = applyServerFieldErrors(
      submitError,
      SERVER_FIELD_TO_ERROR_KEY,
      (_key, message) => {
        error.value = message
      }
    )
    // A field with no control of its own (`slug`, read-only display) still
    // has to reach the operator — the server's own message beats a generic
    // banner that hides it.
    formMessage.value = {
      kind: 'error',
      text:
        unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('settings.organization.saveError'),
    }
  } finally {
    saving.value = false
  }
}
</script>
