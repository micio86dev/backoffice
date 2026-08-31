<template>
  <div class="flex flex-col gap-4">
    <!-- The section title lives in the settings page header; repeating it
         here would give the panel two competing headings (same doctrine as
         ApiKeysPanel.vue). -->
    <div class="flex items-center justify-end">
      <Button data-testid="llm-credentials-new" @click="openCreateDialog">
        {{ $t('settings.llmCredentials.new') }}
      </Button>
    </div>

    <Alert
      v-if="removeConflict"
      variant="destructive"
      role="alert"
      aria-live="polite"
      data-testid="llm-credential-remove-conflict"
    >
      <AlertDescription>
        {{ $t('settings.llmCredentials.removeConflict') }}
        <span data-testid="llm-credential-remove-conflict-templates">{{
          removeConflict.templates.join(', ')
        }}</span>
      </AlertDescription>
    </Alert>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('settings.llmCredentials.table.name') }}</TableHead>
          <TableHead>{{ $t('settings.llmCredentials.table.vendor') }}</TableHead>
          <TableHead>{{ $t('settings.llmCredentials.table.key') }}</TableHead>
          <TableHead>{{ $t('settings.llmCredentials.table.status') }}</TableHead>
          <TableHead>
            <span class="sr-only">{{ $t('settings.llmCredentials.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="credentials.length === 0" :colspan="5">
          {{ $t('settings.llmCredentials.empty') }}
        </TableEmpty>
        <TableRow v-for="credential in credentials" :key="credential.id">
          <TableCell>{{ credential.name }}</TableCell>
          <TableCell>{{ vendorLabel(credential.vendor) }}</TableCell>
          <!-- The API NEVER returns api_key — key_last_four IS the mask,
               not a client-side truncation of a real value. -->
          <TableCell class="font-mono text-sm">•••• {{ credential.key_last_four }}</TableCell>
          <TableCell>
            <Badge
              :variant="statusOf(credential).variant"
              :data-testid="`llm-credential-status-${credential.id}`"
            >
              {{ $t(statusOf(credential).labelKey) }}
            </Badge>
          </TableCell>
          <TableCell class="flex justify-end gap-2 text-right">
            <Button
              variant="outline"
              size="sm"
              :data-testid="`llm-credential-rotate-${credential.id}`"
              @click="openRotateDialog(credential)"
            >
              {{ $t('settings.llmCredentials.rotate') }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              :data-testid="`llm-credential-remove-${credential.id}`"
              @click="removeTarget = credential"
            >
              {{ $t('settings.llmCredentials.remove') }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!--
      Right-side drawer, not a centred dialog (feature/form-drawer). `id` is
      load-bearing, not decoration: the submit control lives in the drawer's
      non-scrolling footer, OUTSIDE this form, and
      `<button form="llm-credential-form">` is what connects the two.
    -->
    <FormDrawer
      :open="creating"
      :title="$t('settings.llmCredentials.new')"
      form-id="llm-credential-form"
      :pending="creatingBusy"
      :submit-label="$t('settings.llmCredentials.create')"
      @update:open="(open) => !open && closeCreateDialog()"
    >
      <form
        id="llm-credential-form"
        data-testid="llm-credential-form"
        novalidate
        @submit.prevent="onCreate"
      >
        <FieldGroup>
          <Field :data-invalid="Boolean(errors.name)">
            <FieldLabel for="llm-credential-form-name">{{
              $t('settings.llmCredentials.name')
            }}</FieldLabel>
            <Input
              id="llm-credential-form-name"
              v-model="name"
              autocomplete="off"
              :aria-invalid="Boolean(errors.name)"
              :aria-describedby="errors.name ? 'llm-credential-form-name-error' : undefined"
              data-testid="llm-credential-form-name"
            />
            <FieldError
              v-if="errors.name"
              id="llm-credential-form-name-error"
              data-testid="llm-credential-form-name-error"
              >{{ errors.name }}</FieldError
            >
          </Field>
          <!-- Only one vendor exists server-side (`in:google`) — a picker
                 with a single, unremovable option is a control whose only
                 outcome is itself, so this states the fact instead. -->
          <FieldDescription data-testid="llm-credential-form-vendor-note">
            {{ $t('settings.llmCredentials.vendorNote') }}
          </FieldDescription>
          <!--
              No outer `<Field>` wrapper here — WriteOnlySecretField already
              renders its OWN `<Field>` internally (its own template root),
              so wrapping it again would nest two. `FieldError` needs no
              Field ancestor (it is a standalone, styled paragraph), so it is
              a plain sibling instead.
            -->
          <WriteOnlySecretField
            id="llm-credential-form-api-key"
            :label="$t('settings.llmCredentials.apiKey')"
            :configured="false"
            @update:value="(value) => (apiKeyDraft = value)"
          />
          <FieldError
            v-if="errors.apiKey"
            id="llm-credential-form-api-key-error"
            data-testid="llm-credential-form-api-key-error"
            >{{ errors.apiKey }}</FieldError
          >
          <Alert
            v-if="formMessage"
            variant="destructive"
            role="alert"
            aria-live="polite"
            data-testid="llm-credential-form-banner"
          >
            <AlertDescription>{{ formMessage }}</AlertDescription>
          </Alert>
          <!--
              No submit control here — it lives in FormDrawer's non-scrolling
              footer, wired back by this form's `id`.
            -->
        </FieldGroup>
      </form>
    </FormDrawer>

    <!--
      Rotation is a FORM, not a confirmation: it takes a new secret the
      operator types, and it can be rejected field-by-field. So it gets the
      same drawer treatment as create (feature/form-drawer). Only the REMOVE
      step below stays a ConfirmDialog — that one asks a yes/no question and
      collects nothing.
    -->
    <FormDrawer
      :open="rotateTarget !== null"
      :title="$t('settings.llmCredentials.rotateTitle')"
      form-id="llm-credential-rotate-form"
      :pending="rotateBusy"
      :submit-label="$t('settings.llmCredentials.rotateSubmit')"
      @update:open="(open) => !open && closeRotateDialog()"
    >
      <form
        id="llm-credential-rotate-form"
        data-testid="llm-credential-rotate-form"
        novalidate
        @submit.prevent="onRotate"
      >
        <FieldGroup>
          <WriteOnlySecretField
            id="llm-credential-rotate-api-key"
            :label="$t('settings.llmCredentials.rotateNewKey')"
            :configured="true"
            @update:value="(value) => (rotateApiKeyDraft = value)"
          />
          <FieldError
            v-if="rotateError"
            id="llm-credential-rotate-error"
            data-testid="llm-credential-rotate-error"
            >{{ rotateError }}</FieldError
          >
        </FieldGroup>
      </form>
    </FormDrawer>

    <Alert
      v-if="rotateSuccessMessage"
      variant="success"
      role="status"
      aria-live="polite"
      data-testid="llm-credential-rotate-success"
    >
      <AlertDescription>{{ rotateSuccessMessage }}</AlertDescription>
    </Alert>

    <ConfirmDialog
      :open="removeTarget !== null"
      :title="$t('settings.llmCredentials.confirmRemoveTitle')"
      :description="$t('settings.llmCredentials.confirmRemoveDescription')"
      :confirm-label="$t('settings.llmCredentials.remove')"
      variant="destructive"
      @confirm="onRemoveConfirmed"
      @cancel="removeTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
// LLM credentials panel (pluggable-conversation-llm PR P7, design D2/D9).
//
// `key_last_four` IS the masking — the API never returns `api_key` at all
// (`$hidden` on the model, absent from `LlmCredentialResource::toArray()`),
// so there is nothing here to truncate client-side. Entering/rotating a key
// reuses `WriteOnlySecretField` UNCHANGED: it carries no `value` prop, so it
// structurally cannot render a stored secret back to the operator.
//
// There is no separate "verify" action (design D9 refuses a
// validate-without-storing endpoint as an oracle risk) — validation happens
// INLINE on create/rotate, and the resulting state (`validated_at` /
// `validation_error`) is read straight off the returned resource.
import { ref, onMounted } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import WriteOnlySecretField from '@/components/molecules/WriteOnlySecretField.vue'
import { useLlmCredentials } from '@/composables/useLlmCredentials'
import type { LlmCredential, LlmCredentialValidationError } from '@/types/llm'
import { applyServerFieldErrors, getConflictTemplates, getErrorFields } from '@/utils/http-error'

const { listCredentials, createCredential, rotateCredential, deleteCredential } =
  useLlmCredentials()
const { t } = useI18n()

const credentials = ref<LlmCredential[]>([])

/**
 * A stable code (design D9), never Google's prose — mapped to a readable,
 * actionable message. `rate_limited`/`unreachable` describe a STORED,
 * unverified credential; `invalid_key` only ever reaches this function via a
 * create/rotate 422, since it is never persisted.
 */
const VALIDATION_ERROR_KEY: Record<LlmCredentialValidationError, string> = {
  invalid_key: 'settings.llmCredentials.error.invalidKey',
  rate_limited: 'settings.llmCredentials.error.rateLimited',
  unreachable: 'settings.llmCredentials.error.unreachable',
}

function describeValidationError(code: string): string {
  const key = VALIDATION_ERROR_KEY[code as LlmCredentialValidationError]
  return key ? t(key) : code
}

function vendorLabel(vendor: string): string {
  const key = `settings.llmCredentials.vendor.${vendor}`
  return t(key)
}

/**
 * Three DISTINCT states, never collapsed into one badge: verified
 * (`validated_at` non-null), and two stored-but-unverified reasons
 * (`rate_limited` / `unreachable`) that read differently from each other AND
 * from verified. A rejected key (`invalid_key`) never reaches this function —
 * it is refused with a 422 and never stored (D9's asymmetric store rule).
 */
function statusOf(credential: LlmCredential): {
  labelKey: string
  variant: 'default' | 'secondary'
} {
  if (credential.validated_at !== null) {
    return { labelKey: 'settings.llmCredentials.status.verified', variant: 'default' }
  }
  if (credential.validation_error === 'rate_limited') {
    return { labelKey: 'settings.llmCredentials.error.rateLimited', variant: 'secondary' }
  }
  if (credential.validation_error === 'unreachable') {
    return { labelKey: 'settings.llmCredentials.error.unreachable', variant: 'secondary' }
  }
  // Defensive only — the API always sets one of `validated_at` or
  // `validation_error` (D9). Never falls back to "verified": an unknown
  // state must never read as a stronger guarantee than it is.
  return { labelKey: 'settings.llmCredentials.status.unknown', variant: 'secondary' }
}

async function load(): Promise<void> {
  const response = await listCredentials()
  credentials.value = response.data
}

// --- Create ---

const creating = ref(false)
const creatingBusy = ref(false)
const name = ref('')
const apiKeyDraft = ref<string | undefined>(undefined)
const errors = ref<{ name?: string; apiKey?: string }>({})
const formMessage = ref<string | null>(null)

function openCreateDialog(): void {
  creating.value = true
}

function closeCreateDialog(): void {
  creating.value = false
  name.value = ''
  apiKeyDraft.value = undefined
  errors.value = {}
  formMessage.value = null
}

const CREATE_FIELD_TO_ERROR_KEY = {
  name: 'name',
  api_key: 'apiKey',
} as const satisfies Record<string, keyof typeof errors.value>

async function onCreate(): Promise<void> {
  formMessage.value = null
  errors.value.name =
    name.value.trim() === '' ? t('settings.llmCredentials.nameRequired') : undefined
  errors.value.apiKey =
    !apiKeyDraft.value || apiKeyDraft.value.trim() === ''
      ? t('settings.llmCredentials.apiKeyRequired')
      : undefined
  if (errors.value.name || errors.value.apiKey) return

  creatingBusy.value = true
  try {
    await createCredential({ name: name.value, vendor: 'google', api_key: apiKeyDraft.value! })
    closeCreateDialog()
    await load()
  } catch (error) {
    // `applyServerFieldErrors` assigns the RAW server message. For `api_key`
    // that message IS a stable code (`invalid_key`), not prose — mapped
    // through `describeValidationError()` right here, so the template never
    // has to know the difference between a client-side message and a
    // mapped server code.
    const unmapped = applyServerFieldErrors(error, CREATE_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = key === 'apiKey' ? describeValidationError(message) : message
    })
    formMessage.value =
      unmapped && unmapped.length > 0
        ? unmapped.join(' ')
        : t('settings.llmCredentials.createError')
  } finally {
    creatingBusy.value = false
  }
}

// --- Rotate ---

const rotateTarget = ref<LlmCredential | null>(null)
const rotateApiKeyDraft = ref<string | undefined>(undefined)
const rotateBusy = ref(false)
const rotateError = ref<string | null>(null)
const rotateSuccessMessage = ref<string | null>(null)

function openRotateDialog(credential: LlmCredential): void {
  rotateTarget.value = credential
  rotateApiKeyDraft.value = undefined
  rotateError.value = null
  rotateSuccessMessage.value = null
}

function closeRotateDialog(): void {
  rotateTarget.value = null
  rotateApiKeyDraft.value = undefined
  rotateError.value = null
}

async function onRotate(): Promise<void> {
  if (rotateTarget.value === null || !rotateApiKeyDraft.value) return

  rotateError.value = null
  rotateBusy.value = true
  const id = rotateTarget.value.id
  try {
    await rotateCredential(id, { api_key: rotateApiKeyDraft.value })
    // The dialog closes on success so the typed value leaves the DOM
    // entirely — success is confirmed by a SEPARATE banner, never by
    // re-displaying what was just submitted.
    closeRotateDialog()
    rotateSuccessMessage.value = t('settings.llmCredentials.rotateSuccess')
    await load()
  } catch (error) {
    // Mirrors the create path: the server's `api_key` message on a rotate
    // 422 is the same stable code (design D9), mapped here rather than
    // shown verbatim.
    const code = getErrorFields(error)?.api_key?.[0]
    rotateError.value = code
      ? describeValidationError(code)
      : t('settings.llmCredentials.rotateError')
  } finally {
    rotateBusy.value = false
  }
}

// --- Remove ---

const removeTarget = ref<LlmCredential | null>(null)
const removeConflict = ref<{ message: string; templates: string[] } | null>(null)

async function onRemoveConfirmed(): Promise<void> {
  if (removeTarget.value === null) return
  const id = removeTarget.value.id
  removeTarget.value = null
  removeConflict.value = null

  try {
    await deleteCredential(id)
    await load()
  } catch (error) {
    const templates = getConflictTemplates(error, 'credential_in_use')
    if (templates !== null) {
      removeConflict.value = {
        message: (error as { data?: { message?: string } })?.data?.message ?? '',
        templates,
      }
      return
    }
    // An unrecognised shape still has to reach the operator — re-throwing
    // rather than swallowing it silently.
    throw error
  }
}

onMounted(() => {
  void load()
})
</script>
