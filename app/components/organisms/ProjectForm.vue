<template>
  <!--
    `id` is load-bearing, not decoration (feature/form-drawer): the submit
    control lives in FormDrawer's non-scrolling footer, OUTSIDE this element,
    and `<button form="project-form">` is what connects the two.
  -->
  <form id="project-form" data-testid="project-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <Field :data-invalid="Boolean(errors.name)">
          <FieldLabel for="project-form-name">{{ $t('projects.form.name') }}</FieldLabel>
          <Input
            id="project-form-name"
            v-model="name"
            autocomplete="off"
            :aria-invalid="Boolean(errors.name)"
            :aria-describedby="describedBy('project-form-name', Boolean(errors.name))"
            data-testid="project-form-name"
            @blur="validateName"
          />
          <FieldDescription id="project-form-name-help">
            {{ $t('projects.form.help.name') }}
          </FieldDescription>
          <FieldError
            v-if="errors.name"
            id="project-form-name-error"
            data-testid="project-form-name-error"
          >
            {{ errors.name }}
          </FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.slug)">
          <FieldLabel for="project-form-slug">{{ $t('projects.form.slug') }}</FieldLabel>
          <Input
            id="project-form-slug"
            v-model="slug"
            autocomplete="off"
            :aria-invalid="Boolean(errors.slug)"
            :aria-describedby="describedBy('project-form-slug', Boolean(errors.slug))"
            data-testid="project-form-slug"
            @blur="validateSlug"
          />
          <FieldDescription id="project-form-slug-help">
            {{ $t('projects.form.help.slug') }}
          </FieldDescription>
          <FieldError
            v-if="errors.slug"
            id="project-form-slug-error"
            data-testid="project-form-slug-error"
          >
            {{ errors.slug }}
          </FieldError>
        </Field>

        <Field>
          <FieldLabel for="project-form-language">{{ $t('projects.form.language') }}</FieldLabel>
          <!--
          Same false positive documented in eslint.config.mjs for the vendored
          ui/** primitives: the rule cannot see through the Select/SelectTrigger
          component boundary to the for/id association wired above.
        -->
          <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
          <Select v-model="language">
            <SelectTrigger
              id="project-form-language"
              data-testid="project-form-language"
              aria-describedby="project-form-language-help"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="en">EN</SelectItem>
                <SelectItem value="it">IT</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription id="project-form-language-help">
            {{ $t('projects.form.help.language') }}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel for="project-form-assessment-type">
            {{ $t('projects.form.assessmentType') }}
          </FieldLabel>
          <ToggleGroup
            id="project-form-assessment-type"
            type="single"
            :model-value="assessmentType"
            :disabled="lockedWhenLive"
            data-testid="project-form-assessment-type"
            @update:model-value="onAssessmentTypeChange"
          >
            <ToggleGroupItem value="standard">
              {{ $t('projects.assessmentType.standard') }}
            </ToggleGroupItem>
            <ToggleGroupItem value="potential">
              {{ $t('projects.assessmentType.potential') }}
            </ToggleGroupItem>
          </ToggleGroup>
          <!--
          Renders ALWAYS, not gated on `lockedWhenLive` — D6's inversion fix.
          The previous version of this description only appeared AFTER the
          project went live, i.e. after the choice was already frozen, which
          is the opposite of "stated before commitment" (spec.md's Permanence
          scenario). `immutableWhenLive` below keeps its own gate: it is a
          DIFFERENT statement ("this is now locked"), not a duplicate.
        -->
          <FieldDescription>{{ $t('projects.form.help.assessmentTypeFreezes') }}</FieldDescription>
          <FieldDescription v-if="lockedWhenLive">
            {{ $t('projects.form.immutableWhenLive') }}
          </FieldDescription>
        </Field>

        <Field v-if="assessmentType === 'standard'" :data-invalid="Boolean(errors.roleCode)">
          <FieldLabel for="project-form-role-code">{{ $t('projects.form.roleCode') }}</FieldLabel>
          <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
          <Select v-model="roleCode" :disabled="lockedWhenLive">
            <SelectTrigger
              id="project-form-role-code"
              data-testid="project-form-role-code"
              :aria-invalid="Boolean(errors.roleCode)"
              :aria-describedby="describedBy('project-form-role-code', Boolean(errors.roleCode))"
            >
              <SelectValue :placeholder="$t('projects.form.roleCode')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="code in ROLE_CODES" :key="code" :value="code">
                  {{ $t(`projects.roleCode.${code}`) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <!--
          Extended (not a new key) to also state permanence — the flagged
          spec.md/design.md gap: spec's Permanence scenario requires
          role_code's FieldDescription to state it alongside assessment_type;
          design's copy table only drafted new copy for assessment_type. This
          key already existed and already rendered unconditionally, so
          extending it is the smaller, non-duplicative fix. Recorded in
          tasks.md 3.4.
        -->
          <FieldDescription id="project-form-role-code-help">
            {{ $t('projects.form.roleCodeRequiredForStandard') }}
          </FieldDescription>
          <FieldError
            v-if="errors.roleCode"
            id="project-form-role-code-error"
            data-testid="project-form-role-code-error"
          >
            {{ errors.roleCode }}
          </FieldError>
          <FieldDescription v-if="lockedWhenLive">
            {{ $t('projects.form.immutableWhenLive') }}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel for="project-form-framework-version">
            {{ $t('projects.form.frameworkVersion') }}
          </FieldLabel>
          <Input
            id="project-form-framework-version"
            v-model="frameworkVersionId"
            type="number"
            min="1"
            autocomplete="off"
            :disabled="isEditing"
            data-testid="project-form-framework-version"
          />
          <FieldDescription>{{ $t('projects.form.frameworkVersionImmutable') }}</FieldDescription>
        </Field>

        <CompetencyPicker
          v-model="competencyIds"
          :options="competencyOptions"
          :persisted-ids="persistedIds"
        />

        <Field :data-invalid="Boolean(errors.pauseEveryNCompetencies)">
          <FieldLabel for="project-form-pause-every-n">
            {{ $t('projects.form.pauseEveryNCompetencies') }}
          </FieldLabel>
          <Input
            id="project-form-pause-every-n"
            v-model="pauseEveryNCompetencies"
            type="number"
            autocomplete="off"
            :aria-invalid="Boolean(errors.pauseEveryNCompetencies)"
            :aria-describedby="
              describedBy('project-form-pause-every-n', Boolean(errors.pauseEveryNCompetencies))
            "
            data-testid="project-form-pause-every-n"
            @blur="validatePauseEveryNCompetencies"
          />
          <FieldDescription id="project-form-pause-every-n-help">
            {{ $t('projects.form.help.pauseEveryN') }}
          </FieldDescription>
          <FieldError
            v-if="errors.pauseEveryNCompetencies"
            id="project-form-pause-every-n-error"
            data-testid="project-form-pause-every-n-error"
          >
            {{ errors.pauseEveryNCompetencies }}
          </FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.nudgeMinChars)">
          <FieldLabel for="project-form-nudge-min-chars">
            {{ $t('projects.form.nudgeMinChars') }}
          </FieldLabel>
          <Input
            id="project-form-nudge-min-chars"
            v-model="nudgeMinChars"
            type="number"
            autocomplete="off"
            :aria-invalid="Boolean(errors.nudgeMinChars)"
            :aria-describedby="
              describedBy('project-form-nudge-min-chars', Boolean(errors.nudgeMinChars))
            "
            data-testid="project-form-nudge-min-chars"
            @blur="validateNudgeMinChars"
          />
          <FieldDescription id="project-form-nudge-min-chars-help">
            {{ $t('projects.form.help.nudgeMinChars') }}
          </FieldDescription>
          <FieldError
            v-if="errors.nudgeMinChars"
            id="project-form-nudge-min-chars-error"
            data-testid="project-form-nudge-min-chars-error"
          >
            {{ errors.nudgeMinChars }}
          </FieldError>
        </Field>

        <!--
        Which avatar template THIS project runs on.

        A plain <select>, not the richer LlmModelPicker: there are no disabled
        groups to express here. Every template an organization owns is a legal
        choice, including an inactive one — `is_active` decides the ORG-WIDE
        fallback, and pinning is precisely how a project opts out of it. Hiding
        inactive templates would make two projects on the same provider
        impossible again, since only one per provider can be active.
      -->
        <Field :data-invalid="Boolean(errors.avatarTemplateId)">
          <FieldLabel for="project-form-avatar-template">
            {{ $t('projects.form.avatarTemplate') }}
          </FieldLabel>
          <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
          <select
            id="project-form-avatar-template"
            data-testid="project-form-avatar-template"
            autocomplete="off"
            :class="formControlClass"
            :value="avatarTemplateId === null ? '' : String(avatarTemplateId)"
            :aria-invalid="Boolean(errors.avatarTemplateId)"
            :aria-describedby="
              describedBy('project-form-avatar-template', Boolean(errors.avatarTemplateId))
            "
            @change="onAvatarTemplateChange"
          >
            <!--
            There is NO empty option. Every project must name a template — the
            interview cannot run without a face and a voice — so "none" is not
            a configuration the operator can choose. The empty `value` above is
            reachable only in the moment before the default resolves, and the
            validator below refuses a submit made in it.
          -->
            <option v-for="template in avatarTemplates" :key="template.id" :value="template.id">
              {{ template.name }} ({{ template.provider }})
            </option>
          </select>
          <FieldDescription id="project-form-avatar-template-help">
            {{ $t('projects.form.help.avatarTemplate') }}
          </FieldDescription>
          <FieldError
            v-if="errors.avatarTemplateId"
            id="project-form-avatar-template-error"
            data-testid="project-form-avatar-template-error"
          >
            {{ errors.avatarTemplateId }}
          </FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.exitRedirectUrl)">
          <FieldLabel for="project-form-exit-redirect-url">
            {{ $t('projects.form.exitRedirectUrl') }}
          </FieldLabel>
          <Input
            id="project-form-exit-redirect-url"
            v-model="exitRedirectUrl"
            type="url"
            autocomplete="off"
            :aria-invalid="Boolean(errors.exitRedirectUrl)"
            :aria-describedby="
              describedBy('project-form-exit-redirect-url', Boolean(errors.exitRedirectUrl))
            "
            data-testid="project-form-exit-redirect-url"
            @blur="validateExitRedirectUrl"
          />
          <FieldDescription id="project-form-exit-redirect-url-help">
            {{ $t('projects.form.help.exitRedirectUrl') }}
          </FieldDescription>
          <FieldError
            v-if="errors.exitRedirectUrl"
            id="project-form-exit-redirect-url-error"
            data-testid="project-form-exit-redirect-url-error"
          >
            {{ errors.exitRedirectUrl }}
          </FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.webhookUrl)">
          <FieldLabel for="project-form-webhook-url">{{
            $t('projects.form.webhookUrl')
          }}</FieldLabel>
          <Input
            id="project-form-webhook-url"
            v-model="webhookUrl"
            type="url"
            autocomplete="off"
            :aria-invalid="Boolean(errors.webhookUrl)"
            :aria-describedby="describedBy('project-form-webhook-url', Boolean(errors.webhookUrl))"
            data-testid="project-form-webhook-url"
            @blur="validateWebhookUrl"
          />
          <FieldDescription id="project-form-webhook-url-help">
            {{ $t('projects.form.help.webhookUrl') }}
          </FieldDescription>
          <FieldError
            v-if="errors.webhookUrl"
            id="project-form-webhook-url-error"
            data-testid="project-form-webhook-url-error"
          >
            {{ errors.webhookUrl }}
          </FieldError>
        </Field>

        <!--
        `configured` reports whether a secret already exists — it is NOT the
        secret, which is write-only and never leaves the server. This was
        hardcoded to false, so editing a project that already had a webhook
        secret told the operator none was set. On a security-relevant field
        that is a lie, not a rough edge: it invites someone to conclude their
        webhooks are unsigned and to go set a secret that was already there.
      -->
        <WriteOnlySecretField
          id="project-form-webhook-secret"
          :label="$t('projects.form.webhookSecret')"
          :configured="project?.has_webhook_secret ?? false"
          @update:value="(value) => (webhookSecret = value)"
        />

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="project-form-banner"
        />

        <!--
        Save and Cancel are NOT here — they live in FormDrawer's footer, where
        a form this long cannot scroll them out of reach (feature/form-drawer).
        Activate and Archive stay: they are lifecycle transitions on the
        record, applied immediately and independently of whether the draft in
        this form has been saved, so grouping them with the form's own submit
        would misrepresent what they do.
      -->
        <div v-if="nextTransition !== null" class="flex items-center gap-2">
          <Button
            v-if="nextTransition === 'active'"
            type="button"
            variant="secondary"
            data-testid="project-form-transition-activate"
            @click="onTransition('active')"
          >
            {{ $t('projects.action.activate') }}
          </Button>
          <Button
            v-if="nextTransition === 'archived'"
            type="button"
            variant="secondary"
            data-testid="project-form-transition-archive"
            @click="archiveConfirm = true"
          >
            {{ $t('projects.action.archive') }}
          </Button>
        </div>
      </FieldGroup>
    </FormFieldset>

    <!--
      D7: the archive button no longer calls onTransition directly — it sets
      archiveConfirm = true instead. `onTransition` is now reachable ONLY
      from confirm, so cancel structurally cannot strand `saving` (the only
      assignment of `saving = true` lives inside onTransition).
    -->
    <ConfirmDialog
      :open="archiveConfirm"
      :title="$t('projects.confirm.archiveTitle')"
      :description="$t('projects.confirm.archiveDescription')"
      :confirm-label="$t('projects.action.archive')"
      variant="destructive"
      @confirm="onArchiveConfirmed"
      @cancel="archiveConfirm = false"
    />
  </form>
</template>

<script setup lang="ts">
// Project create/edit form (D9): mirrors server-side immutability so an
// operator sees a disabled control with a reason instead of an unexplained
// 422. Self-contained (owns its own submit/validation), matching login.vue's
// pattern rather than delegating persistence to the parent.
import { ref, computed, onMounted, watch } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import WriteOnlySecretField from '@/components/molecules/WriteOnlySecretField.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import CompetencyPicker, {
  type CompetencyOption,
} from '@/components/molecules/CompetencyPicker.vue'
import { useProjects, type Project } from '@/composables/useProjects'
import { useFrameworkRoles } from '@/composables/useFrameworkRoles'
import { useAvatarTemplates } from '@/composables/useAvatarTemplates'
import { formControlClass } from '@/components/ui/form-control'
import type { TemplateOption } from '@/types/avatar-template'
import {
  isNudgeMinCharsValid,
  isProjectUrlValid,
  isPauseEveryNCompetenciesValid,
  PROJECT_FIELD_BOUNDS,
} from '@/utils/project-field-specs'
import { applyServerFieldErrors, serverErrorCode } from '@/utils/http-error'
import { translateServerCode } from '@/utils/server-message'

const ROLE_CODES = ['ICO', 'FLL', 'MLL', 'BUL', 'SRX'] as const

// The C3 role-competencies endpoint (`GET /framework/roles/{roleCode}/competencies`)
// now serves the competency `id` alongside `code`/`name`, which is what
// `StoreProjectRequest.competency_ids` validates against. It did not when D9
// was written, and the gap made every competency selection a no-op.
// `barsAvailable: null` explicitly, not omitted — D2's tri-state: the
// coverage question does not APPLY to potential-assessment competencies
// (they are not role-anchored), which is a different fact than "not yet
// covered" (`false`). CompetencyOption.barsAvailable is required, so this
// site has to state that reason rather than being allowed to skip it.
const POTENTIAL_COMPETENCIES: CompetencyOption[] = [{ code: 'MTG' }, { code: 'LAT' }].map((c) => ({
  ...c,
  name: c.code,
  barsAvailable: null,
}))

const props = defineProps<{
  project: Project | null
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  /**
   * feature/form-drawer. This form owns its own persistence (and therefore its
   * own in-flight flag), but the submit control it belongs to now lives in the
   * drawer footer above it. Publishing the flag is what lets the shared footer
   * disable that control — the alternative, lifting `createProject`/
   * `updateProject` up to the page, would dismantle the self-contained shape
   * D9 chose deliberately.
   */
  (e: 'update:pending', value: boolean): void
}>()

