<template>
  <div class="flex flex-col gap-4">
    <!-- Section title lives in the settings page header (same doctrine as
         LlmCredentialsPanel.vue). -->
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-muted-foreground" data-testid="currency-note">
        {{ $t('currencies.note') }}
      </p>
      <Button data-testid="currency-new" @click="openCreate">
        {{ $t('currencies.new') }}
      </Button>
    </div>

    <Alert
      v-if="banner"
      variant="destructive"
      role="alert"
      aria-live="polite"
      data-testid="currency-conflict"
    >
      <AlertDescription>{{ banner }}</AlertDescription>
    </Alert>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('currencies.table.code') }}</TableHead>
          <TableHead>{{ $t('currencies.table.symbol') }}</TableHead>
          <TableHead>{{ $t('currencies.table.decimals') }}</TableHead>
          <TableHead>{{ $t('currencies.table.rate') }}</TableHead>
          <TableHead>{{ $t('currencies.table.asOf') }}</TableHead>
          <TableHead>{{ $t('currencies.table.status') }}</TableHead>
          <TableHead>
            <span class="sr-only">{{ $t('currencies.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="loaded && rows.length === 0" :colspan="7">
          {{ $t('currencies.empty') }}
        </TableEmpty>
        <TableRow v-for="row in rows" :key="row.code" :data-testid="`currency-row-${row.code}`">
          <TableCell class="font-mono">{{ row.code }}</TableCell>
          <TableCell>{{ row.symbol }}</TableCell>
          <TableCell>{{ row.decimals }}</TableCell>
          <!-- The rate is shown verbatim, as the API returns it. -->
          <TableCell class="font-mono">{{ row.rate_per_usd ?? '' }}</TableCell>
          <TableCell>{{ row.rate_as_of ?? '' }}</TableCell>
          <TableCell class="flex flex-wrap gap-1">
            <Badge :variant="row.is_active ? 'default' : 'secondary'">
              {{ $t(row.is_active ? 'currencies.status.active' : 'currencies.status.inactive') }}
            </Badge>
            <Badge
              v-if="row.rate_per_usd === null"
              variant="outline"
              :data-testid="`currency-no-rate-${row.code}`"
            >
              {{ $t('currencies.status.noRate') }}
            </Badge>
          </TableCell>
          <TableCell class="text-right">
            <div class="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                :data-testid="`currency-edit-${row.code}`"
                @click="openEdit(row)"
              >
                {{ $t('currencies.edit') }}
                <span class="sr-only"> {{ row.code }}</span>
              </Button>
              <!-- USD is the base: the API refuses to deactivate or delete it,
                   so the controls are not offered at all. -->
              <template v-if="row.code !== BASE_CODE">
                <Button
                  variant="outline"
                  size="sm"
                  class="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  :aria-disabled="!canActivate(row) && !row.is_active ? 'true' : undefined"
                  :aria-describedby="
                    !row.is_active && row.rate_per_usd === null
                      ? `currency-activation-hint-${row.code}`
                      : undefined
                  "
                  :data-testid="`currency-toggle-${row.code}`"
                  @click="onToggle(row)"
                >
                  {{ $t(row.is_active ? 'currencies.deactivate' : 'currencies.activate') }}
                  <span class="sr-only"> {{ row.code }}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :data-testid="`currency-delete-${row.code}`"
                  @click="removeTarget = row"
                >
                  {{ $t('currencies.delete') }}
                  <span class="sr-only"> {{ row.code }}</span>
                </Button>
              </template>
            </div>
            <p
              v-if="!row.is_active && row.rate_per_usd === null"
              :id="`currency-activation-hint-${row.code}`"
              class="mt-1 text-xs text-muted-foreground"
              :data-testid="`currency-activation-hint-${row.code}`"
            >
              {{ $t('currencies.activationRequiresRate') }}
            </p>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <FormDrawer
      :open="formOpen"
      :title="
        editing ? $t('currencies.editTitle', { code: editing.code }) : $t('currencies.newTitle')
      "
      :form-id="formId"
      :pending="busy"
      :submit-label="editing ? $t('currencies.edit') : $t('currencies.create')"
      @update:open="(open) => !open && closeForm()"
    >
      <form :id="formId" :data-testid="formId" novalidate @submit.prevent="onSubmit">
        <FormFieldset :disabled="busy">
          <FieldGroup>
            <Field :data-invalid="Boolean(errors.code)">
              <FieldLabel :for="`${formId}-code`">{{ $t('currencies.field.code') }}</FieldLabel>
              <Input
                :id="`${formId}-code`"
                v-model="form.code"
                autocomplete="off"
                maxlength="3"
                :disabled="editing !== null"
                :aria-invalid="Boolean(errors.code)"
                :aria-describedby="errors.code ? `${formId}-code-error` : undefined"
                :data-testid="`${formId}-code`"
              />
              <FieldError
                v-if="errors.code"
                :id="`${formId}-code-error`"
                :data-testid="`${formId}-code-error`"
                >{{ errors.code }}</FieldError
              >
            </Field>
            <Field :data-invalid="Boolean(errors.symbol)">
              <FieldLabel :for="`${formId}-symbol`">{{ $t('currencies.field.symbol') }}</FieldLabel>
              <Input
                :id="`${formId}-symbol`"
                v-model="form.symbol"
                autocomplete="off"
                :aria-invalid="Boolean(errors.symbol)"
                :aria-describedby="errors.symbol ? `${formId}-symbol-error` : undefined"
                :data-testid="`${formId}-symbol`"
              />
              <FieldError
                v-if="errors.symbol"
                :id="`${formId}-symbol-error`"
                :data-testid="`${formId}-symbol-error`"
                >{{ errors.symbol }}</FieldError
              >
            </Field>
            <template v-if="!isBase">
              <Field :data-invalid="Boolean(errors.decimals)">
                <FieldLabel :for="`${formId}-decimals`">{{
                  $t('currencies.field.decimals')
                }}</FieldLabel>
                <Input
                  :id="`${formId}-decimals`"
                  v-model="form.decimals"
                  inputmode="numeric"
                  autocomplete="off"
                  :aria-invalid="Boolean(errors.decimals)"
                  :aria-describedby="errors.decimals ? `${formId}-decimals-error` : undefined"
                  :data-testid="`${formId}-decimals`"
                />
                <FieldError
                  v-if="errors.decimals"
                  :id="`${formId}-decimals-error`"
                  :data-testid="`${formId}-decimals-error`"
                  >{{ errors.decimals }}</FieldError
                >
              </Field>
              <!-- Text, not number: the rate is a decimal STRING end to end, so
                   the browser never gets to round it through a float. -->
              <Field :data-invalid="Boolean(errors.rate)">
                <FieldLabel :for="`${formId}-rate`">{{ $t('currencies.field.rate') }}</FieldLabel>
                <Input
                  :id="`${formId}-rate`"
                  v-model="form.rate"
                  inputmode="decimal"
                  autocomplete="off"
                  :aria-invalid="Boolean(errors.rate)"
                  :aria-describedby="errors.rate ? `${formId}-rate-error` : undefined"
                  :data-testid="`${formId}-rate`"
                />
                <FieldError
                  v-if="errors.rate"
                  :id="`${formId}-rate-error`"
                  :data-testid="`${formId}-rate-error`"
                  >{{ errors.rate }}</FieldError
                >
              </Field>
              <Field :data-invalid="Boolean(errors.asOf)">
                <FieldLabel :for="`${formId}-as-of`">{{ $t('currencies.field.asOf') }}</FieldLabel>
                <Input
                  :id="`${formId}-as-of`"
                  v-model="form.asOf"
                  type="date"
                  autocomplete="off"
                  :aria-invalid="Boolean(errors.asOf)"
                  :aria-describedby="errors.asOf ? `${formId}-as-of-error` : undefined"
                  :data-testid="`${formId}-as-of`"
                />
                <FieldError
                  v-if="errors.asOf"
                  :id="`${formId}-as-of-error`"
                  :data-testid="`${formId}-as-of-error`"
                  >{{ errors.asOf }}</FieldError
                >
              </Field>
            </template>
            <FieldDescription v-else>{{ $t('currencies.usdFixed') }}</FieldDescription>
            <Alert
              v-if="formMessage"
              variant="destructive"
              role="alert"
              aria-live="polite"
              :data-testid="`${formId}-banner`"
            >
              <AlertDescription>{{ formMessage }}</AlertDescription>
            </Alert>
          </FieldGroup>
        </FormFieldset>
      </form>
    </FormDrawer>

    <ConfirmDialog
      :open="removeTarget !== null"
      :title="$t('currencies.confirmDeleteTitle', { code: removeTarget?.code ?? '' })"
      :description="$t('currencies.confirmDeleteDescription')"
      :confirm-label="$t('currencies.delete')"
      variant="destructive"
      @confirm="onRemoveConfirmed"
      @cancel="removeTarget = null"
    />
    <ConfirmDialog
      :open="deactivateTarget !== null"
      :title="$t('currencies.confirmDeactivateTitle', { code: deactivateTarget?.code ?? '' })"
      :description="$t('currencies.confirmDeactivateDescription')"
      :confirm-label="$t('currencies.deactivate')"
      variant="destructive"
      @confirm="onDeactivateConfirmed"
      @cancel="deactivateTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
// Platform currency catalogue panel (organization-currencies OC-07b).
//
// The server is authoritative: client checks only save a round trip, and every
// 422 slug / 409 message is mapped to localized copy, never shown raw. The
// rate is a decimal STRING from the input to the request body.
import { computed, onMounted, reactive, ref } from 'vue'
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
import { FormFieldset } from '@/components/ui/form-fieldset'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import {
  useCurrencyCatalogue,
  type CatalogueCurrency,
  type UpdateCurrencyPayload,
} from '@/composables/useCurrencyCatalogue'
import { resolveResourceErrorState, type ResourceErrorState } from '@/utils/error-state'
import { applyServerFieldErrors, getErrorFields } from '@/utils/http-error'

const BASE_CODE = 'USD'
const SERVER_SLUGS = new Set([
  'currency_code_invalid',
  'currency_code_taken',
  'currency_code_immutable',
  'currency_symbol_invalid',
  'currency_decimals_invalid',
  'currency_rate_invalid',
  'currency_rate_as_of_invalid',
  'currency_active_invalid',
  'currency_activation_requires_rate',
])
const CONFLICT_SLUGS = new Set(['currency_in_use', 'currency_usd_immutable'])
// 403, 404 and an unrecognised 409 stay distinct from each other and from a
// plain failure (the shared D4 mapping), never one generic line.
const STATE_COPY: Partial<Record<ResourceErrorState, string>> = {
  forbidden: 'currencies.error.forbidden',
  'not-found': 'currencies.error.notFound',
  'not-ready': 'currencies.error.notReady',
}
const RATE_PATTERN = /^\d+(?:\.\d{1,6})?$/

const { listCurrencies, createCurrency, updateCurrency, removeCurrency } = useCurrencyCatalogue()
const { t } = useI18n()

const rows = ref<CatalogueCurrency[]>([])
const banner = ref<string | null>(null)
// Distinguishes "not fetched / fetch failed" from a genuinely empty catalogue.
const loaded = ref(false)

async function load(): Promise<void> {
  try {
    rows.value = await listCurrencies()
    loaded.value = true
  } catch (error) {
    banner.value = describeFailure(error, t('currencies.loadError'))
  }
}

function serverMessage(slug: string): string {
  return SERVER_SLUGS.has(slug) ? t(`currencies.serverError.${slug}`) : t('currencies.actionError')
}

/** Maps a failed row action onto the banner: a 409 slug, a 422 slug, or a generic line. */
function describeFailure(error: unknown, fallback = t('currencies.actionError')): string {
  const conflict = (error as { data?: { message?: unknown } })?.data?.message
  if (typeof conflict === 'string' && CONFLICT_SLUGS.has(conflict)) {
    return t(`currencies.conflict.${conflict}`)
  }
  const slug = Object.values(getErrorFields(error) ?? {})[0]?.[0]
  if (slug) return serverMessage(slug)
  const stateKey = STATE_COPY[resolveResourceErrorState(error)]
  return stateKey ? t(stateKey) : fallback
}

async function runAction(action: () => Promise<void>): Promise<void> {
  banner.value = null
  try {
    await action()
    await load()
  } catch (error) {
    banner.value = describeFailure(error)
  }
}

// --- Activate / deactivate / delete ---

const deactivateTarget = ref<CatalogueCurrency | null>(null)
const removeTarget = ref<CatalogueCurrency | null>(null)

/** Activation needs a rate; the control stays focusable (aria-disabled) so its reason is announced. */
function canActivate(row: CatalogueCurrency): boolean {
  return row.rate_per_usd !== null
}

async function onToggle(row: CatalogueCurrency): Promise<void> {
  if (!row.is_active && !canActivate(row)) return
  // Deactivating changes what organizations can pick, so it asks first.
  if (row.is_active) {
    deactivateTarget.value = row
    return
  }
  await runAction(() => updateCurrency(row.code, { is_active: true }))
}

async function onDeactivateConfirmed(): Promise<void> {
  const target = deactivateTarget.value
  deactivateTarget.value = null
  if (target) await runAction(() => updateCurrency(target.code, { is_active: false }))
}

async function onRemoveConfirmed(): Promise<void> {
  const target = removeTarget.value
  removeTarget.value = null
  if (target) await runAction(() => removeCurrency(target.code))
}

// --- Create / edit ---

const formOpen = ref(false)
const editing = ref<CatalogueCurrency | null>(null)
const busy = ref(false)
const formMessage = ref<string | null>(null)
const form = reactive({ code: '', symbol: '', decimals: '2', rate: '', asOf: '' })
const errors = ref<{
  code?: string
  symbol?: string
  decimals?: string
  rate?: string
  asOf?: string
}>({})

const formId = computed(() => (editing.value ? 'currency-edit-form' : 'currency-form'))
const isBase = computed(() => editing.value?.code === BASE_CODE)

function openCreate(): void {
  editing.value = null
  Object.assign(form, { code: '', symbol: '', decimals: '2', rate: '', asOf: '' })
  errors.value = {}
  formMessage.value = null
  formOpen.value = true
}

function openEdit(row: CatalogueCurrency): void {
  editing.value = row
  Object.assign(form, {
    code: row.code,
    symbol: row.symbol,
    decimals: String(row.decimals),
    rate: row.rate_per_usd ?? '',
    asOf: row.rate_as_of ?? '',
  })
  errors.value = {}
  formMessage.value = null
  formOpen.value = true
}

function closeForm(): void {
  formOpen.value = false
}

/** Client-side checks that only save a round trip; the server stays authoritative. */
function validate(): boolean {
  const next: typeof errors.value = {}
  const creating = editing.value === null
  const rate = form.rate.trim()
  const asOf = form.asOf.trim()

  if (creating && !/^[A-Z]{3}$/.test(form.code)) next.code = t('currencies.validation.code')
  if (form.symbol.trim() === '' || form.symbol.length > 8) {
    next.symbol = t('currencies.validation.symbol')
  }
  if (!isBase.value) {
    if (!/^[0-4]$/.test(form.decimals.trim())) {
      next.decimals = t('currencies.validation.decimals')
    }
    if (rate !== '' && (!RATE_PATTERN.test(rate) || Number(rate) <= 0)) {
      next.rate = t('currencies.validation.rate')
    } else if (rate === '' && asOf !== '') {
      next.rate = t('currencies.validation.rateAndDate')
    }
    if (rate !== '' && asOf === '') next.asOf = t('currencies.validation.asOf')
  }
  errors.value = next
  return Object.keys(next).length === 0
}

function buildPayload(): UpdateCurrencyPayload {
  if (isBase.value) return { symbol: form.symbol.trim() }
  const rate = form.rate.trim()
  return {
    symbol: form.symbol.trim(),
    decimals: Number(form.decimals),
    // Rate and date travel together, and the rate stays a string.
    ...(rate !== '' ? { rate_per_usd: rate, rate_as_of: form.asOf.trim() } : {}),
  }
}

const FIELD_TO_ERROR_KEY = {
  code: 'code',
  symbol: 'symbol',
  decimals: 'decimals',
  rate_per_usd: 'rate',
  rate_as_of: 'asOf',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  if (!validate()) return

  busy.value = true
  try {
    const payload = buildPayload()
    if (editing.value) await updateCurrency(editing.value.code, payload)
    else
      await createCurrency({
        symbol: payload.symbol ?? '',
        decimals: Number(form.decimals),
        ...payload,
        code: form.code,
      })
    closeForm()
    await load()
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, FIELD_TO_ERROR_KEY, (key, slug) => {
      errors.value[key] = serverMessage(slug)
    })
    formMessage.value =
      unmapped === null
        ? describeFailure(error, t('currencies.saveError'))
        : unmapped.map(serverMessage).join(' ') || t('currencies.saveError')
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void load()
})
</script>
