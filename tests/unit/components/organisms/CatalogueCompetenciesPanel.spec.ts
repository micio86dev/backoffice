/**
 * CatalogueCompetenciesPanel.vue (framework-catalogue-authoring PR10b)
 *
 * List, create/edit via `CompetencyForm` behind a `FormDrawer`, delete only
 * after `ConfirmDialog` confirms — same table + drawer + dialog shape as
 * `UsersPanel.vue`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key

const listCompetencies = vi.fn()
const createCompetency = vi.fn()
const updateCompetency = vi.fn()
const deleteCompetency = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({ listCompetencies, createCompetency, updateCompetency, deleteCompetency }),
}))

const CatalogueCompetenciesPanel = (
  await import('../../../../app/components/organisms/CatalogueCompetenciesPanel.vue')
).default

afterEach(() => {
  document.body.innerHTML = ''
})

describe('CatalogueCompetenciesPanel', () => {
  beforeEach(() => {
    listCompetencies.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          code: 'COL',
          revision_id: 1,
          type: 'standard',
          name: { en: 'Collaboration' },
          definition: { en: 'Works well with others.' },
        },
      ],
    })
    createCompetency.mockReset().mockResolvedValue({ data: {} })
    updateCompetency.mockReset().mockResolvedValue({ data: {} })
    deleteCompetency.mockReset().mockResolvedValue(undefined)
  })

  it('lists competencies with their code, name and type', async () => {
    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('COL')
    expect(wrapper.text()).toContain('Collaboration')
    expect(wrapper.text()).toContain('catalogue.competencies.typeOption.standard')
  })

  it('shows the name in the operator’s own UI locale, not always English', async () => {
    listCompetencies.mockResolvedValue({
      data: [
        {
          id: 2,
          code: 'INN',
          revision_id: 1,
          type: 'standard',
          name: { en: 'Innovation', it: 'Innovazione' },
          definition: { en: 'X' },
        },
      ],
    })

    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    // The global i18n stub (tests/unit/setup.ts) reports the UI locale as
    // 'it' — the same operator-locale convention QuestionListEditor's row
    // summary already follows.
    expect(wrapper.text()).toContain('Innovazione')
    expect(wrapper.text()).not.toContain('Innovation')
  })

  it('renders an accessible dash, never a bare "—", when no name has been authored yet', async () => {
    listCompetencies.mockResolvedValue({
      data: [{ id: 3, code: 'NEW', revision_id: 1, type: 'standard', name: {}, definition: {} }],
    })

    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('catalogue.competencies.table.noName')
  })

  it('shows the empty-state row when the open revision has no competencies', async () => {
    listCompetencies.mockResolvedValue({ data: [] })
    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('catalogue.competencies.table.empty')
  })

  it('surfaces a load failure through the shared D4 banner', async () => {
    listCompetencies.mockRejectedValue(Object.assign(new Error('403'), { status: 403 }))
    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="competencies-load-error"]').text()).toContain('forbidden')
  })

  it('opens the drawer and creates a competency, then reloads and emits refresh-revision', async () => {
    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="competencies-new"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="competency-form"]'),
      'the competency form to mount inside the drawer'
    )

    const codeInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="competency-form-code"]'
    )
    codeInput!.value = 'INN'
    codeInput!.dispatchEvent(new Event('input'))

    const nameInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="competency-form-name-en"]'
    )
    nameInput!.value = 'Innovation'
    nameInput!.dispatchEvent(new Event('input'))

    const definitionInput = document.body.querySelector<HTMLTextAreaElement>(
      '[data-testid="competency-form-definition-en"]'
    )
    definitionInput!.value = 'Brings new ideas.'
    definitionInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => createCompetency.mock.calls.length > 0, 'the create call to fire')
    await flushPromises()

    expect(createCompetency).toHaveBeenCalled()
    expect(listCompetencies).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('refresh-revision')).toBeTruthy()

    wrapper.unmount()
  })

  it('deletes only after ConfirmDialog confirms, never on the first click', async () => {
    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="competency-delete-1"]').trigger('click')
    expect(deleteCompetency).not.toHaveBeenCalled()

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => deleteCompetency.mock.calls.length > 0, 'the delete call to fire')

    expect(deleteCompetency).toHaveBeenCalledWith(1)

    wrapper.unmount()
  })

  it('clears a stale delete-error banner once a later create succeeds', async () => {
    deleteCompetency.mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }))

    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="competency-delete-1"]').trigger('click')
    document.body
      .querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-confirm"]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.body
      .querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-confirm"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(
      () => document.body.querySelector('[data-testid="competencies-action-error"]'),
      'the delete-error banner to render'
    )

    await wrapper.get('[data-testid="competencies-new"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="competency-form"]'),
      'the competency form to mount inside the drawer'
    )
    document.body.querySelector<HTMLInputElement>('[data-testid="competency-form-code"]')!.value =
      'INN'
    document.body
      .querySelector<HTMLInputElement>('[data-testid="competency-form-code"]')
      ?.dispatchEvent(new Event('input'))
    document.body.querySelector<HTMLInputElement>(
      '[data-testid="competency-form-name-en"]'
    )!.value = 'Innovation'
    document.body
      .querySelector<HTMLInputElement>('[data-testid="competency-form-name-en"]')
      ?.dispatchEvent(new Event('input'))
    document.body.querySelector<HTMLTextAreaElement>(
      '[data-testid="competency-form-definition-en"]'
    )!.value = 'Brings new ideas.'
    document.body
      .querySelector<HTMLTextAreaElement>('[data-testid="competency-form-definition-en"]')
      ?.dispatchEvent(new Event('input'))
    await flushPromises()

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => createCompetency.mock.calls.length > 0, 'the create call to fire')
    await flushPromises()

    expect(document.body.querySelector('[data-testid="competencies-action-error"]')).toBeNull()

    wrapper.unmount()
  })

  it('reports a failed delete through the action-error banner', async () => {
    deleteCompetency.mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }))

    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="competency-delete-1"]').trigger('click')
    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(
      () =>
        (document.body.querySelector('[data-testid="competencies-action-error"]')?.textContent ??
          '') !== '',
      'the action-error banner to render'
    )

    expect(
      document.body.querySelector('[data-testid="competencies-action-error"]')?.textContent
    ).toContain('errors.states.notReady.message')

    wrapper.unmount()
  })
})

describe('CatalogueCompetenciesPanel — read-only (published revision)', () => {
  beforeEach(() => {
    listCompetencies.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          code: 'COL',
          revision_id: 1,
          type: 'standard',
          name: { en: 'Collaboration' },
          definition: { en: 'Works well with others.' },
        },
      ],
    })
  })

  it('lists the rows but offers no add, edit or delete control', async () => {
    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: false },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('COL')
    expect(wrapper.find('[data-testid="competencies-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="competency-edit-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="competency-delete-1"]').exists()).toBe(false)
  })

  it('shows every control once the panel is editable', async () => {
    const wrapper = mount(CatalogueCompetenciesPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="competencies-new"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="competency-edit-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="competency-delete-1"]').exists()).toBe(true)
  })
})
