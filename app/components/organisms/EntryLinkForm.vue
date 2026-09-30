<template>
  <!--
    `id` is load-bearing, not decoration (feature/form-drawer): the submit
    control lives in FormDrawer's non-scrolling footer, OUTSIDE this element,
    and `<button form="entry-link-form">` is what connects the two.
  -->
  <form id="entry-link-form" data-testid="entry-link-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="submitting">
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

        <Field :data-invalid="Boolean(errors.email)">
          <FieldLabel for="entry-link-form-email">
            {{ $t('entryLink.form.email') }}
          </FieldLabel>
          <Input
            id="entry-link-form-email"
            v-model="email"
            type="email"
            autocomplete="off"
            :aria-invalid="Boolean(errors.email)"
            :aria-describedby="
              errors.email ? 'entry-link-form-email-error' : 'entry-link-form-email-help'
            "
            data-testid="entry-link-form-email"
          />
          <FieldDescription id="entry-link-form-email-help">
            {{ $t('entryLink.form.help.email') }}
          </FieldDescription>
          <FieldError
            v-if="errors.email"
            id="entry-link-form-email-error"
            data-testid="entry-link-form-email-error"
          >
            {{ errors.email }}
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
            :aria-describedby="
              errors.displayName ? 'entry-link-form-display-name-error' : undefined
            "
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

        <!--
          candidate-external-reference (design AD-8): OPTIONAL. The calling
          system's own id for this candidate and the name of that system — only
          meaningful when another system created the candidate, so both stay
          empty for a candidate invited by hand.

          One help line for the PAIR, nested in the FieldSet it describes (the
          WebhookDefaultsForm pattern), not a loose sibling inside FieldGroup.
          It is the `aria-describedby` of each input until that input has an
          error of its own, which then takes its place.

          External ID is `type="text" inputmode="numeric"`, NOT `type="number"`:
          a number input scrolls with the wheel, accepts `e` notation and hands
          back a float, so an identifier near 2^53 would lose digits before
          validation ever saw it.
        -->
        <FieldSet class="gap-3" data-testid="entry-link-form-external-reference">
          <FieldLegend variant="label">{{ $t('externalReference.label') }}</FieldLegend>
          <FieldDescription id="entry-link-form-external-reference-help">
            {{ $t('externalReference.help') }}
          </FieldDescription>

          <Field :data-invalid="Boolean(errors.externalId)">
            <FieldLabel for="entry-link-form-external-id">
              {{ $t('externalReference.externalId') }}
            </FieldLabel>
            <Input
              id="entry-link-form-external-id"
              v-model="externalId"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :aria-invalid="Boolean(errors.externalId)"
              :aria-describedby="
                errors.externalId
                  ? 'entry-link-form-external-id-error'
                  : 'entry-link-form-external-reference-help'
              "
              data-testid="entry-link-form-external-id"
              @blur="errors.externalId = validateExternalId()"
            />
            <FieldError
              v-if="errors.externalId"
              id="entry-link-form-external-id-error"
              data-testid="entry-link-form-external-id-error"
            >
              {{ errors.externalId }}
            </FieldError>
          </Field>

          <Field :data-invalid="Boolean(errors.source)">
            <FieldLabel for="entry-link-form-source">
              {{ $t('externalReference.source') }}
            </FieldLabel>
            <Input
              id="entry-link-form-source"
              v-model="source"
              autocomplete="off"
              :aria-invalid="Boolean(errors.source)"
              :aria-describedby="
                errors.source
                  ? 'entry-link-form-source-error'
                  : 'entry-link-form-external-reference-help'
              "
              data-testid="entry-link-form-source"
              @blur="errors.source = validateSource()"
            />
            <FieldError
              v-if="errors.source"
              id="entry-link-form-source-error"
              data-testid="entry-link-form-source-error"
            >
              {{ errors.source }}
            </FieldError>
          </Field>
        </FieldSet>

        <!--
          interview-scheduling (design AD-2/AD-3, PR-F): "send now" vs
          "schedule for later". Default "now" preserves today's behaviour
          byte-for-byte (spec: "Omitted scheduled_at preserves today's
          immediate behavior"). ToggleGroup for a 2-choice option set, per
          this repo's own shadcn-vue convention (ReportFilters.vue's status
          filter uses the same FieldSet+FieldLegend+ToggleGroup shape).
        -->
        <FieldSet class="w-auto gap-2">
          <FieldLegend variant="label">{{ $t('entryLink.form.timing.legend') }}</FieldLegend>
          <ToggleGroup
            type="single"
            variant="outline"
            :model-value="schedulingMode"
            data-testid="entry-link-form-timing"
            @update:model-value="onTimingChange"
          >
            <ToggleGroupItem value="now" data-testid="entry-link-form-timing-now">
              {{ $t('entryLink.form.timing.now') }}
            </ToggleGroupItem>
            <ToggleGroupItem value="schedule" data-testid="entry-link-form-timing-schedule">
              {{ $t('entryLink.form.timing.schedule') }}
            </ToggleGroupItem>
          </ToggleGroup>
        </FieldSet>

        <!--
          Nothing is sent at creation time on the scheduled path (T-B1) — no
          mint, no email — so "send email now" is not a meaningful choice
          while scheduling is on; it is hidden rather than disabled, since a
          disabled control still asks a question that has no answer here.
        -->
        <CheckboxField
          v-if="schedulingMode === 'now'"
          id="entry-link-form-send-email"
          v-model="sendEmail"
          :label="$t('entryLink.form.sendEmail')"
          data-testid="entry-link-form-send-email"
        />

        <Field v-else :data-invalid="Boolean(errors.scheduledAt)">
          <FieldLabel for="entry-link-form-scheduled-at">
            {{ $t('entryLink.form.scheduledAt') }}
          </FieldLabel>
          <Input
            id="entry-link-form-scheduled-at"
            v-model="scheduledAt"
            type="datetime-local"
            :aria-invalid="Boolean(errors.scheduledAt)"
            :aria-describedby="
              errors.scheduledAt
                ? 'entry-link-form-scheduled-at-error'
                : 'entry-link-form-scheduled-at-help'
            "
            data-testid="entry-link-form-scheduled-at"
          />
          <!--
            The 16-minute figure is confirmed from
            `api/app/Support/Scheduling/ScheduledInterviewWindow.php`'s
            `MINIMUM_SCHEDULING_LEAD_MINUTES` — a UX hint only. The server
            (the SAME `ScheduledStartWithinLeadTime` rule object used by every
            surface) is the authority; this never replaces its validation.
          -->
          <FieldDescription id="entry-link-form-scheduled-at-help">
            {{
              $t('entryLink.form.help.scheduledAt', { minutes: MINIMUM_SCHEDULING_LEAD_MINUTES })
            }}
          </FieldDescription>
          <FieldError
            v-if="errors.scheduledAt"
            id="entry-link-form-scheduled-at-error"
            data-testid="entry-link-form-scheduled-at-error"
          >
            {{ errors.scheduledAt }}
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
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
import { FormFieldset } from '@/components/ui/form-fieldset'
// EntryLinkForm — "Invite candidate" surface (design D4): candidate_ref +
// display_name only. project_id is known from context (the project row the
// operator opened the dialog from), never a third field to pick.
import { ref, watch } from 'vue'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import CheckboxField from '@/components/molecules/CheckboxField.vue'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  useEntryLinks,
  type GenerateEntryLinkPayload,
  type GenerateEntryLinkResponse,
} from '@/composables/useEntryLinks'
import { applyServerFieldErrors } from '@/utils/http-error'

