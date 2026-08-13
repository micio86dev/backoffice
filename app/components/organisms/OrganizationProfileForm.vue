<template>
  <form data-testid="organization-profile-form" novalidate @submit.prevent="onSubmit">
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
          :aria-invalid="Boolean(error)"
          :aria-describedby="error ? 'organization-profile-name-error' : undefined"
          data-testid="organization-profile-name"
          @blur="validateName"
        />
        <FieldError
          v-if="error"
          id="organization-profile-name-error"
          data-testid="organization-profile-name-error"
        >
          {{ error }}
        </FieldError>
      </Field>

      <Alert
        v-if="formMessage"
        :variant="formMessage.kind === 'error' ? 'destructive' : 'default'"
        role="alert"
        aria-live="polite"
        data-testid="organization-profile-banner"
      >
        <AlertDescription>{{ formMessage.text }}</AlertDescription>
      </Alert>

      <Button type="submit" :disabled="saving" data-testid="organization-profile-submit">
        {{ $t('projects.action.save') }}
      </Button>
    </FieldGroup>
  </form>
</template>

<script setup lang="ts">
// Organization profile form (D2/D9): name-only edit, slug read-only display
// (a tenancy identifier, never editable). Two-level feedback contract per
// login.vue.
import { ref } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { getErrorFields } from '@/utils/http-error'

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
const formMessage = ref<{ kind: 'error' | 'success'; text: string } | null>(null)

function validateName(): boolean {
  error.value = name.value.trim() === '' ? t('settings.organization.nameRequired') : undefined
  return !error.value
}

async function onSubmit(): Promise<void> {
  formMessage.value = null
  if (!validateName()) return

  saving.value = true
  try {
    await updateOrganization({ name: name.value })
    emit('saved')
  } catch (submitError) {
    const fields = getErrorFields(submitError)
    if (fields?.['name']) error.value = fields['name'][0]
    formMessage.value = { kind: 'error', text: t('settings.organization.saveError') }
  } finally {
    saving.value = false
  }
}
</script>
