/**
 * useProjectFormValidation — the 9 inline field validators extracted out of
 * ProjectForm.vue (backoffice code-quality audit, item "split ProjectForm.vue").
 *
 * Behaviour is copied verbatim from the component's own `validate*` functions
 * — this file exists to prove the extraction did not change any rule, not to
 * introduce new ones.
 */
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
// `useI18n` is a global stub from tests/unit/setup.ts (identity `t`, `te` always
// true) — same convention every other composable/component spec in this repo
// relies on, not re-mocked here.
import { useProjectFormValidation } from '../../../app/composables/useProjectFormValidation'

function makeFields(overrides: Partial<Parameters<typeof useProjectFormValidation>[0]> = {}) {
  return {
    name: ref(''),
    slug: ref(''),
    roleCode: ref(''),
    assessmentType: ref<'standard' | 'potential'>('standard'),
    pauseEveryNCompetencies: ref<string | number>(''),
    nudgeMinChars: ref<string | number>(''),
    exitRedirectUrl: ref(''),
    webhookUrl: ref(''),
    avatarTemplateId: ref<number | null>(null),
    frameworkVersionId: ref<number | null>(null),
    isEditing: computed(() => false),
    ...overrides,
  }
}

describe('useProjectFormValidation', () => {
  it('validateName refuses a blank/whitespace-only name', () => {
    const fields = makeFields({ name: ref('   ') })
    const { validateName, errors } = useProjectFormValidation(fields)

    expect(validateName()).toBe(false)
    expect(errors.value.name).toBeDefined()
  })

  it('validateName accepts a non-blank name and clears any prior error', () => {
    const fields = makeFields({ name: ref('Onboarding ICO') })
    const { validateName, errors } = useProjectFormValidation(fields)

    expect(validateName()).toBe(true)
    expect(errors.value.name).toBeUndefined()
  })

  it('validateSlug refuses a blank slug', () => {
    const fields = makeFields({ slug: ref('') })
    const { validateSlug, errors } = useProjectFormValidation(fields)

    expect(validateSlug()).toBe(false)
    expect(errors.value.slug).toBeDefined()
  })

  it('validateSlug accepts a non-blank slug', () => {
    const fields = makeFields({ slug: ref('ico-sales') })
    const { validateSlug } = useProjectFormValidation(fields)

    expect(validateSlug()).toBe(true)
  })

  it('validateRoleCode is a no-op (always valid) when assessmentType is potential', () => {
    const fields = makeFields({ assessmentType: ref('potential'), roleCode: ref('') })
    const { validateRoleCode, errors } = useProjectFormValidation(fields)

    expect(validateRoleCode()).toBe(true)
    expect(errors.value.roleCode).toBeUndefined()
  })

  it('validateRoleCode refuses an empty role_code when assessmentType is standard', () => {
    const fields = makeFields({ assessmentType: ref('standard'), roleCode: ref('') })
    const { validateRoleCode, errors } = useProjectFormValidation(fields)

    expect(validateRoleCode()).toBe(false)
    expect(errors.value.roleCode).toBeDefined()
  })

  it('validateRoleCode accepts a non-empty role_code when assessmentType is standard', () => {
    const fields = makeFields({ assessmentType: ref('standard'), roleCode: ref('ICO') })
    const { validateRoleCode } = useProjectFormValidation(fields)

    expect(validateRoleCode()).toBe(true)
  })

  it('validatePauseEveryNCompetencies refuses an out-of-range value', () => {
    const fields = makeFields({ pauseEveryNCompetencies: ref(0) })
    const { validatePauseEveryNCompetencies, errors } = useProjectFormValidation(fields)

    expect(validatePauseEveryNCompetencies()).toBe(false)
    expect(errors.value.pauseEveryNCompetencies).toBeDefined()
  })

  it('validatePauseEveryNCompetencies accepts an empty value (nullable field)', () => {
    const fields = makeFields({ pauseEveryNCompetencies: ref('') })
    const { validatePauseEveryNCompetencies } = useProjectFormValidation(fields)

    expect(validatePauseEveryNCompetencies()).toBe(true)
  })

  it('validatePauseEveryNCompetencies accepts an in-range value', () => {
    const fields = makeFields({ pauseEveryNCompetencies: ref(3) })
    const { validatePauseEveryNCompetencies } = useProjectFormValidation(fields)

    expect(validatePauseEveryNCompetencies()).toBe(true)
  })

  it('validateNudgeMinChars refuses an out-of-range value', () => {
    const fields = makeFields({ nudgeMinChars: ref(-1) })
    const { validateNudgeMinChars, errors } = useProjectFormValidation(fields)

    expect(validateNudgeMinChars()).toBe(false)
    expect(errors.value.nudgeMinChars).toBeDefined()
  })

  it('validateNudgeMinChars accepts an in-range value', () => {
    const fields = makeFields({ nudgeMinChars: ref(120) })
    const { validateNudgeMinChars } = useProjectFormValidation(fields)

    expect(validateNudgeMinChars()).toBe(true)
  })

  it('validateExitRedirectUrl refuses a malformed URL', () => {
    const fields = makeFields({ exitRedirectUrl: ref('not a url') })
    const { validateExitRedirectUrl, errors } = useProjectFormValidation(fields)

    expect(validateExitRedirectUrl()).toBe(false)
    expect(errors.value.exitRedirectUrl).toBeDefined()
  })

  it('validateExitRedirectUrl accepts an empty value (nullable field)', () => {
    const fields = makeFields({ exitRedirectUrl: ref('') })
    const { validateExitRedirectUrl } = useProjectFormValidation(fields)

    expect(validateExitRedirectUrl()).toBe(true)
  })

  it('validateExitRedirectUrl accepts a well-formed absolute URL', () => {
    const fields = makeFields({ exitRedirectUrl: ref('https://example.test/done') })
    const { validateExitRedirectUrl } = useProjectFormValidation(fields)

    expect(validateExitRedirectUrl()).toBe(true)
  })

  it('validateWebhookUrl refuses a malformed URL', () => {
    const fields = makeFields({ webhookUrl: ref('not a url') })
    const { validateWebhookUrl, errors } = useProjectFormValidation(fields)

    expect(validateWebhookUrl()).toBe(false)
    expect(errors.value.webhookUrl).toBeDefined()
  })

  it('validateWebhookUrl accepts a well-formed absolute URL', () => {
    const fields = makeFields({ webhookUrl: ref('https://example.test/hook') })
    const { validateWebhookUrl } = useProjectFormValidation(fields)

    expect(validateWebhookUrl()).toBe(true)
  })

  it('validateAvatarTemplate refuses a null pin', () => {
    const fields = makeFields({ avatarTemplateId: ref(null) })
    const { validateAvatarTemplate, errors } = useProjectFormValidation(fields)

    expect(validateAvatarTemplate()).toBe(false)
    expect(errors.value.avatarTemplateId).toBeDefined()
  })

  it('validateAvatarTemplate accepts a resolved pin', () => {
    const fields = makeFields({ avatarTemplateId: ref(7) })
    const { validateAvatarTemplate } = useProjectFormValidation(fields)

    expect(validateAvatarTemplate()).toBe(true)
  })

  it('validateFrameworkVersion is always valid while editing, regardless of the pin', () => {
    const fields = makeFields({ frameworkVersionId: ref(null), isEditing: computed(() => true) })
    const { validateFrameworkVersion, errors } = useProjectFormValidation(fields)

    expect(validateFrameworkVersion()).toBe(true)
    expect(errors.value.frameworkVersionId).toBeUndefined()
  })

  it('validateFrameworkVersion refuses a null pin on create', () => {
    const fields = makeFields({
      frameworkVersionId: ref(null),
      isEditing: computed(() => false),
    })
    const { validateFrameworkVersion, errors } = useProjectFormValidation(fields)

    expect(validateFrameworkVersion()).toBe(false)
    expect(errors.value.frameworkVersionId).toBeDefined()
  })

  it('validateFrameworkVersion accepts a resolved pin on create', () => {
    const fields = makeFields({ frameworkVersionId: ref(3), isEditing: computed(() => false) })
    const { validateFrameworkVersion } = useProjectFormValidation(fields)

    expect(validateFrameworkVersion()).toBe(true)
  })

  it('each validator writes into the SAME shared errors object', () => {
    const fields = makeFields({ name: ref(''), slug: ref('') })
    const { validateName, validateSlug, errors } = useProjectFormValidation(fields)

    validateName()
    validateSlug()

    expect(errors.value.name).toBeDefined()
    expect(errors.value.slug).toBeDefined()
  })
})
