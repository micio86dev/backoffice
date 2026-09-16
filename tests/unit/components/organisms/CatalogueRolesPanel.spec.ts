/**
 * CatalogueRolesPanel.vue (framework-catalogue-authoring PR10b)
 *
 * Same table + drawer + dialog shape as `CatalogueCompetenciesPanel.vue`.
 * No competency-set column or control — the contract carries none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key

const listRoles = vi.fn()
const createRole = vi.fn()
const updateRole = vi.fn()
const deleteRole = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({ listRoles, createRole, updateRole, deleteRole }),
}))

const CatalogueRolesPanel = (
  await import('../../../../app/components/organisms/CatalogueRolesPanel.vue')
).default

afterEach(() => {
  document.body.innerHTML = ''
})

describe('CatalogueRolesPanel', () => {
  beforeEach(() => {
    listRoles.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          code: 'ICO',
          revision_id: 1,
          name: { en: 'Individual Contributor' },
          responsibilities: {},
        },
      ],
    })
    createRole.mockReset().mockResolvedValue({ data: {} })
    updateRole.mockReset().mockResolvedValue({ data: {} })
    deleteRole.mockReset().mockResolvedValue(undefined)
  })

  it('lists roles with their code and name', async () => {
    const wrapper = mount(CatalogueRolesPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('ICO')
    expect(wrapper.text()).toContain('Individual Contributor')
  })

  it('names the role→competency assignment gap rather than hiding it', async () => {
    const wrapper = mount(CatalogueRolesPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.get('[data-testid="roles-assignment-note"]').text()).toContain(
      'catalogue.roles.assignmentNote'
    )
  })

  it('shows the empty-state row when the open revision has no roles', async () => {
    listRoles.mockResolvedValue({ data: [] })
    const wrapper = mount(CatalogueRolesPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('catalogue.roles.table.empty')
  })

  it('surfaces a load failure through the shared D4 banner', async () => {
    listRoles.mockRejectedValue(Object.assign(new Error('403'), { status: 403 }))
    const wrapper = mount(CatalogueRolesPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.get('[data-testid="roles-load-error"]').text()).toContain('forbidden')
  })

  it('opens the drawer and creates a role, then reloads and emits refresh-revision', async () => {
    const wrapper = mount(CatalogueRolesPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="roles-new"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="role-form"]'),
      'the role form to mount inside the drawer'
    )

    const codeInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="role-form-code"]'
    )
    codeInput!.value = 'FLL'
    codeInput!.dispatchEvent(new Event('input'))

    const nameInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="role-form-name-en"]'
    )
    nameInput!.value = 'First Line Leader'
    nameInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => createRole.mock.calls.length > 0, 'the create call to fire')
    await flushPromises()

    expect(createRole).toHaveBeenCalled()
    expect(listRoles).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('refresh-revision')).toBeTruthy()

    wrapper.unmount()
  })

  it('deletes only after ConfirmDialog confirms, never on the first click', async () => {
    const wrapper = mount(CatalogueRolesPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="role-delete-1"]').trigger('click')
    expect(deleteRole).not.toHaveBeenCalled()

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => deleteRole.mock.calls.length > 0, 'the delete call to fire')

    expect(deleteRole).toHaveBeenCalledWith(1)

    wrapper.unmount()
  })
})
