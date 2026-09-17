/**
 * CompetencyForm.vue (framework-catalogue-authoring PR10b)
 *
 * Client-side validation (code shape, English name/definition required) plus
 * D4 server field-error mapping — same doctrine as `UserForm.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'

const tMock = (key: string) => key
const createCompetencyMock = vi.fn()
const updateCompetencyMock = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({
    createCompetency: createCompetencyMock,
    updateCompetency: updateCompetencyMock,
  }),
}))

const CompetencyForm = (await import('../../../../app/components/organisms/CompetencyForm.vue'))
  .default

vi.stubGlobal('useI18n', () => realI18n())

describe('CompetencyForm', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    createCompetencyMock.mockReset().mockResolvedValue({ data: {} })
    updateCompetencyMock.mockReset().mockResolvedValue({ data: {} })
  })

  it('refuses submit with a blank code, English name or English definition', async () => {
    const wrapper = mount(CompetencyForm, {
      props: { competency: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="competency-form"]').trigger('submit')

    expect(wrapper.get('[data-testid="competency-form-code-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="competency-form-name-en-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="competency-form-definition-en-error"]').exists()).toBe(true)
    expect(createCompetencyMock).not.toHaveBeenCalled()
  })

  it('refuses a code with lowercase letters or over 16 characters', async () => {
    const wrapper = mount(CompetencyForm, {
      props: { competency: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="competency-form-code"]').setValue('not-a-valid-code')
    await wrapper.get('[data-testid="competency-form"]').trigger('submit')

    expect(wrapper.get('[data-testid="competency-form-code-error"]').text()).toContain(
      'catalogue.form.codeInvalid'
    )
  })

  it('creates a competency, omitting a blank Italian name/definition', async () => {
    const wrapper = mount(CompetencyForm, {
      props: { competency: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="competency-form-code"]').setValue('COL')
    await wrapper.get('[data-testid="competency-form-name-en"]').setValue('Collaboration')
    await wrapper
      .get('[data-testid="competency-form-definition-en"]')
      .setValue('Works well with others.')
    await wrapper.get('[data-testid="competency-form"]').trigger('submit')

    expect(createCompetencyMock).toHaveBeenCalledWith({
      code: 'COL',
      type: 'standard',
      name: { en: 'Collaboration', it: undefined },
      definition: { en: 'Works well with others.', it: undefined },
    })
  })

  it('edits an existing competency, carrying its id', async () => {
    const competency = {
      id: 7,
      code: 'COL',
      revision_id: 1,
      type: 'standard',
      name: { en: 'Collaboration', it: 'Collaborazione' },
      definition: { en: 'Works well with others.', it: 'Lavora bene con gli altri.' },
    }

    const wrapper = mount(CompetencyForm, {
      props: { competency },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="competency-form"]').trigger('submit')

    expect(updateCompetencyMock).toHaveBeenCalledWith(7, {
      code: 'COL',
      type: 'standard',
      name: { en: 'Collaboration', it: 'Collaborazione' },
      definition: { en: 'Works well with others.', it: 'Lavora bene con gli altri.' },
    })
  })

  it('maps a server code_taken refusal onto the code field', async () => {
    createCompetencyMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), { status: 422, data: { errors: { code: ['code_taken'] } } })
    )

    const wrapper = mount(CompetencyForm, {
      props: { competency: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="competency-form-code"]').setValue('COL')
    await wrapper.get('[data-testid="competency-form-name-en"]').setValue('Collaboration')
    await wrapper.get('[data-testid="competency-form-definition-en"]').setValue('Definition.')
    await wrapper.get('[data-testid="competency-form"]').trigger('submit')
    await Promise.resolve()

    expect(wrapper.get('[data-testid="competency-form-code-error"]').text()).toContain(
      'catalogue.serverError.code_taken'
    )
  })

  it('renders a 409 as waiting, never the same red as a genuine save failure', async () => {
    createCompetencyMock.mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }))

    const wrapper = mount(CompetencyForm, {
      props: { competency: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="competency-form-code"]').setValue('COL')
    await wrapper.get('[data-testid="competency-form-name-en"]').setValue('Collaboration')
    await wrapper.get('[data-testid="competency-form-definition-en"]').setValue('Definition.')
    await wrapper.get('[data-testid="competency-form"]').trigger('submit')
    await Promise.resolve()

    const banner = wrapper.get('[data-testid="competency-form-banner"]')
    expect(banner.text()).toContain('errors.states.notReady.message')
    expect(banner.attributes('data-testid')).toBe('competency-form-banner')
  })

  it('does not label the code field with a server refusal of type', async () => {
    createCompetencyMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), { status: 422, data: { errors: { type: ['type_invalid'] } } })
    )

    const wrapper = mount(CompetencyForm, {
      props: { competency: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="competency-form-code"]').setValue('COL')
    await wrapper.get('[data-testid="competency-form-name-en"]').setValue('Collaboration')
    await wrapper.get('[data-testid="competency-form-definition-en"]').setValue('Definition.')
    await wrapper.get('[data-testid="competency-form"]').trigger('submit')
    await Promise.resolve()

    expect(wrapper.find('[data-testid="competency-form-code-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="competency-form-banner"]').text()).toContain(
      'catalogue.serverError.type_invalid'
    )
  })

  it('shows a forbidden banner for a 403 with no field payload', async () => {
    createCompetencyMock.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403 }))

    const wrapper = mount(CompetencyForm, {
      props: { competency: null },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="competency-form-code"]').setValue('COL')
    await wrapper.get('[data-testid="competency-form-name-en"]').setValue('Collaboration')
    await wrapper.get('[data-testid="competency-form-definition-en"]').setValue('Definition.')
    await wrapper.get('[data-testid="competency-form"]').trigger('submit')
    await Promise.resolve()

    expect(wrapper.get('[data-testid="competency-form-banner"]').text()).toContain(
      'errors.states.forbidden.message'
    )
  })
})
