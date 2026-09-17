/**
 * RoleCompetenciesForm.vue (framework-catalogue-authoring PR10c, 39c.2).
 *
 * Edits a role's ORDERED competency set — attach, detach and reorder — and
 * saves it in one `PUT .../competencies` call (PR8b's endpoint,
 * `UpdateRoleCompetenciesRequest`'s own no-partial-diff contract). Detaching
 * an already-assigned competency is confirmed before the write fires; adding
 * or reordering is not — nothing is destroyed until Save actually runs, and
 * Cancel discards every local edit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key
const updateRoleCompetenciesMock = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({ updateRoleCompetencies: updateRoleCompetenciesMock }),
}))

const RoleCompetenciesForm = (
  await import('../../../../app/components/organisms/RoleCompetenciesForm.vue')
).default

vi.stubGlobal('useI18n', () => realI18n())

const ROLE = {
  id: 1,
  code: 'ICO',
  revision_id: 1,
  name: { en: 'Individual Contributor' },
  responsibilities: {},
  competency_ids: [11, 22],
}

const COMPETENCIES = [
  { id: 11, code: 'COL', revision_id: 1, type: 'standard', name: {}, definition: {} },
  { id: 22, code: 'STG', revision_id: 1, type: 'standard', name: {}, definition: {} },
  { id: 33, code: 'INN', revision_id: 1, type: 'standard', name: {}, definition: {} },
]

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

function confirmDialog(): void {
  const confirmButton = document.body.querySelector<HTMLButtonElement>(
    '[data-testid="confirm-dialog-confirm"]'
  )
  confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('RoleCompetenciesForm', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    updateRoleCompetenciesMock.mockReset().mockResolvedValue({ data: {} })
  })

  it('lists the role’s currently assigned competencies, in order', () => {
    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
    })

    const rows = wrapper.findAll('[data-testid^="role-competency-row-"]')
    expect(rows.map((row) => row.attributes('data-testid'))).toEqual([
      'role-competency-row-11',
      'role-competency-row-22',
    ])
  })

  it('only offers competencies not already assigned in the add control', async () => {
    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    const trigger = document.body.querySelector('[data-testid="role-competencies-add-select"]')
    trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await waitFor(
      () => document.body.querySelectorAll('[role="option"]').length > 0,
      'the add select to render its options'
    )

    const optionText = Array.from(document.body.querySelectorAll('[role="option"]')).map(
      (el) => el.textContent
    )
    expect(optionText).toEqual(['INN'])

    wrapper.unmount()
  })

  it('adds a competency at the end of the assigned list and saves it without confirmation', async () => {
    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await selectOption('role-competencies-add-select', 'INN')
    await wrapper.get('[data-testid="role-competencies-add-button"]').trigger('click')

    expect(
      wrapper
        .findAll('[data-testid^="role-competency-row-"]')
        .map((row) => row.attributes('data-testid'))
    ).toEqual(['role-competency-row-11', 'role-competency-row-22', 'role-competency-row-33'])

    await wrapper.get('[data-testid="role-competencies-form"]').trigger('submit')
    await flushPromises()

    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).toBeNull()
    expect(updateRoleCompetenciesMock).toHaveBeenCalledWith(1, { competency_ids: [11, 22, 33] })

    wrapper.unmount()
  })

  it('moves a competency up or down within the ordered list', async () => {
    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="role-competency-down-11"]').trigger('click')

    expect(
      wrapper
        .findAll('[data-testid^="role-competency-row-"]')
        .map((row) => row.attributes('data-testid'))
    ).toEqual(['role-competency-row-22', 'role-competency-row-11'])

    await wrapper.get('[data-testid="role-competencies-form"]').trigger('submit')
    await flushPromises()

    expect(updateRoleCompetenciesMock).toHaveBeenCalledWith(1, { competency_ids: [22, 11] })
  })

  it('disables the move buttons at the ends of the list', () => {
    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
    })

    expect(
      (wrapper.get('[data-testid="role-competency-up-11"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      (wrapper.get('[data-testid="role-competency-down-22"]').element as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('confirms before a save that would detach an already-assigned competency', async () => {
    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="role-competency-remove-11"]').trigger('click')
    await wrapper.get('[data-testid="role-competencies-form"]').trigger('submit')
    await flushPromises()

    expect(updateRoleCompetenciesMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).not.toBeNull()

    confirmDialog()
    await flushPromises()

    expect(updateRoleCompetenciesMock).toHaveBeenCalledWith(1, { competency_ids: [22] })

    wrapper.unmount()
  })

  it('confirms before a save that would silently drop a competency the "competencies" prop no longer carries', async () => {
    // `props.role.competency_ids` is the server's own record of what is
    // assigned; `props.competencies` is a separately-fetched list that can
    // legitimately disagree with it (e.g. a competency deleted or retyped
    // concurrently). The initial dangling-id filter that keeps `selectedIds`
    // index-safe for `move()` must NOT also shrink the DETACH baseline: a
    // save that never touches anything still sends `competency_ids: [11, 22]`
    // — silently dropping 99 — and that is a real detach the operator was
    // never asked to confirm (gga review finding, R3-role-competencies-
    // silent-detach).
    const wrapper = mount(RoleCompetenciesForm, {
      props: {
        role: { ...ROLE, competency_ids: [11, 22, 99] },
        competencies: COMPETENCIES,
      },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="role-competencies-form"]').trigger('submit')
    await flushPromises()

    expect(updateRoleCompetenciesMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).not.toBeNull()

    confirmDialog()
    await flushPromises()

    expect(updateRoleCompetenciesMock).toHaveBeenCalledWith(1, { competency_ids: [11, 22] })

    wrapper.unmount()
  })

  it('never saves a detach when the confirm dialog is cancelled', async () => {
    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="role-competency-remove-11"]').trigger('click')
    await wrapper.get('[data-testid="role-competencies-form"]').trigger('submit')
    await flushPromises()

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-cancel"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(updateRoleCompetenciesMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('shows the empty state and hides the add control once every competency is assigned', () => {
    const wrapper = mount(RoleCompetenciesForm, {
      props: {
        role: { ...ROLE, competency_ids: [] },
        competencies: [],
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.get('[data-testid="role-competencies-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="role-competencies-add-select"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="role-competencies-none-available"]').exists()).toBe(true)
  })

  it('surfaces the detach refusal naming the still-anchored competency codes, verbatim', async () => {
    updateRoleCompetenciesMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: {
          errors: {
            competency_ids: ['cannot detach — still anchored by indicators in this draft: COL'],
          },
        },
      })
    )

    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="role-competency-remove-11"]').trigger('click')
    await wrapper.get('[data-testid="role-competencies-form"]').trigger('submit')
    await flushPromises()
    confirmDialog()
    await flushPromises()

    expect(wrapper.get('[data-testid="role-competencies-error"]').text()).toContain(
      'cannot detach — still anchored by indicators in this draft: COL'
    )

    wrapper.unmount()
  })

  it('guards against double submission by disabling the fieldset while a save is in flight', async () => {
    // The fieldset's OWN `disabled` attribute is the assertable surface here
    // — jsdom does not implement `<fieldset disabled>`'s inherited-disabling
    // of descendant controls (`tests/unit/components/ui/form-fieldset.spec.ts`'s
    // own documented gap); the real behaviour is covered by a real engine in
    // E2E, same doctrine as every other form in this app.
    let resolveSave: (() => void) | undefined
    updateRoleCompetenciesMock.mockReset().mockReturnValue(
      new Promise<{ data: unknown }>((resolve) => {
        resolveSave = () => resolve({ data: {} })
      })
    )

    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="role-competencies-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()

    resolveSave?.()
    await flushPromises()

    expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined()
  })

  it('renders a 409 as waiting, never the same red as a genuine save failure', async () => {
    updateRoleCompetenciesMock.mockRejectedValueOnce(
      Object.assign(new Error('409'), { status: 409 })
    )

    const wrapper = mount(RoleCompetenciesForm, {
      props: { role: ROLE, competencies: COMPETENCIES },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="role-competencies-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="role-competencies-banner"]').text()).toContain(
      'errors.states.notReady.message'
    )
  })
})