const MAX_LENGTH = 255

// candidate-external-reference: mirror the API's `ExternalReference` rules —
// `external_id` is an integer between 1 and 2^53 - 1 (the largest value a
// JavaScript number, and therefore a JSON consumer, can hold exactly) and
// `source` is at most 180 characters. UX hint only: the server is the authority.
const EXTERNAL_ID_MAX = Number.MAX_SAFE_INTEGER
const SOURCE_MAX_LENGTH = 180

// interview-scheduling (design AD-3): mirrors
// `api/app/Support/Scheduling/ScheduledInterviewWindow::MINIMUM_SCHEDULING_LEAD_MINUTES`
// (confirmed by reading that file, not guessed). UX hint only — the server's
// own `ScheduledStartWithinLeadTime` rule is the sole authority; a drift here
// would only ever make the CLIENT stricter or looser than the real rule, it
// can never let an invalid `scheduled_at` through.
const MINIMUM_SCHEDULING_LEAD_MINUTES = 16

/**
 * `<input type="datetime-local">` yields a timezone-less wall-clock string
 * (e.g. "2026-10-01T14:30"), parsed by `Date` as the BROWSER's local time.
 * `toISOString()` converts that same instant to UTC with a trailing `Z` —
 * satisfying AD-2's "explicit UTC offset or Z suffix" requirement without
 * any manual offset arithmetic.
 */
