<template>
  <form data-testid="webhook-defaults-form" novalidate @submit.prevent="onSubmit">
    <FieldGroup>
      <Field :data-invalid="Boolean(error)">
        <FieldLabel for="webhook-defaults-url">{{ $t('settings.webhooks.url') }}</FieldLabel>
        <Input
          id="webhook-defaults-url"
          v-model="url"
          type="url"
          :aria-invalid="Boolean(error)"
          :aria-describedby="error ? 'webhook-defaults-url-error' : undefined"
          data-testid="webhook-defaults-url"
        />
        <FieldError v-if="error" id="webhook-defaults-url-error">{{ error }}</FieldError>
      </Field>

      <WriteOnlySecretField
        id="webhook-defaults-secret"
        :label="$t('settings.webhooks.secret')"
        :configured="organization.has_default_webhook_secret"
        @update:value="(value) => (secret = value)"
      />

      <FieldDescription>{{ $t('settings.webhooks.note') }}</FieldDescription>

      <Alert
        v-if="formMessage"
        variant="destructive"
        role="alert"
        aria-live="polite"
        data-testid="webhook-defaults-banner"
      >
        <AlertDescription>{{ formMessage }}</AlertDescription>
      </Alert>

      <Button type="submit" :disabled="saving" data-testid="webhook-defaults-submit">
        {{ $t('projects.action.save') }}
      </Button>
    </FieldGroup>
  </form>
</template>

<script setup lang="ts">
// Webhook defaults form (D3/D9): the secret field is write-only
// (WriteOnlySecretField, never prefilled with `has_default_webhook_secret`'s
// underlying value — only its presence).
import { ref } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import WriteOnlySecretField from '@/components/molecules/WriteOnlySecretField.vue'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { isUrlLengthValid } from '@/utils/project-field-specs'

const props = defineProps<{
  organization: OrganizationResponse['data']
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updateOrganization } = useOrganization()
const { t } = useI18n()

const url = ref(props.organization.default_webhook_url ?? '')
const secret = ref<string | undefined>(undefined)
const error = ref<string | undefined>(undefined)
const saving = ref(false)
const formMessage = ref<string | null>(null)

async function onSubmit(): Promise<void> {
  formMessage.value = null
  error.value = isUrlLengthValid(url.value) ? undefined : t('settings.webhooks.invalidUrl')
  if (error.value) return

  saving.value = true
  try {
    await updateOrganization({
      default_webhook_url: url.value || null,
      ...(secret.value !== undefined ? { default_webhook_secret: secret.value } : {}),
    })
    emit('saved')
  } catch {
    formMessage.value = t('settings.webhooks.saveError')
  } finally {
    saving.value = false
  }
}
</script>
