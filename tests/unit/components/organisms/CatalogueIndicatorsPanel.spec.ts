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

/** Drives a REAL reka-ui Select, same helper as `BarsIndicatorForm.spec.ts`. */
async function selectOption(triggerTestId: string, optionText: string): Promise<void> {
  const trigger = document.body.querySelector(`[data-testid="${triggerTestId}"]`)
  if (!trigger) throw new Error(`Select trigger ${triggerTestId} not found`)

  trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await waitFor(
    () => (document.body.textContent ?? '').includes(optionText),
    `the ${triggerTestId} popup to render its options`
  )

  const option = Array.from(document.body.querySelectorAll('[role="option"]')).find((el) =>
    (el.textContent ?? '').includes(optionText)
  )
  if (!option) throw new Error(`Option "${optionText}" not found in ${triggerTestId}`)

  option.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  await flushPromises()
}

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
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
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

    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    // The global i18n stub (tests/unit/setup.ts) reports the UI locale as 'it'.
    expect(wrapper.text()).toContain('Testo italiano')
    expect(wrapper.text()).not.toContain('English text')
  })

  it('shows a per-competency empty note when it has no indicators yet', async () => {
    listBarsIndicators.mockResolvedValue({ data: [] })
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="indicators-competency-11"]').text()).toContain(
      'catalogue.indicators.empty'
    )
  })

  it('shows a placeholder when the open revision has no competencies', async () => {
    listCompetencies.mockResolvedValue({ data: [] })
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="indicators-no-competencies"]').exists()).toBe(true)
  })

  it('surfaces a load failure through the shared D4 banner', async () => {
    listCompetencies.mockRejectedValue(Object.assign(new Error('403'), { status: 403 }))
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="indicators-load-error"]').text()).toContain('forbidden')
  })

  it('disables Move up on the first row and Move down on the last', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
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
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
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

  it('disables the move buttons while a move is in flight', async () => {
    // R3-indicator-move-no-inflight-guard: the multi-request position swap
    // (3 sequential PATCHes) left both move buttons enabled throughout, so a
    // second click mid-swap could fire an overlapping move computed from the
    // same pre-move positions.
    let releaseFirstPatch: (value: { data: unknown }) => void = () => {}
    updateBarsIndicator.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstPatch = resolve
        })
    )

    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const moveDown = wrapper.get('[data-testid="indicator-move-down-1"]')
    await moveDown.trigger('click')

    // Asserts directly on the button element that carries the `disabled`
    // attribute/property itself — this component has no `<fieldset>`, so
    // there is no ancestor-to-descendant propagation involved at all.
    expect((moveDown.element as HTMLButtonElement).disabled).toBe(true)

    releaseFirstPatch({ data: {} })
    await flushPromises()

    expect((moveDown.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('guards the move handler itself against a double-click, independent of the disabled attribute', async () => {
    // The `:disabled="... || moving"` binding (proven above) already stops
    // an ordinary click from reaching `onMove` a second time. This test
    // proves the handler's OWN `if (moving.value) return` guard, by
    // dispatching two raw click events back-to-back with no `await` between
    // them — Vue's DOM patch for the `disabled` attribute is scheduled on
    // the microtask queue, so neither dispatch has seen it flip yet, and
    // both genuinely reach the `@click` listener. Deleting the handler
    // guard while keeping the template's `:disabled` binding makes this
    // fail with 6 calls instead of 3, which `trigger()`-based double-clicks
    // (blocked by the DOM before ever reaching the handler) cannot catch.
    let releaseFirstPatch: (value: { data: unknown }) => void = () => {}
    updateBarsIndicator.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstPatch = resolve
        })
    )

    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const moveDown = wrapper.get('[data-testid="indicator-move-down-1"]').element
    moveDown.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
    moveDown.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))

    releaseFirstPatch({ data: {} })
    await flushPromises()

    // One move is exactly 3 PATCH calls; an overlapping second move would
    // double that to 6.
    expect(updateBarsIndicator).toHaveBeenCalledTimes(3)
  })

  it('reports a failed reorder and reloads rather than trusting a local rollback', async () => {
    updateBarsIndicator.mockRejectedValueOnce(Object.assign(new Error('500'), { status: 500 }))

    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
    })
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
      props: { editable: true },
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

  it('opens the create drawer without creating anything yet', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="indicators-new"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="bars-indicator-form"]'),
      'the indicator form to mount inside the drawer'
    )

    expect(createBarsIndicator).not.toHaveBeenCalled()
    expect(wrapper.emitted('refresh-revision')).toBeFalsy()

    wrapper.unmount()
  })

  it('creates an indicator through the drawer, then reloads and emits refresh-revision', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="indicators-new"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="bars-indicator-form"]'),
      'the indicator form to mount inside the drawer'
    )

    await selectOption('bars-indicator-form-competency', 'COL')
    await selectOption('bars-indicator-form-role', 'ICO')

    function fill(testId: string, value: string): void {
      const field = document.body.querySelector<HTMLTextAreaElement>(`[data-testid="${testId}"]`)
      if (!field) throw new Error(`Field ${testId} not found`)
      field.value = value
      field.dispatchEvent(new Event('input'))
    }

    fill('bars-indicator-form-text-en', 'Third indicator')
    fill('bars-indicator-form-anchor5-en', 'A5')
    fill('bars-indicator-form-anchor3-en', 'A3')
    fill('bars-indicator-form-anchor1-en', 'A1')
    await flushPromises()

    listBarsIndicators.mockClear()
    document.body
      .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => createBarsIndicator.mock.calls.length > 0, 'the create call to fire')
    await flushPromises()

    // Both existing indicators sit in the (competency 11, role 1) pair at
    // positions 0 and 1 — `max(position) + 1` places the new one at 2.
    expect(createBarsIndicator).toHaveBeenCalledWith(
      expect.objectContaining({
        competency_id: 11,
        role_id: 1,
        position: 2,
        text: { en: 'Third indicator', it: undefined },
        anchor_5: { en: 'A5', it: undefined },
        anchor_3: { en: 'A3', it: undefined },
        anchor_1: { en: 'A1', it: undefined },
      })
    )
    // The drawer's own `@saved` handler (`onFormSaved`) reloads the panel and
    // emits the same `refresh-revision` signal delete/reorder already do —
    // this is the assertion the pre-fix test never made, so a broken create
    // path (a rejected payload, a missing `position`, a create that never
    // reloads) would still have shown green here.
    expect(listBarsIndicators).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('refresh-revision')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="bars-indicator-form"]')).toBeNull()

    wrapper.unmount()
  })

  it('edits an indicator through the drawer', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: true },
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