function toIsoWithExplicitOffset(datetimeLocalValue: string): string {
  return new Date(datetimeLocalValue).toISOString()
}

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
// Required, and it is the candidate's IDENTITY as well as their address: the
// same person invited to another project — or by another organization — is the
// same email (CLAUDE.md ruling 8, reversed 2026-09-01).
const email = ref('')
const sendEmail = ref(true)
// interview-scheduling (design AD-1): "now" preserves today's default,
// byte-for-byte — the spec's own "Omitted scheduled_at preserves today's
// immediate behavior" requirement.
const schedulingMode = ref<'now' | 'schedule'>('now')
// `<input type="datetime-local">` value — no timezone, browser wall-clock
// time. Converted to an explicit-offset ISO-8601 string only at submit time.
const scheduledAt = ref('')
// Both optional, both kept as the raw text the operator typed: External ID is
// converted to a number only at submit time, after it has been validated.
const externalId = ref('')
const source = ref('')
const errors = ref<{
  candidateRef?: string
  displayName?: string
  email?: string
  scheduledAt?: string
  externalId?: string
  source?: string
}>({})
const formMessage = ref<string | null>(null)
const submitting = ref(false)

// ToggleGroup type="single" can deselect to '' on a repeat click of the
// active item (reka-ui). Exactly one of the two modes must always be
// selected, so an empty selection is ignored rather than left orphaned.
function onTimingChange(value: unknown): void {
  if (value === 'now' || value === 'schedule') {
    schedulingMode.value = value
  }
}

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

  errors.value.email = validateEmail()
  errors.value.scheduledAt = validateScheduledAt()
  errors.value.externalId = validateExternalId()
  errors.value.source = validateSource()

  return (
    !errors.value.candidateRef &&
    !errors.value.displayName &&
    !errors.value.email &&
    !errors.value.scheduledAt &&
    !errors.value.externalId &&
    !errors.value.source
  )
}

/**
 * Empty is fine (the whole fieldset is optional). Otherwise digits only, and a
 * SAFE integer of at least 1: `Number('9007199254740993')` silently rounds to
 * `...992`, so the round trip through `isSafeInteger` is what rejects it.
 * Decimals, signs, exponents and embedded spaces fail the digits-only test
 * before the number is ever parsed.
 */
function validateExternalId(): string | undefined {
  const value = externalId.value.trim()
  if (value === '') return undefined

  if (!/^\d+$/.test(value))
    return t('externalReference.externalIdInvalid', { max: EXTERNAL_ID_MAX })

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return t('externalReference.externalIdInvalid', { max: EXTERNAL_ID_MAX })
  }

  return undefined
}

/** Measured after trimming, because the trimmed value is what is sent. */
function validateSource(): string | undefined {
  if (source.value.trim().length > SOURCE_MAX_LENGTH) {
    return t('entryLink.form.tooLong', { max: SOURCE_MAX_LENGTH })
  }

  return undefined
}

/**
 * Client-side hint only (AD-3's 16-minute figure, confirmed by reading
 * `ScheduledInterviewWindow.php`). The server's `ScheduledStartWithinLeadTime`
 * rule is the authority for both the future-date and the lead-time checks;
 * this only stops an obviously-invalid submit from making a round trip.
 */