/**
 * Only what the picker renders and submits. Deliberately narrower than
 * `AvatarTemplate`: this control needs an id, a label and the provider to
 * disambiguate two similarly-named templates, and nothing else. Widening it to
 * the full model would couple this form to fields it never reads.
 */
// The picker endpoint's own shape, taken from the generated client rather
// than narrowed from `AvatarTemplate`. That endpoint returns `provider` as a
// plain string because it is the ONE thing about a template a non-admin may
// read, and pinning it to the admin resource's `ProviderName` union here would
// couple this form to a type it has no business depending on.
type AvatarTemplateOption = TemplateOption

const { createProject, updateProject } = useProjects()
const { fetchRoleCompetencies } = useFrameworkRoles()
const { listTemplateOptions } = useAvatarTemplates()

const isEditing = computed(() => props.project !== null)

const name = ref(props.project?.name ?? '')
const slug = ref(props.project?.slug ?? '')
const language = ref(props.project?.language ?? 'en')
const assessmentType = ref<'standard' | 'potential'>(props.project?.assessment_type ?? 'standard')
const roleCode = ref(props.project?.role_code ?? '')
const frameworkVersionId = ref(props.project?.framework_version_id ?? '')
// Hydrated from the project's CURRENT competencies (D2's scope finding).
// Submission below MUST land together with this hydration: submitting
// competency_ids while this still initialised to [] would make the next
// save of any untouched project call sync([]) and wipe its competency set.
const competencyIds = ref<number[]>((props.project?.competencies ?? []).map((c) => c.id))
const pauseEveryNCompetencies = ref(props.project?.pause_every_n_competencies ?? '')
const nudgeMinChars = ref(props.project?.nudge_min_chars ?? '')
const exitRedirectUrl = ref(props.project?.exit_redirect_url ?? '')
// Null only until the default resolves. The column is NOT NULL server-side —
// every project names a template — so null here means "not chosen yet", never
// "deliberately none", and `validateAvatarTemplate` refuses a submit in that
// state rather than sending a value the API would reject with a generic error.
const avatarTemplateId = ref<number | null>(props.project?.avatar_template_id ?? null)
const avatarTemplates = ref<AvatarTemplateOption[]>([])
const webhookUrl = ref(props.project?.webhook_url ?? '')
const webhookSecret = ref<string | undefined>(undefined)

