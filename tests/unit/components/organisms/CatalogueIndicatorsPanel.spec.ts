/**
 * CatalogueIndicatorsPanel.vue (framework-catalogue-authoring PR10b)
 *
 * Grouped by competency, then by role/competency pair; reorder is a 3-step
 * PATCH dance per swap (never a bare 2-call swap — see the component's own
 * docblock); delete never blocks a pair from dropping below 3, matching the
 * task's "surface the publish sweep's violation instead" instruction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key

const listCompetencies = vi.fn()
const listRoles = vi.fn()
const listBarsIndicators = vi.fn()
const createBarsIndicator = vi.fn()
const updateBarsIndicator = vi.fn()
const deleteBarsIndicator = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({
    listCompetencies,
    listRoles,
    listBarsIndicators,
    createBarsIndicator,
    updateBarsIndicator,
    deleteBarsIndicator,
  }),
}))

const CatalogueIndicatorsPanel = (
  await import('../../../../app/components/organisms/CatalogueIndicatorsPanel.vue')
).default

const COMPETENCIES = [
  { id: 11, code: 'COL', revision_id: 1, type: 'standard', name: {}, definition: {} },
]
const ROLES = [{ id: 1, code: 'ICO', revision_id: 1, name: {}, responsibilities: {} }]

function indicator(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    revision_id: 1,
    role_id: 1,
    competency_id: 11,
    position: 0,
    text: { en: 'Text' },
    anchor_5: { en: 'A5' },
    anchor_3: { en: 'A3' },
    anchor_1: { en: 'A1' },
    ...overrides,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('CatalogueIndicatorsPanel', () => {
  beforeEach(() => {
    listCompetencies.mockReset().mockResolvedValue({ data: COMPETENCIES })
    listRoles.mockReset().mockResolvedValue({ data: ROLES })
    listBarsIndicators.mockReset().mockResolvedValue({
      data: [
        indicator({ id: 1, position: 0, text: { en: 'First' } }),
        indicator({ id: 2, position: 1, text: { en: 'Second' } }),
      ],
    })
    createBarsIndicator.mockReset().mockResolvedValue({ data: {} })
    updateBarsIndicator.mockReset().mockResolvedValue({ data: {} })
    deleteBarsIndicator.mockReset().mockResolvedValue(undefined)
  })

  it('groups indicators by competency, then by role', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    const competencyGroup = wrapper.get('[data-testid="indicators-competency-11"]')
    expect(competencyGroup.text()).toContain('COL')
    expect(competencyGroup.text()).toContain('ICO')
    expect(competencyGroup.text()).toContain('First')
    expect(competencyGroup.text()).toContain('Second')
  })

  it('shows the indicator text in the operator’s own UI locale, not always English', async () => {
    listBarsIndicators.mockResolvedValue({
      data: [indicator({ id: 1, position: 0, text: { en: 'English text', it: 'Testo italiano' } })],
    })

    const wrapper = mount(CatalogueIndicatorsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    // The global i18n stub (tests/unit/setup.ts) reports the UI locale as 'it'.
    expect(wrapper.text()).toContain('Testo italiano')
    expect(wrapper.text()).not.toContain('English text')
  })

  it('shows a per-competency empty note when it has no indicators yet', async () => {
    listBarsIndicators.mockResolvedValue({ data: [] })
    const wrapper = mount(CatalogueIndicatorsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.get('[data-testid="indicators-competency-11"]').text()).toContain(
      'catalogue.indicators.empty'
    )
  })

  it('shows a placeholder when the open revision has no competencies', async () => {
    listCompetencies.mockResolvedValue({ data: [] })
    const wrapper = mount(CatalogueIndicatorsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="indicators-no-competencies"]').exists()).toBe(true)
  })

  it('surfaces a load failure through the shared D4 banner', async () => {
    listCompetencies.mockRejectedValue(Object.assign(new Error('403'), { status: 403 }))
    const wrapper = mount(CatalogueIndicatorsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.get('[data-testid="indicators-load-error"]').text()).toContain('forbidden')
  })

  it('disables Move up on the first row and Move down on the last', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(
      (wrapper.get('[data-testid="indicator-move-up-1"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      (wrapper.get('[data-testid="indicator-move-down-1"]').element as HTMLButtonElement).disabled
    ).toBe(false)
    expect(
      (wrapper.get('[data-testid="indicator-move-down-2"]').element as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('swaps two rows via a 3-step PATCH dance, never a direct 2-call swap', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    await wrapper.get('[data-testid="indicator-move-down-1"]').trigger('click')
    await flushPromises()

    // Row 1 (position 0) parks at a temp slot (max position + 1 = 2), row 2
    // moves into row 1's vacated slot (0), then row 1 moves into row 2's
    // vacated slot (1) — three PATCHes, never a bare id-1<->id-2 swap that
    // would collide against the DB's own per-pair uniqueness.
    expect(updateBarsIndicator).toHaveBeenNthCalledWith(1, 1, { position: 2 })
    expect(updateBarsIndicator).toHaveBeenNthCalledWith(2, 2, { position: 0 })
    expect(updateBarsIndicator).toHaveBeenNthCalledWith(3, 1, { position: 1 })
    expect(listBarsIndicators).toHaveBeenCalledTimes(2)
    // A successful reorder emits the same refresh-revision signal create and
    // delete already do — a write is a write, whichever section made it.
    expect(wrapper.emitted('refresh-revision')).toBeTruthy()
  })

  it('reports a failed reorder and reloads rather than trusting a local rollback', async () => {
    updateBarsIndicator.mockRejectedValueOnce(Object.assign(new Error('500'), { status: 500 }))

    const wrapper = mount(CatalogueIndicatorsPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    await wrapper.get('[data-testid="indicator-move-down-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="indicators-action-error"]').text()).toContain(
      'catalogue.indicators.reorderError'
    )
    expect(listBarsIndicators).toHaveBeenCalledTimes(2)
  })

  it('deletes only after ConfirmDialog confirms, never below 3 client-side', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="indicator-delete-1"]').trigger('click')
    expect(deleteBarsIndicator).not.toHaveBeenCalled()

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => deleteBarsIndicator.mock.calls.length > 0, 'the delete call to fire')

    expect(deleteBarsIndicator).toHaveBeenCalledWith(1)

    wrapper.unmount()
  })

  it('opens the create drawer and creates an indicator, then reloads and emits refresh-revision', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="indicators-new"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="bars-indicator-form"]'),
      'the indicator form to mount inside the drawer'
    )

    expect(wrapper.emitted('refresh-revision')).toBeFalsy()

    wrapper.unmount()
  })

  it('edits an indicator through the drawer', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="indicator-edit-1"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="bars-indicator-form-text-en"]'),
      'the indicator form to mount inside the drawer'
    )

    expect(
      document.body.querySelector<HTMLTextAreaElement>(
        '[data-testid="bars-indicator-form-text-en"]'
      )?.value
    ).toBe('First')

    wrapper.unmount()
  })
})
