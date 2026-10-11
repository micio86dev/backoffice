<template>
  <form data-testid="currency-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <!--
          Same split OrganizationProfileForm makes: an admin edits, everyone
          else reads. The section is visible on `organization.view`, which every
          role holds, while the API accepts `currency_code` only from
          `organization.update`.
        -->
        <Field v-if="!canUpdate">
          <dl class="flex flex-col gap-1">
            <dt class="text-sm font-medium">{{ $t('settings.currency.label') }}</dt>
            <dd class="text-muted-foreground text-sm" data-testid="currency-value">
              {{ label(selected) }}
            </dd>
          </dl>
        </Field>

        <Field v-else :data-invalid="Boolean(error)">
          <FieldLabel for="currency-select">{{ $t('settings.currency.label') }}</FieldLabel>
          <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
          <select
            id="currency-select"
            v-model="selected"
            data-testid="currency-select"
            autocomplete="off"
            :class="formSelectClass"
            :aria-invalid="Boolean(error)"
            :aria-describedby="describedBy"
          >
            <option v-for="code in codes" :key="code" :value="code">{{ label(code) }}</option>
          </select>
          <FieldDescription id="currency-select-help">{{
            $t('settings.currency.help')
          }}</FieldDescription>
          <FieldError v-if="error" id="currency-select-error" data-testid="currency-error">{{
            error
          }}</FieldError>
        </Field>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="currency-banner"
        />

        <Button v-if="canUpdate" type="submit" :loading="saving" data-testid="currency-submit">
          {{ $t('projects.action.save') }}
        </Button>
      </FieldGroup>
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
/**
 * The organization's display currency (organization-currencies, OC-07a).
 *
 * Display only: amounts stay stored in USD and are converted at render time.
 * Options are the ACTIVE catalogue rows, labelled `code (symbol)` — the
 * catalogue carries no names and none are invented here.
 */
import { computed, onMounted, ref } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import { formSelectClass } from '@/components/ui/form-control'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { useOrganization, type OrganizationRecord } from '@/composables/useOrganization'
import { useCurrencies } from '@/composables/useCurrencies'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCodes } from '@/utils/server-message'

const props = defineProps<{
  organization: Pick<OrganizationRecord, 'currency_code'>
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updateOrganization } = useOrganization()
const { currencies, ensureLoaded } = useCurrencies()
const { can } = useCurrentUser()
const { t, te } = useI18n()

// Fails closed, so a transient `/auth/me` error renders the read-only shape.
const canUpdate = computed(() => can('organization.update'))

const selected = ref(props.organization.currency_code)
const error = ref<string | undefined>(undefined)
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const saving = ref(false)

// A currency deactivated after being chosen is no longer listed; keep the
// current value selectable so the control never shows a blank.
const codes = computed(() => {
  const active = (currencies.value ?? []).map((c) => c.code)

  return active.includes(props.organization.currency_code)
    ? active
    : [props.organization.currency_code, ...active]
})

const describedBy = computed(() =>
  [error.value ? 'currency-select-error' : null, 'currency-select-help']
    .filter((id): id is string => id !== null)
    .join(' ')
)

function label(code: string): string {
  const symbol = currencies.value?.find((c) => c.code === code)?.symbol

  return symbol === undefined ? code : `${code} (${symbol})`
}

onMounted(async () => {
  try {
    await ensureLoaded()
  } catch {
    formMessage.value = { kind: 'error', text: t('settings.currency.loadError') }
  }
})

async function onSubmit(): Promise<void> {
  if (!canUpdate.value) return

  error.value = undefined
  formMessage.value = null
  saving.value = true

  try {
    await updateOrganization({ currency_code: selected.value })
    formMessage.value = { kind: 'success', text: t('settings.currency.saved') }
    emit('saved')
  } catch (submitError) {
    const unmapped = applyServerFieldErrors(
      submitError,
      { currency_code: 'currency' } as const,
      (_key, message) => {
        error.value = translateServerCodes({ t, te }, 'settings.currency.serverError', [message])[0]
      }
    )

    formMessage.value =
      unmapped && unmapped.length > 0
        ? {
            kind: 'error',
            text: translateServerCodes({ t, te }, 'settings.currency.serverError', unmapped).join(
              ' '
            ),
          }
        : error.value !== undefined
          ? null
          : { kind: 'error', text: t('settings.currency.saveError') }
  } finally {
    saving.value = false
  }
}
</script>