const saving = ref(false)

// Published rather than watched from the outside, and `immediate` so a drawer
// that mounts mid-flight (or after a previous failed submit) starts from the
// truth rather than from its own default.
watch(saving, (value) => emit('update:pending', value), { immediate: true })

// D7: a single boolean is sufficient here (unlike the nullable-ref contract
// for row-scoped targets elsewhere) — archive acts on `props.project`
// itself, there is no "which row" to carry.
const archiveConfirm = ref(false)
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const errors = ref<{
  name?: string
  slug?: string
  roleCode?: string
  pauseEveryNCompetencies?: string
  nudgeMinChars?: string
  exitRedirectUrl?: string
  webhookUrl?: string
  avatarTemplateId?: string
}>({})

const competencyOptions = ref<CompetencyOption[]>([])

/**
 * Joins a field's error id (when invalid) with its help-text id (form-clarity-
 * and-console-warnings, D6) — a control is described by whichever of the two
 * currently apply, never just one at the expense of the other.
 */
function describedBy(baseId: string, hasError: boolean): string {
  const ids = [hasError ? `${baseId}-error` : null, `${baseId}-help`].filter(
    (id): id is string => id !== null
  )

  return ids.join(' ')
}

// assessment_type and role_code freeze once the project is live (D9); this
// is a DIFFERENT gate than framework_version_id, which is always disabled
// once editing (see the `:disabled="isEditing"` binding above it).
const lockedWhenLive = computed(
  () =>
    isEditing.value && (props.project?.status === 'active' || props.project?.status === 'archived')
)

