import { ref, type ComputedRef, type Ref } from 'vue'
import {
  PROJECT_FIELD_BOUNDS,
  isNudgeMinCharsValid,
  isPauseEveryNCompetenciesValid,
  isProjectUrlValid,
} from '@/utils/project-field-specs'

/**
 * The 9 field-level validators owned by `ProjectForm.vue`, extracted verbatim
 * (backoffice code-quality audit, item "split ProjectForm.vue" — the pure
 * predicates, e.g. `isProjectUrlValid`, already lived in
 * `utils/project-field-specs.ts`; this composable is the error-message
 * orchestration around them the component previously owned directly).
 *
 * Zero behaviour change: same rules, same error keys, same shared `errors`
 * shape the template already binds to (`errors.name`, `errors.slug`, …).
 */
export type ProjectFormErrors = {
  name?: string
  slug?: string
  roleCode?: string
  pauseEveryNCompetencies?: string
  nudgeMinChars?: string
  exitRedirectUrl?: string
  webhookUrl?: string
  avatarTemplateId?: string
  frameworkVersionId?: string
}

export interface ProjectFormValidationFields {
  name: Ref<string>
  slug: Ref<string>
  roleCode: Ref<string>
  assessmentType: Ref<'standard' | 'potential'>
  pauseEveryNCompetencies: Ref<string | number>
  nudgeMinChars: Ref<string | number>
  exitRedirectUrl: Ref<string>
  webhookUrl: Ref<string>
  avatarTemplateId: Ref<number | null>
  frameworkVersionId: Ref<number | null>
  isEditing: ComputedRef<boolean> | Ref<boolean>
}

export function useProjectFormValidation(fields: ProjectFormValidationFields) {
  const { t } = useI18n()

  const errors = ref<ProjectFormErrors>({})

  function missingKey(key: string): string {
    return t(`projects.form.${key}`)
  }

  function rangeKey(bounds: { min: number; max: number }): string {
    return t('projects.form.outOfRange', { min: bounds.min, max: bounds.max })
  }

  /**
   * The pin is required on create, and nothing checked it.
   *
   * Only on CREATE: the control is disabled while editing, and the value is
   * whatever the project was pinned to.
   */
  function validateFrameworkVersion(): boolean {
    if (fields.isEditing.value) {
      errors.value.frameworkVersionId = undefined

      return true
    }

    errors.value.frameworkVersionId =
      fields.frameworkVersionId.value === null
        ? t('projects.form.serverError.framework_version_required')
        : undefined

    return errors.value.frameworkVersionId === undefined
  }

  function validateName(): boolean {
    if (fields.name.value.trim() === '') errors.value.name = missingKey('nameRequired')
    else errors.value.name = undefined
    return !errors.value.name
  }

  function validateSlug(): boolean {
    errors.value.slug = fields.slug.value.trim() === '' ? missingKey('slugRequired') : undefined
    return !errors.value.slug
  }

  function validatePauseEveryNCompetencies(): boolean {
    const raw = fields.pauseEveryNCompetencies.value
    const value = raw === '' ? null : Number(raw)
    errors.value.pauseEveryNCompetencies = isPauseEveryNCompetenciesValid(value)
      ? undefined
      : rangeKey(PROJECT_FIELD_BOUNDS.pauseEveryNCompetencies)
    return !errors.value.pauseEveryNCompetencies
  }

  function validateNudgeMinChars(): boolean {
    const raw = fields.nudgeMinChars.value
    const value = raw === '' ? null : Number(raw)
    errors.value.nudgeMinChars = isNudgeMinCharsValid(value)
      ? undefined
      : rangeKey(PROJECT_FIELD_BOUNDS.nudgeMinChars)
    return !errors.value.nudgeMinChars
  }

  function validateExitRedirectUrl(): boolean {
    errors.value.exitRedirectUrl = isProjectUrlValid(fields.exitRedirectUrl.value)
      ? undefined
      : t('projects.form.invalidUrl')
    return !errors.value.exitRedirectUrl
  }

  function validateWebhookUrl(): boolean {
    errors.value.webhookUrl = isProjectUrlValid(fields.webhookUrl.value)
      ? undefined
      : t('projects.form.invalidUrl')
    return !errors.value.webhookUrl
  }

  function validateRoleCode(): boolean {
    if (fields.assessmentType.value !== 'standard') {
      errors.value.roleCode = undefined
      return true
    }
    errors.value.roleCode =
      fields.roleCode.value === '' ? missingKey('roleCodeRequired') : undefined
    return !errors.value.roleCode
  }

  function validateAvatarTemplate(): boolean {
    // Enforced server-side too (the column is NOT NULL with a restricting
    // foreign key). Checked here so the operator is told WHICH control is
    // missing, instead of getting the form-level "could not save" banner that
    // an unmapped server error produces.
    errors.value.avatarTemplateId =
      fields.avatarTemplateId.value === null ? missingKey('avatarTemplateRequired') : undefined

    return !errors.value.avatarTemplateId
  }

  return {
    errors,
    validateName,
    validateSlug,
    validateRoleCode,
    validatePauseEveryNCompetencies,
    validateNudgeMinChars,
    validateExitRedirectUrl,
    validateWebhookUrl,
    validateAvatarTemplate,
    validateFrameworkVersion,
  }
}
