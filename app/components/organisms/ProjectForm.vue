<template>
  <form data-testid="project-form" novalidate @submit.prevent="onSubmit">
    <FieldGroup>
      <Field :data-invalid="Boolean(errors.name)">
        <FieldLabel for="project-form-name">{{ $t('projects.form.name') }}</FieldLabel>
        <Input
          id="project-form-name"
          v-model="name"
          :aria-invalid="Boolean(errors.name)"
          :aria-describedby="errors.name ? 'project-form-name-error' : undefined"
          data-testid="project-form-name"
          @blur="validateName"
        />
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
          :aria-invalid="Boolean(errors.slug)"
          :aria-describedby="errors.slug ? 'project-form-slug-error' : undefined"
          data-testid="project-form-slug"
          @blur="validateSlug"
        />
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
          <SelectTrigger id="project-form-language" data-testid="project-form-language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="en">EN</SelectItem>
              <SelectItem value="it">IT</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
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
            :aria-describedby="errors.roleCode ? 'project-form-role-code-error' : undefined"
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
        <FieldDescription>{{ $t('projects.form.roleCodeRequiredForStandard') }}</FieldDescription>
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
          :disabled="isEditing"
          data-testid="project-form-framework-version"
        />
        <FieldDescription>{{ $t('projects.form.frameworkVersionImmutable') }}</FieldDescription>
      </Field>

      <CompetencyPicker v-model="competencyIds" :options="competencyOptions" />

      <Field :data-invalid="Boolean(errors.pauseEveryNCompetencies)">
        <FieldLabel for="project-form-pause-every-n">
          {{ $t('projects.form.pauseEveryNCompetencies') }}
        </FieldLabel>
        <Input
          id="project-form-pause-every-n"
          v-model="pauseEveryNCompetencies"
          type="number"
          data-testid="project-form-pause-every-n"
          @blur="validatePauseEveryNCompetencies"
        />
        <FieldError
          v-if="errors.pauseEveryNCompetencies"
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
          data-testid="project-form-nudge-min-chars"
          @blur="validateNudgeMinChars"
        />
        <FieldError v-if="errors.nudgeMinChars" data-testid="project-form-nudge-min-chars-error">
          {{ errors.nudgeMinChars }}
        </FieldError>
      </Field>

      <Field>
        <FieldLabel for="project-form-exit-redirect-url">
          {{ $t('projects.form.exitRedirectUrl') }}
        </FieldLabel>
        <Input
          id="project-form-exit-redirect-url"
          v-model="exitRedirectUrl"
          type="url"
          data-testid="project-form-exit-redirect-url"
        />
      </Field>

      <Field>
        <FieldLabel for="project-form-webhook-url">{{ $t('projects.form.webhookUrl') }}</FieldLabel>
        <Input
          id="project-form-webhook-url"
          v-model="webhookUrl"
          type="url"
          data-testid="project-form-webhook-url"
        />
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

      <Alert
        v-if="formMessage"
        :variant="formMessage.kind === 'error' ? 'destructive' : 'default'"
        role="alert"
        aria-live="polite"
        data-testid="project-form-banner"
      >
        <AlertDescription>{{ formMessage.text }}</AlertDescription>
      </Alert>

      <div class="flex items-center gap-2">
        <Button type="submit" :disabled="saving" data-testid="project-form-submit">
          {{ saving ? $t('projects.action.save') : $t('projects.action.save') }}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="project-form-cancel"
          @click="$emit('close')"
        >
          {{ $t('projects.action.cancel') }}
        </Button>
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
          @click="onTransition('archived')"
        >
          {{ $t('projects.action.archive') }}
        </Button>
      </div>
    </FieldGroup>
  </form>
</template>

<script setup lang="ts">
// Project create/edit form (D9): mirrors server-side immutability so an
// operator sees a disabled control with a reason instead of an unexplained
// 422. Self-contained (owns its own submit/validation), matching login.vue's
// pattern rather than delegating persistence to the parent.
import { ref, computed, onMounted } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import CompetencyPicker, {
  type CompetencyOption,
} from '@/components/molecules/CompetencyPicker.vue'
import { useProjects, type Project } from '@/composables/useProjects'
import { useFrameworkRoles } from '@/composables/useFrameworkRoles'
import {
  isNudgeMinCharsValid,
  isPauseEveryNCompetenciesValid,
  PROJECT_FIELD_BOUNDS,
} from '@/utils/project-field-specs'
import { getErrorFields } from '@/utils/http-error'

const ROLE_CODES = ['ICO', 'FLL', 'MLL', 'BUL', 'SRX'] as const