// D2: scoped to the project's ORIGINAL role_code, not the currently-selected
// one. Without this comparison the escape hatch leaks — the role-change
// watcher below already clears `competencyIds` on a role change, so a stale
// `persistedIds` would re-enable competencies that were never attached under
// the newly-selected role. Empty on create (nothing persisted yet), so every
// uncovered option is disabled — there is no existing commitment to honour.
const persistedIds = computed<number[]>(() =>
  roleCode.value === props.project?.role_code
    ? (props.project?.competencies ?? []).map((c) => c.id)
    : []
)

const nextTransition = computed<'active' | 'archived' | null>(() => {
  if (!isEditing.value) return null
  if (props.project?.status === 'draft') return 'active'
  if (props.project?.status === 'active') return 'archived'
  return null
})

function validateName(): boolean {
  errors.value.name = name.value.trim() === '' ? undefined : errors.value.name
  if (name.value.trim() === '') errors.value.name = missingKey('nameRequired')
  else errors.value.name = undefined
  return !errors.value.name
}

function validateSlug(): boolean {
  errors.value.slug = slug.value.trim() === '' ? missingKey('slugRequired') : undefined
  return !errors.value.slug
}

function validatePauseEveryNCompetencies(): boolean {
  const raw = pauseEveryNCompetencies.value
  const value = raw === '' ? null : Number(raw)
  errors.value.pauseEveryNCompetencies = isPauseEveryNCompetenciesValid(value)
    ? undefined
    : rangeKey(PROJECT_FIELD_BOUNDS.pauseEveryNCompetencies)
  return !errors.value.pauseEveryNCompetencies
}

