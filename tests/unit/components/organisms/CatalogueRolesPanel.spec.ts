/**
 * CatalogueRolesPanel.vue (framework-catalogue-authoring PR10b/PR10c)
 *
 * Same table + drawer + dialog shape as `CatalogueCompetenciesPanel.vue`.
 * PR10c adds a second drawer per row — `RoleCompetenciesForm` — for editing
 * that role's ordered competency set; the "not supported yet" copy PR10b
 * shipped is gone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key

const listRoles = vi.fn()
const createRole = vi.fn()
const updateRole = vi.fn()
const deleteRole = vi.fn()
const updateRoleCompetencies = vi.fn()
const listCompetencies = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({
    listRoles,
    createRole,
    updateRole,
    deleteRole,
    updateRoleCompetencies,
    listCompetencies,
  }),
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
          competency_ids: [11],
        },
      ],
    })
    createRole.mockReset().mockResolvedValue({ data: {} })
    updateRole.mockReset().mockResolvedValue({ data: {} })
    deleteRole.mockReset().mockResolvedValue(undefined)
    updateRoleCompetencies.mockReset().mockResolvedValue({ data: {} })
    listCompetencies.mockReset().mockResolvedValue({
      data: [
        { id: 11, code: 'COL', revision_id: 1, type: 'standard', name: {}, definition: {} },
        { id: 22, code: 'STG', revision_id: 1, type: 'standard', name: {}, definition: {} },
        { id: 99, code: 'MTG', revision_id: 1, type: 'potential', name: {}, definition: {} },
      ],
    })
  })

  it('lists roles with their code and name', async () => {
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('ICO')
    expect(wrapper.text()).toContain('Individual Contributor')
  })

  it('names how to reach role→competency assignment rather than a dead-end note', async () => {
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="roles-assignment-note"]').text()).toContain(
      'catalogue.roles.assignmentNote'
    )
  })

  it('opens the competencies drawer, edits the set and saves it, then reloads', async () => {
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="role-competencies-1"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="role-competencies-form"]'),
      'the role competencies form to mount inside the drawer'
    )

    // Only the standard, not-yet-assigned STG competency is offered — MTG
    // (potential) never appears, and COL is already assigned.
    document.body
      .querySelector<HTMLButtonElement>('[data-testid="role-competencies-add-select"]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await waitFor(
      () => (document.body.textContent ?? '').includes('STG'),
      'the add select to render STG'
    )
    expect(document.body.textContent ?? '').not.toContain('MTG')

    const option = Array.from(document.body.querySelectorAll('[role="option"]')).find((el) =>
      (el.textContent ?? '').includes('STG')
    )
    option?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await flushPromises()

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="role-competencies-add-button"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => updateRoleCompetencies.mock.calls.length > 0, 'the save call to fire')
    await flushPromises()

    expect(updateRoleCompetencies).toHaveBeenCalledWith(1, { competency_ids: [11, 22] })
    expect(listRoles).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('refresh-revision')).toBeTruthy()

    wrapper.unmount()
  })

  it('shows the empty-state row when the open revision has no roles', async () => {
    listRoles.mockResolvedValue({ data: [] })
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('catalogue.roles.table.empty')
  })

  it('surfaces a load failure through the shared D4 banner', async () => {
    listRoles.mockRejectedValue(Object.assign(new Error('403'), { status: 403 }))
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="roles-load-error"]').text()).toContain('forbidden')
  })

  it('opens the drawer and creates a role, then reloads and emits refresh-revision', async () => {
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: true },
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
      props: { editable: true },
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

describe('CatalogueRolesPanel — read-only (published revision)', () => {
  beforeEach(() => {
    listRoles.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          code: 'ICO',
          revision_id: 1,
          name: { en: 'Individual Contributor' },
          responsibilities: {},
          competency_ids: [22, 11],
        },
        {
          id: 2,
          code: 'FLL',
          revision_id: 1,
          name: { en: 'First Line Leader' },
          responsibilities: {},
          competency_ids: [],
        },
      ],
    })
    listCompetencies.mockReset().mockResolvedValue({
      data: [
        { id: 11, code: 'COL', revision_id: 1, type: 'standard', name: {}, definition: {} },
        { id: 22, code: 'STG', revision_id: 1, type: 'standard', name: {}, definition: {} },
      ],
    })
  })

  it('lists roles with their competency codes in assigned order, and no edit control', async () => {
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: false },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="role-competency-codes-1"]').text()).toBe('STG, COL')
    expect(wrapper.get('[data-testid="role-competency-codes-2"]').text()).toBe(
      'catalogue.roles.table.noCompetencies'
    )
    expect(wrapper.find('[data-testid="roles-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="roles-assignment-note"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="role-competencies-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="role-edit-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="role-delete-1"]').exists()).toBe(false)
  })

  it('shows the assignment and edit controls once the panel is editable', async () => {
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="roles-new"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="role-competencies-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="role-edit-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="role-delete-1"]').exists()).toBe(true)
  })
})

describe('CatalogueRolesPanel — names, editing, dismissal and refused deletes', () => {
  const role = (id: number, code: string, name: Record<string, string> | null) => ({
    id,
    code,
    revision_id: 1,
    name,
    responsibilities: {},
    competency_ids: [],
  })

  beforeEach(() => {
    listRoles.mockReset().mockResolvedValue({
      data: [
        role(1, 'ICO', { en: 'Individual Contributor' }),
        role(2, 'FLL', { it: 'Primo livello', en: 'First Line' }),
        role(3, 'MLL', {}),
      ],
    })
    updateRole.mockReset().mockResolvedValue({ data: {} })
    deleteRole.mockReset().mockResolvedValue(undefined)
    listCompetencies.mockReset().mockResolvedValue({ data: [] })
  })

  async function mountPanel() {
    const wrapper = mount(CatalogueRolesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  async function confirmDelete(wrapper: Awaited<ReturnType<typeof mountPanel>>) {
    await wrapper.get('[data-testid="role-delete-1"]').trigger('click')
    const button = await waitFor(
      () =>
        document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-confirm"]'),
      'the confirm button'
    )
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  }

  const escape = (testId: string) =>
    document.body
      .querySelector(`[data-testid="${testId}"]`)!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )

  it('prefers the UI locale, falls back to English, and marks a nameless role for assistive tech', async () => {
    const wrapper = await mountPanel()
    const rows = wrapper.findAll('tbody tr')

    expect(rows[0]!.text()).toContain('Individual Contributor')
    expect(rows[1]!.text()).toContain('Primo livello')
    expect(rows[1]!.text()).not.toContain('First Line')
    expect(rows[2]!.text()).toContain('catalogue.roles.table.noName')

    wrapper.unmount()
  })

  it('opens the edit drawer prefilled with that role and saves against its id', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="role-edit-1"]').trigger('click')
    const code = await waitFor(
      () => document.body.querySelector<HTMLInputElement>('[data-testid="role-form-code"]'),
      'the role form to mount'
    )
    expect(code.value).toBe('ICO')

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => updateRole.mock.calls.length > 0, 'the update call')
    await flushPromises()

    expect(updateRole.mock.calls[0]?.[0]).toBe(1)
    expect(wrapper.emitted('refresh-revision')).toBeTruthy()

    wrapper.unmount()
  })

  it('closes the edit drawer on Escape without saving', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="role-edit-1"]').trigger('click')
    await waitFor(() => document.body.querySelector('[data-testid="role-form"]'), 'the form')

    escape('role-form')
    await waitFor(() => !document.body.querySelector('[data-testid="role-form"]'), 'it to close')

    expect(updateRole).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('closes the competencies drawer on Escape without saving', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="role-competencies-1"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="role-competencies-form"]'),
      'the form'
    )

    escape('role-competencies-form')
    await waitFor(
      () => !document.body.querySelector('[data-testid="role-competencies-form"]'),
      'it to close'
    )

    expect(updateRoleCompetencies).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('reloads and announces a successful delete', async () => {
    const wrapper = await mountPanel()
    await confirmDelete(wrapper)

    expect(deleteRole).toHaveBeenCalledWith(1)
    expect(listRoles).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('refresh-revision')).toHaveLength(1)
    expect(wrapper.find('[data-testid="roles-action-error"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('keeps its own delete-failure copy for an unclassified error and does not reload', async () => {
    deleteRole.mockRejectedValueOnce(new Error('network'))
    const wrapper = await mountPanel()
    await confirmDelete(wrapper)

    expect(wrapper.get('[data-testid="roles-action-error"]').text()).toContain(
      'catalogue.roles.deleteError'
    )
    expect(listRoles).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('refresh-revision')).toBeUndefined()

    wrapper.unmount()
  })

  it('renders a 403 on delete as itself, not as the generic delete error', async () => {
    deleteRole.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403 }))
    const wrapper = await mountPanel()
    await confirmDelete(wrapper)

    const text = wrapper.get('[data-testid="roles-action-error"]').text()
    expect(text).toContain('forbidden')
    expect(text).not.toContain('catalogue.roles.deleteError')

    wrapper.unmount()
  })
})