// The C3 role-competencies endpoint (`GET /framework/roles/{roleCode}/competencies`)
// serves `code`/`name` only, with no competency `id` — yet
// `StoreProjectRequest.competency_ids` requires integer PKs. D9 assumed this
// endpoint already served the picker's need; it doesn't fully. Options render
// either way (so the operator can see what a role covers), but a selection
// without a resolvable `id` cannot be submitted — see CompetencyPicker.vue's
// own note. Flagged; not silently worked around.
const POTENTIAL_COMPETENCIES: CompetencyOption[] = [{ code: 'MTG' }, { code: 'LAT' }].map((c) => ({
  ...c,
  name: c.code,
}))

const props = defineProps<{
  project: Project | null
}>()

const emit = defineEmits<{
  (e: 'close' | 'saved'): void
}>()

const { createProject, updateProject } = useProjects()
const { fetchRoleCompetencies } = useFrameworkRoles()

const isEditing = computed(() => props.project !== null)

const name = ref(props.project?.name ?? '')
const slug = ref(props.project?.slug ?? '')
const language = ref(props.project?.language ?? 'en')
const assessmentType = ref<'standard' | 'potential'>(
  (props.project?.assessment_type as 'standard' | 'potential') ?? 'standard'
)
const roleCode = ref(props.project?.role_code ?? '')
const frameworkVersionId = ref(props.project?.framework_version_id ?? '')
const competencyIds = ref<number[]>([])
const pauseEveryNCompetencies = ref(props.project?.pause_every_n_competencies ?? '')
const nudgeMinChars = ref(props.project?.nudge_min_chars ?? '')
const exitRedirectUrl = ref(props.project?.exit_redirect_url ?? '')
const webhookUrl = ref(props.project?.webhook_url ?? '')
const webhookSecret = ref<string | undefined>(undefined)

const saving = ref(false)
const formMessage = ref<{ kind: 'error' | 'success'; text: string } | null>(null)
const errors = ref<{
  name?: string
  slug?: string
  roleCode?: string
  pauseEveryNCompetencies?: string
  nudgeMinChars?: string
}>({})

const competencyOptions = ref<CompetencyOption[]>([])

// assessment_type and role_code freeze once the project is live (D9); this
// is a DIFFERENT gate than framework_version_id, which is always disabled
// once editing (see the `:disabled="isEditing"` binding above it).
const lockedWhenLive = computed(
  () =>
    isEditing.value && (props.project?.status === 'active' || props.project?.status === 'archived')
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

function validateRoleCode(): boolean {
  if (assessmentType.value !== 'standard') {
    errors.value.roleCode = undefined
    return true
  }
  errors.value.roleCode = roleCode.value === '' ? missingKey('roleCodeRequired') : undefined
  return !errors.value.roleCode
}

// useI18n() is a Nuxt auto-import, same convention as CandidateTable.vue.
const { t } = useI18n()

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
      code: competency.code,
      // Scramble types `CompetencyResource.name` as `unknown[]` (it cannot
      // resolve the PHP model's locale-dependent accessor), but
      // `FrameworkController` already resolves it to a single localized
      // string server-side (`CompetencyResource.php`'s own docblock: "Uses
      // the current app locale"). `String()` is a no-op against that real
      // runtime value; it exists only to satisfy the (mistyped) generated
      // client without hand-patching `types/api.ts`.
      name: String(competency.name),
    }))
  } catch {
    competencyOptions.value = []
  }
}

function applyServerErrors(error: unknown): void {
  const fields = getErrorFields(error)
  if (fields === null) {
    formMessage.value = { kind: 'error', text: t('projects.form.saveError') }
    return
  }

  if (fields['name']) errors.value.name = fields['name'][0]
  if (fields['slug']) errors.value.slug = fields['slug'][0]
  if (fields['role_code']) errors.value.roleCode = fields['role_code'][0]
  formMessage.value = { kind: 'error', text: t('projects.form.saveError') }
}

async function onSubmit(): Promise<void> {
  formMessage.value = null

  const nameOk = validateName()
  const slugOk = validateSlug()
  const roleOk = validateRoleCode()
  const pauseOk = validatePauseEveryNCompetencies()
  const nudgeOk = validateNudgeMinChars()

  if (!nameOk || !slugOk || !roleOk || !pauseOk || !nudgeOk) return

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
        webhook_url: webhookUrl.value || null,
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
        webhook_url: webhookUrl.value || null,
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

onMounted(() => {
  void loadCompetencyOptions()
})
</script>