function validateNudgeMinChars(): boolean {
  const raw = nudgeMinChars.value
  const value = raw === '' ? null : Number(raw)
  errors.value.nudgeMinChars = isNudgeMinCharsValid(value)
    ? undefined
    : rangeKey(PROJECT_FIELD_BOUNDS.nudgeMinChars)
  return !errors.value.nudgeMinChars
}

function validateExitRedirectUrl(): boolean {
  errors.value.exitRedirectUrl = isProjectUrlValid(exitRedirectUrl.value)
    ? undefined
    : t('projects.form.invalidUrl')
  return !errors.value.exitRedirectUrl
}

function validateWebhookUrl(): boolean {
  errors.value.webhookUrl = isProjectUrlValid(webhookUrl.value)
    ? undefined
    : t('projects.form.invalidUrl')
  return !errors.value.webhookUrl
}

function validateRoleCode(): boolean {
  if (assessmentType.value !== 'standard') {
    errors.value.roleCode = undefined
    return true
  }
  errors.value.roleCode = roleCode.value === '' ? missingKey('roleCodeRequired') : undefined
  return !errors.value.roleCode
}

function validateAvatarTemplate(): boolean {
  // Enforced server-side too (the column is NOT NULL with a restricting
  // foreign key). Checked here so the operator is told WHICH control is
  // missing, instead of getting the form-level "could not save" banner that an
  // unmapped server error produces.
  errors.value.avatarTemplateId =
    avatarTemplateId.value === null ? missingKey('avatarTemplateRequired') : undefined

  return !errors.value.avatarTemplateId
}

