<template>
  <form data-testid="webhook-defaults-form" novalidate @submit.prevent="onSubmit">
    <FieldGroup>
      <!--
        form-clarity-and-console-warnings, D6: `settings.webhooks.note`
        describes the URL AND the secret as a PAIR ("copied onto a new project
        only at the moment it is created"), so it belongs to this FieldSet, not
        to either control alone — it previously sat as a bare sibling inside
        FieldGroup, orphaned from both. The ApiKeysPanel.vue:76-83 pattern.
      -->
      <FieldSet>
        <FieldLegend variant="label" class="sr-only">{{
          $t('settings.tabs.webhooks')
        }}</FieldLegend>
        <Field :data-invalid="Boolean(error)">
          <FieldLabel for="webhook-defaults-url">{{ $t('settings.webhooks.url') }}</FieldLabel>
          <Input
            id="webhook-defaults-url"
            v-model="url"
            type="url"
            autocomplete="off"
            :aria-invalid="Boolean(error)"
            :aria-describedby="describedBy"
            data-testid="webhook-defaults-url"
          />
          <FieldDescription id="webhook-defaults-url-help">
            {{ $t('settings.webhooks.help.url') }}
          </FieldDescription>
          <FieldError
            v-if="error"
            id="webhook-defaults-url-error"
            data-testid="webhook-defaults-url-error"
            >{{ error }}</FieldError
          >
        </Field>

        <WriteOnlySecretField
          id="webhook-defaults-secret"
          :label="$t('settings.webhooks.secret')"
          :configured="organization.has_default_webhook_secret"
          @update:value="(value) => (secret = value)"
        />

        <FieldDescription>{{ $t('settings.webhooks.note') }}</FieldDescription>
      </FieldSet>

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
import { computed, ref } from 'vue'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import WriteOnlySecretField from '@/components/molecules/WriteOnlySecretField.vue'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { isUrlLengthValid } from '@/utils/project-field-specs'
import { applyServerFieldErrors } from '@/utils/http-error'

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

const describedBy = computed(() =>
  [error.value ? 'webhook-defaults-url-error' : null, 'webhook-defaults-url-help']
    .filter((id): id is string => id !== null)
    .join(' ')
)

// `default_webhook_secret` has no entry: the molecule owns no error slot of
// its own (it is write-only by design, D7), so a 422 on it surfaces via the
// form-level banner rather than being discarded.
const SERVER_FIELD_TO_ERROR_KEY = { default_webhook_url: 'url' } as const

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
  } catch (submitError) {
    const unmapped = applyServerFieldErrors(
      submitError,
      SERVER_FIELD_TO_ERROR_KEY,
      (_key, message) => {
        error.value = message
      }
    )
    formMessage.value =
      unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('settings.webhooks.saveError')
  } finally {
    saving.value = false
  }
}
</script>