describe('CatalogueIndicatorsPanel — read-only (published revision)', () => {
  beforeEach(() => {
    listCompetencies.mockReset().mockResolvedValue({ data: COMPETENCIES })
    listRoles.mockReset().mockResolvedValue({ data: ROLES })
    listBarsIndicators.mockReset().mockResolvedValue({
      data: [
        indicator({ id: 1, position: 0, text: { en: 'First' } }),
        indicator({ id: 2, position: 1, text: { en: 'Second' } }),
      ],
    })
  })

  it('lists the indicators but offers no add, move, edit or delete control', async () => {
    const wrapper = mount(CatalogueIndicatorsPanel, {
      props: { editable: false },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('First')
    expect(wrapper.text()).toContain('Second')
    expect(wrapper.find('[data-testid="indicators-new"]').exists()).toBe(false)
    for (const id of [1, 2]) {
      expect(wrapper.find(`[data-testid="indicator-move-up-${id}"]`).exists()).toBe(false)
      expect(wrapper.find(`[data-testid="indicator-move-down-${id}"]`).exists()).toBe(false)
      expect(wrapper.find(`[data-testid="indicator-edit-${id}"]`).exists()).toBe(false)
      expect(wrapper.find(`[data-testid="indicator-delete-${id}"]`).exists()).toBe(false)
    }
  })
})