// useI18n() is a Nuxt auto-import, same convention as CandidateTable.vue.
const { t, te } = useI18n()

function missingKey(key: string): string {
  return t(`projects.form.${key}`)
}

function rangeKey(bounds: { min: number; max: number }): string {
  return t('projects.form.outOfRange', { min: bounds.min, max: bounds.max })
}

function onAssessmentTypeChange(value: unknown): void {
  if (value !== 'standard' && value !== 'potential') return
  assessmentType.value = value
  if (value === 'potential') roleCode.value = ''
}

async function loadCompetencyOptions(): Promise<void> {
  if (assessmentType.value === 'potential') {
    competencyOptions.value = POTENTIAL_COMPETENCIES
    return
  }
  if (!roleCode.value) {
    competencyOptions.value = []
    return
  }
  try {
    const response = await fetchRoleCompetencies(roleCode.value)
    competencyOptions.value = response.data.map((competency) => ({
      // Carried through because `StoreProjectRequest.competency_ids` validates
      // integer primary keys. Dropping it made `CompetencyPicker.toggle()`
      // return early on every click — the boxes rendered, refused to tick, and
      // the form could never assemble a submittable payload. The catalog
      // endpoint exposes the id now (see CompetencyResource); the picker's and
      // this file's notes about the missing id are resolved.
      id: competency.id,
      code: competency.code,
      // `CompetencyResource.name` is now typed `string` in the generated
      // client (generated-client-truth-and-session-safety D1) — the
      // `@scramble-return` annotation on `CompetencyResource` documents the
      // `HasTranslations` property-read interception directly, so the
      // `String()` conversion this comment used to defend is gone with it.
      name: competency.name,
      // bars-coverage-visibility D1/D2: the catalog endpoint's own
      // `bars_available` flag, threaded through unchanged — previously
      // dropped here entirely. `FrameworkController::roleCompetencies`
      // already scopes this to the CURRENT role×competency pair.
      barsAvailable: competency.bars_available,
    }))
  } catch {
    competencyOptions.value = []
  }
}