function validateScheduledAt(): string | undefined {
  if (schedulingMode.value !== 'schedule') return undefined

  const value = scheduledAt.value.trim()
  if (value === '') return t('entryLink.form.scheduledAtRequired')

  const scheduled = new Date(value)
  if (Number.isNaN(scheduled.getTime())) return t('entryLink.form.scheduledAtInvalid')

  const minimumLeadMs = MINIMUM_SCHEDULING_LEAD_MINUTES * 60_000
  if (scheduled.getTime() - Date.now() < minimumLeadMs) {
    return t('entryLink.form.scheduledAtTooSoon', { minutes: MINIMUM_SCHEDULING_LEAD_MINUTES })
  }

  return undefined
}

/**
 * Presence and a single `@`, nothing more.
 *
 * The server validates properly and is the authority. A client-side regex that
 * tries to be thorough rejects addresses that are perfectly valid — plus
 * addressing, new TLDs, quoted locals — and the person it turns away is a
 * candidate who then never gets invited at all. Catching the empty field and
 * the obvious typo is the whole job here.
 */
function validateEmail(): string | undefined {
  const value = email.value.trim()

  if (value === '') return t('entryLink.form.emailRequired')
  if (!value.includes('@')) return t('entryLink.form.emailInvalid')
  if (value.length > MAX_LENGTH) return t('entryLink.form.tooLong', { max: MAX_LENGTH })

  return undefined
}

const SERVER_FIELD_TO_ERROR_KEY = {
  candidate_ref: 'candidateRef',
  display_name: 'displayName',
  email: 'email',
  scheduled_at: 'scheduledAt',
  external_id: 'externalId',
  source: 'source',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  if (!validate()) return

  submitting.value = true
  try {
    const payload: GenerateEntryLinkPayload = {
      project_id: props.projectId,
      candidate_ref: candidateRef.value,
      display_name: displayName.value,
      email: email.value.trim(),
    }

    // Byte-for-byte identical to the pre-existing payload when scheduling is
    // off (regression, spec's "Omitted scheduled_at preserves today's
    // immediate behavior"); `scheduled_at` and `send_email` are mutually
    // exclusive on the wire — nothing is minted/sent at creation time on the
    // scheduled path (T-B1), so "send email now" has no payload counterpart.
    if (schedulingMode.value === 'schedule') {
      payload.scheduled_at = toIsoWithExplicitOffset(scheduledAt.value)
    } else {
      payload.send_email = sendEmail.value
    }

    // candidate-external-reference: a key only for a value the operator
    // actually entered, so a form left empty sends exactly the payload it always
    // did. On BOTH timing modes: the scheduled row is created now, and the
    // immediate link carries the pair in its token. `external_id` goes out as a
    // NUMBER (the API rejects a numeric string), `source` trimmed.
    const externalIdText = externalId.value.trim()
    if (externalIdText !== '') payload.external_id = Number(externalIdText)

    const sourceText = source.value.trim()
    if (sourceText !== '') payload.source = sourceText

    const response = await generateEntryLink(payload)
    emit('success', response)
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = message
    })
    const mapped = Object.values(errors.value).some((value) => value !== undefined)

    // Pre-existing bug fixed here (found while adding `scheduled_at`, not
    // introduced by it — CLAUDE.md "always fix findings"): this used to read
    // `unmapped && unmapped.length > 0 ? ... : saveError`, which showed the
    // generic banner on EVERY server error, including one fully mapped onto
    // a field (`unmapped` is `[]`, which is truthy, so the `&&` never short
    // circuited). Brought in line with `ProjectForm.vue`'s own
    // `applyServerErrors` convention:
    //   - unmapped messages exist -> show them (a field with no control of
    //     its own, e.g. role_code/project_id, still has to reach the
    //     operator);
    //   - nothing unmapped but a field WAS mapped -> suppress the banner,
    //     the reason is already under its own control;
    //   - neither (no field-shaped body at all, e.g. network/500) -> the
    //     generic "could not save" banner.
    formMessage.value =
      unmapped && unmapped.length > 0
        ? unmapped.join(' ')
        : mapped
          ? null
          : t('entryLink.form.saveError')
  } finally {
    submitting.value = false
  }
}
</script>
