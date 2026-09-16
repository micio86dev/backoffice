/**
 * RoleForm.vue (framework-catalogue-authoring PR10b)
 *
 * Client-side validation (code shape, English name required) plus D4
 * server field-error mapping — same doctrine as `CompetencyForm.spec.ts`.
 * `responsibilities` is optional on BOTH locales, unlike `name`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'

const tMock = (key: string) => key
const createRoleMock = vi.fn()
const updateRoleMock = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({ createRole: createRoleMock, updateRole: updateRoleMock }),
}))

const RoleForm = (await import('../../../../app/components/organisms/RoleForm.vue')).default

vi.stubGlobal('useI18n', () => realI18n())

describe('RoleForm', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    createRoleMock.mockReset().mockResolvedValue({ data: {} })
    updateRoleMock.mockReset().mockResolvedValue({ data: {} })
  })

  it('has a code label key present in BOTH locale files, not just echoed by the test stub', () => {
    // `tMock` (used by every other test in this file) echoes the key back,
    // so a missing translation would still make every assertion pass — the
    // exact gap that let `catalogue.roles.code` ship missing from both
    // locale files with a fully green suite (gga review finding). `te` here
    // is `realI18n()`'s own, which actually reads `en.json`/`it.json`.
    const { te } = realI18n()

    expect(te('catalogue.roles.code')).toBe(true)
  })

  it('refuses submit with a blank code or English name', async () => {
    const wrapper = mount(RoleForm, { props: { role: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="role-form"]').trigger('submit')

    expect(wrapper.get('[data-testid="role-form-code-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="role-form-name-en-error"]').exists()).toBe(true)
    expect(createRoleMock).not.toHaveBeenCalled()
  })

  it('creates a role with responsibilities entirely omitted when both locales are blank', async () => {
    const wrapper = mount(RoleForm, { props: { role: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="role-form-code"]').setValue('ICO')
    await wrapper.get('[data-testid="role-form-name-en"]').setValue('Individual Contributor')
    await wrapper.get('[data-testid="role-form"]').trigger('submit')

    expect(createRoleMock).toHaveBeenCalledWith({
      code: 'ICO',
      name: { en: 'Individual Contributor', it: undefined },
      responsibilities: undefined,
    })
  })

  it('sends only the authored responsibilities locale, never a blank string for the other', async () => {
    const wrapper = mount(RoleForm, { props: { role: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="role-form-code"]').setValue('ICO')
    await wrapper.get('[data-testid="role-form-name-en"]').setValue('Individual Contributor')
    await wrapper.get('[data-testid="role-form-responsibilities-en"]').setValue('Owns delivery.')
    await wrapper.get('[data-testid="role-form"]').trigger('submit')

    expect(createRoleMock).toHaveBeenCalledWith(
      expect.objectContaining({ responsibilities: { en: 'Owns delivery.', it: undefined } })
    )
  })

  it('edits an existing role, carrying its id', async () => {
    const role = {
      id: 4,
      code: 'ICO',
      revision_id: 1,
      name: { en: 'Individual Contributor', it: 'Contributore individuale' },
      responsibilities: { en: 'Owns delivery.' },
    }

    const wrapper = mount(RoleForm, { props: { role }, global: { mocks: { $t: tMock } } })
    await wrapper.get('[data-testid="role-form"]').trigger('submit')

    expect(updateRoleMock).toHaveBeenCalledWith(4, {
      code: 'ICO',
      name: { en: 'Individual Contributor', it: 'Contributore individuale' },
      responsibilities: { en: 'Owns delivery.', it: undefined },
    })
  })

  it('maps a server framework_roles_closed_set refusal onto the code field', async () => {
    createRoleMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { code: ['framework_roles_closed_set'] } },
      })
    )

    const wrapper = mount(RoleForm, { props: { role: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="role-form-code"]').setValue('SIXTH')
    await wrapper.get('[data-testid="role-form-name-en"]').setValue('Sixth Role')
    await wrapper.get('[data-testid="role-form"]').trigger('submit')
    await Promise.resolve()

    expect(wrapper.get('[data-testid="role-form-code-error"]').text()).toContain(
      'catalogue.serverError.framework_roles_closed_set'
    )
  })

  it('renders a 409 as waiting, never the same red as a genuine save failure', async () => {
    createRoleMock.mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }))

    const wrapper = mount(RoleForm, { props: { role: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="role-form-code"]').setValue('ICO')
    await wrapper.get('[data-testid="role-form-name-en"]').setValue('Individual Contributor')
    await wrapper.get('[data-testid="role-form"]').trigger('submit')
    await Promise.resolve()

    expect(wrapper.get('[data-testid="role-form-banner"]').text()).toContain(
      'errors.states.notReady.message'
    )
  })
})