/**
 * Server field name -> local error key.
 *
 * Table-driven, and covering EVERY field this form submits, because the
 * hand-written version covered three of them: a 422 on `webhook_url`,
 * `exit_redirect_url`, `pause_every_n_competencies`, `nudge_min_chars`,
 * `assessment_type`, `language`, `competency_ids` or `framework_version_id`
 * was silently reduced to a generic "could not save" banner, leaving the
 * operator to guess which field the server had refused.
 */
const SERVER_FIELD_TO_ERROR_KEY = {
  name: 'name',
  slug: 'slug',
  role_code: 'roleCode',
  pause_every_n_competencies: 'pauseEveryNCompetencies',
  nudge_min_chars: 'nudgeMinChars',
  exit_redirect_url: 'exitRedirectUrl',
  webhook_url: 'webhookUrl',
} as const satisfies Record<string, keyof typeof errors.value>

function applyServerErrors(error: unknown): void {
  // `competency_ids.*` and friends: Laravel reports per-index keys, which
  // belong to the same control as their parent — `applyServerFieldErrors`
  // splits at the first `.` so they still land here.
  const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
    errors.value[key] = message
  })

  if (unmapped === null) {
    // No field errors at all. That is not always "the payload was fine" — a
    // 422 can also refuse for a reason no control on this form can fix, and
    // it says so with a machine `code` beside its prose (e.g.
    // POTENTIAL_CATALOG_INCOMPLETE, when a `potential` project is created
    // against a catalogue with no MTG/LAT seeded). Sending the operator to
    // "check the highlighted fields" then points them at fields that were
    // never the problem, with nothing highlighted to check.
    const code = serverErrorCode(error)

    formMessage.value = {
      kind: 'error',
      text: code
        ? translateServerCode({ t, te }, 'projects.form.serverError', code)
        : t('projects.form.saveError'),
    }

    return
  }

  // A field with no control of its own (framework_version_id, status,
  // webhook_secret, competency_ids) still has to reach the operator — showing
  // the server's own message beats a generic banner that hides it.
  formMessage.value = {
    kind: 'error',
    text: unmapped.length > 0 ? unmapped.join(' ') : t('projects.form.saveError'),
  }
}

async function onSubmit(): Promise<void> {
  formMessage.value = null

  const nameOk = validateName()
  const slugOk = validateSlug()
  const roleOk = validateRoleCode()
  const pauseOk = validatePauseEveryNCompetencies()
  const nudgeOk = validateNudgeMinChars()
  const exitUrlOk = validateExitRedirectUrl()
  const webhookUrlOk = validateWebhookUrl()
  const templateOk = validateAvatarTemplate()

  if (
    !nameOk ||
    !slugOk ||
    !roleOk ||
    !pauseOk ||
    !nudgeOk ||
    !exitUrlOk ||
    !webhookUrlOk ||
    !templateOk
  ) {
    return
  }

  // Narrowed by `templateOk` above — the payload type says `number`, and it is
  // one by the time we get here.
  const avatarTemplate = avatarTemplateId.value as number

  saving.value = true
  try {
    if (isEditing.value && props.project) {
      await updateProject(props.project.id, {
        name: name.value,
        slug: slug.value,
        language: language.value as 'en' | 'it',
        assessment_type: assessmentType.value,
        role_code: assessmentType.value === 'potential' ? null : roleCode.value || null,
        pause_every_n_competencies: pauseEveryNCompetencies.value
          ? Number(pauseEveryNCompetencies.value)
          : null,
        nudge_min_chars: nudgeMinChars.value ? Number(nudgeMinChars.value) : null,
        exit_redirect_url: exitRedirectUrl.value || null,
        // Sent unconditionally. `sometimes` on the server means an absent key
        // leaves the existing template where it was, so a change of template
        // that arrived as "unset" would silently not apply.
        avatar_template_id: avatarTemplate,
        webhook_url: webhookUrl.value || null,
        competency_ids: competencyIds.value,
        ...(webhookSecret.value !== undefined ? { webhook_secret: webhookSecret.value } : {}),
      })
    } else {
      await createProject({
        framework_version_id: Number(frameworkVersionId.value),
        slug: slug.value,
        name: name.value,
        assessment_type: assessmentType.value,
        role_code: assessmentType.value === 'potential' ? null : roleCode.value || null,
        language: language.value as 'en' | 'it',
        pause_every_n_competencies: pauseEveryNCompetencies.value
          ? Number(pauseEveryNCompetencies.value)
          : null,
        nudge_min_chars: nudgeMinChars.value ? Number(nudgeMinChars.value) : null,
        exit_redirect_url: exitRedirectUrl.value || null,
        // Sent unconditionally. `sometimes` on the server means an absent key
        // leaves the existing template where it was, so a change of template
        // that arrived as "unset" would silently not apply.
        avatar_template_id: avatarTemplate,
        webhook_url: webhookUrl.value || null,
        competency_ids: competencyIds.value,
        ...(webhookSecret.value !== undefined ? { webhook_secret: webhookSecret.value } : {}),
      })
    }
    emit('saved')
  } catch (error) {
    applyServerErrors(error)
  } finally {
    saving.value = false
  }
}

