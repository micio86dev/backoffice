<template>
  <form data-testid="webhook-defaults-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
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

        <!-- The shared banner: see BrandingForm. -->
        <FormMessage
          v-if="formMessage"
          kind="error"
          :text="formMessage"
          test-id="webhook-defaults-banner"
        />

        <Button type="submit" :loading="saving" data-testid="webhook-defaults-submit">
          {{ $t('projects.action.save') }}
        </Button>
      </FieldGroup>
    </FormFieldset>
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
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage from '@/components/molecules/FormMessage.vue'
import WriteOnlySecretField from '@/components/molecules/WriteOnlySecretField.vue'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { isProjectUrlValid, isUrlLengthValid } from '@/utils/project-field-specs'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCodes } from '@/utils/server-message'

const props = defineProps<{
  organization: OrganizationResponse['data']
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updateOrganization } = useOrganization()
const { t, te } = useI18n()

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
  // `isProjectUrlValid`, not `isUrlLengthValid`. The length predicate accepts
  // ANYTHING under 2048 characters, so `not-a-url`, `ftp://x` and
  // `javascript:alert(1)` all passed and came back as a 422 the operator had
  // to wait for — while the message they eventually saw promised a scheme
  // check nothing performed. `isProjectUrlValid` is written for this exact
  // field and says so in its own docblock; it was simply never called.
  //
  // Length keeps its OWN message: telling someone their 3000-character
  // https:// URL does not start with http:// is false, and it is the one
  // rejection where the operator can see the field is obviously fine.
  error.value = !isUrlLengthValid(url.value)
    ? t('settings.webhooks.urlTooLong')
    : isProjectUrlValid(url.value)
      ? undefined
      : t('settings.webhooks.invalidUrl')
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
        // A CODE, never a sentence. The endpoint is machine-facing and this
        // is the only layer that knows the operator's language; assigning
        // `message` put English Laravel prose into an Italian field error.
        error.value = translateServerCodes({ t, te }, 'settings.webhooks.serverError', [message])[0]
      }
    )
    // When a 422 mapped cleanly the operator already has the exact reason
    // under the control; stacking the generic banner on top invites a retry
    // that will fail identically. Same guard BrandingForm applies.
    formMessage.value =
      unmapped && unmapped.length > 0
        ? translateServerCodes({ t, te }, 'settings.webhooks.serverError', unmapped).join(' ')
        : error.value !== undefined
          ? null
          : t('settings.webhooks.saveError')
  } finally {
    saving.value = false
  }
}
</script>