async function onTransition(status: 'active' | 'archived'): Promise<void> {
  if (!props.project) return
  saving.value = true
  try {
    await updateProject(props.project.id, { status })
    emit('saved')
  } catch (error) {
    applyServerErrors(error)
  } finally {
    saving.value = false
  }
}

// D7: clear the confirmation flag FIRST, then act — the call-site contract
// (design.md D4) — so a late spurious 'cancel' from reka-ui's own
// close-on-click is idempotent instead of a race. `onTransition` is
// unchanged above; this is its only caller for 'archived'.
async function onArchiveConfirmed(): Promise<void> {
  archiveConfirm.value = false
  await onTransition('archived')
}

onMounted(() => {
  void loadCompetencyOptions()
  void loadAvatarTemplates()
})

/**
 * The organization's avatar templates, for the per-project pin.
 *
 * A rejected load leaves the list empty and the control rendered with only the
 * organization-default option — never blocks the form. This is one optional
 * setting among many, and an operator must still be able to save a name change
 * when the template endpoint is having a bad day. That is also why nothing
 * here writes to `errors`: a background read failing is not a validation
 * problem with anything the operator typed.
 */
async function loadAvatarTemplates(): Promise<void> {
  try {
    const response = await listTemplateOptions()
    avatarTemplates.value = response.data
    applyDefaultTemplate()
  } catch {
    avatarTemplates.value = []
  }
}

/**
 * Pre-select a template for a project that has not chosen one.
 *
 * `projects.avatar_template_id` is required, so an empty select would be a form
 * that cannot be submitted until the operator notices a field they did not know
 * was mandatory. Choosing for them is only defensible while they can still
 * change it, which they can.
 *
 * "The one the organization is using" is the ACTIVE template — the closest
 * available reading of "the last one used", and an honest one: there is no
 * last-used timestamp on this endpoint, and inventing one from list order would
 * be a guess dressed as a fact. Falls back to the first template when none is
 * active.
 *
 * NEVER overwrites an existing pin. The default is for a project that has made
 * no choice; applying it to one that has would silently re-point a live project
 * every time somebody opened the form to rename it.
 */
function applyDefaultTemplate(): void {
  if (avatarTemplateId.value !== null) return

  const preferred =
    avatarTemplates.value.find((template) => template.is_active) ?? avatarTemplates.value[0]

  avatarTemplateId.value = preferred?.id ?? null
}

function onAvatarTemplateChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  // '' is the organization-default option, and must reach the server as an
  // explicit null — never be dropped as "unchanged", or unpinning would be
  // impossible once a template had been pinned.
  avatarTemplateId.value = select.value === '' ? null : Number(select.value)
}

// Reloading on change is what makes the picker usable at all, not a
// refinement. `onMounted` alone meant the options were fetched once, for
// whatever role the form opened with — which on CREATE is none. Picking a role
// then left the list permanently empty ("no competencies available"), and since
// a standard project requires at least one competency, no project could ever be
// created through this form. Unit tests missed it because they mock the
// composable and never drive the select; E2E caught it on the first real run.
//
// Clearing the selection is deliberate: competency ids belong to the role they
// were listed for, so carrying them across a role change would submit ids that
// the server's cross-field rule rejects as not assigned to the new role.
watch([roleCode, assessmentType], () => {
  competencyIds.value = []
  void loadCompetencyOptions()
})
</script>
