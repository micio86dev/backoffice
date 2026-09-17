/**
 * BarsIndicatorForm.vue (framework-catalogue-authoring PR10b)
 *
 * `competency_id`/`role_id` are set-once at create, never editable
 * (`UpdateBarsIndicatorRequest` carries no such field); `position` is
 * always computed from `indicators`, never a form field.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key
const createBarsIndicatorMock = vi.fn()
const updateBarsIndicatorMock = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({
    createBarsIndicator: createBarsIndicatorMock,
    updateBarsIndicator: updateBarsIndicatorMock,
  }),
}))

const BarsIndicatorForm = (
  await import('../../../../app/components/organisms/BarsIndicatorForm.vue')
).default

vi.stubGlobal('useI18n', () => realI18n())

const COMPETENCIES = [
  { id: 11, code: 'COL', revision_id: 1, type: 'standard', name: {}, definition: {} },
  { id: 22, code: 'MTG', revision_id: 1, type: 'potential', name: {}, definition: {} },
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

/** Drives a REAL reka-ui Select: opens on pointerdown, selects on pointerup. */
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

describe('BarsIndicatorForm', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    createBarsIndicatorMock.mockReset().mockResolvedValue({ data: {} })
    updateBarsIndicatorMock.mockReset().mockResolvedValue({ data: {} })
  })

  it('refuses submit with no competency, no role, or a blank English text/anchor', async () => {
    const wrapper = mount(BarsIndicatorForm, {
      props: { indicator: null, competencies: COMPETENCIES, roles: ROLES, indicators: [] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="bars-indicator-form"]').trigger('submit')

    expect(wrapper.get('[data-testid="bars-indicator-form-competency-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="bars-indicator-form-text-en-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="bars-indicator-form-anchor5-en-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="bars-indicator-form-anchor3-en-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="bars-indicator-form-anchor1-en-error"]').exists()).toBe(true)
    expect(createBarsIndicatorMock).not.toHaveBeenCalled()
  })

  it('requires a role for a standard competency', async () => {
    const wrapper = mount(BarsIndicatorForm, {
      props: { indicator: null, competencies: COMPETENCIES, roles: ROLES, indicators: [] },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await selectOption('bars-indicator-form-competency', 'COL')
    await wrapper.get('[data-testid="bars-indicator-form"]').trigger('submit')

    expect(wrapper.get('[data-testid="bars-indicator-form-role-error"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('computes position as max(position)+1 within the exact competency/role pair', async () => {
    const wrapper = mount(BarsIndicatorForm, {
      props: {
        indicator: null,
        competencies: COMPETENCIES,
        roles: ROLES,
        indicators: [
          indicator({ id: 1, competency_id: 11, role_id: 1, position: 0 }),
          indicator({ id: 2, competency_id: 11, role_id: 1, position: 1 }),
          // A different pair — never contributes to this pair's position.
          indicator({ id: 3, competency_id: 11, role_id: null, position: 9 }),
        ],
      },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await selectOption('bars-indicator-form-competency', 'COL')
    await selectOption('bars-indicator-form-role', 'ICO')
    await wrapper.get('[data-testid="bars-indicator-form-text-en"]').setValue('Text')
    await wrapper.get('[data-testid="bars-indicator-form-anchor5-en"]').setValue('A5')
    await wrapper.get('[data-testid="bars-indicator-form-anchor3-en"]').setValue('A3')
    await wrapper.get('[data-testid="bars-indicator-form-anchor1-en"]').setValue('A1')
    await wrapper.get('[data-testid="bars-indicator-form"]').trigger('submit')
    await flushPromises()

    expect(createBarsIndicatorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competency_id: 11, role_id: 1, position: 2 })
    )

    wrapper.unmount()
  })

  it('forces role_id to null for a potential competency, never a form choice', async () => {
    const wrapper = mount(BarsIndicatorForm, {
      props: { indicator: null, competencies: COMPETENCIES, roles: ROLES, indicators: [] },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await selectOption('bars-indicator-form-competency', 'MTG')

    expect(
      (wrapper.get('[data-testid="bars-indicator-form-role"]').element as HTMLButtonElement)
        .disabled
    ).toBe(true)

    await wrapper.get('[data-testid="bars-indicator-form-text-en"]').setValue('Text')
    await wrapper.get('[data-testid="bars-indicator-form-anchor5-en"]').setValue('A5')
    await wrapper.get('[data-testid="bars-indicator-form-anchor3-en"]').setValue('A3')
    await wrapper.get('[data-testid="bars-indicator-form-anchor1-en"]').setValue('A1')
    await wrapper.get('[data-testid="bars-indicator-form"]').trigger('submit')
    await flushPromises()

    expect(createBarsIndicatorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competency_id: 22, role_id: null })
    )

    wrapper.unmount()
  })

  it('edits an indicator sending only text/anchors, never competency_id/role_id/position', async () => {
    const wrapper = mount(BarsIndicatorForm, {
      props: {
        indicator: indicator({ text: { en: 'Old' } }),
        competencies: COMPETENCIES,
        roles: ROLES,
        indicators: [indicator({ text: { en: 'Old' } })],
      },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="bars-indicator-form-text-en"]').setValue('New text.')
    await wrapper.get('[data-testid="bars-indicator-form"]').trigger('submit')

    expect(updateBarsIndicatorMock).toHaveBeenCalledWith(1, {
      text: { en: 'New text.', it: undefined },
      anchor_5: { en: 'A5', it: undefined },
      anchor_3: { en: 'A3', it: undefined },
      anchor_1: { en: 'A1', it: undefined },
    })
  })

  it('shows the competency and role as static text on edit, not editable controls', async () => {
    const wrapper = mount(BarsIndicatorForm, {
      props: {
        indicator: indicator(),
        competencies: COMPETENCIES,
        roles: ROLES,
        indicators: [indicator()],
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('[data-testid="bars-indicator-form-competency"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="bars-indicator-form-competency-static"]').text()).toBe('COL')
    expect(wrapper.get('[data-testid="bars-indicator-form-role-static"]').text()).toBe('ICO')
  })

  it('maps a server refusal of an Italian anchor onto its own field, visibly', async () => {
    // gga review finding: `anchor5It`/`anchor3It`/`anchor1It` were mapped in
    // `SERVER_FIELD_TO_ERROR_KEY` but rendered no `FieldError`, so the field
    // turned red (`data-invalid`) with no visible or accessible message —
    // and because the key WAS mapped, `applyServerFieldErrors` did not
    // return it as unmapped either, so the banner never showed it. The
    // server's message was lost completely.
    createBarsIndicatorMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { 'anchor_5.it': ['anchor_5.it_blank'] } },
      })
    )

    const wrapper = mount(BarsIndicatorForm, {
      props: { indicator: null, competencies: COMPETENCIES, roles: ROLES, indicators: [] },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await selectOption('bars-indicator-form-competency', 'COL')
    await selectOption('bars-indicator-form-role', 'ICO')
    await wrapper.get('[data-testid="bars-indicator-form-text-en"]').setValue('Text')
    await wrapper.get('[data-testid="bars-indicator-form-anchor5-en"]').setValue('A5')
    await wrapper.get('[data-testid="bars-indicator-form-anchor3-en"]').setValue('A3')
    await wrapper.get('[data-testid="bars-indicator-form-anchor1-en"]').setValue('A1')
    await wrapper.get('[data-testid="bars-indicator-form"]').trigger('submit')
    await flushPromises()

    // No `catalogue.serverError.anchor_5.it_blank` copy exists (one entry
    // per field/locale is impractical to enumerate) — `translateServerCode`
    // falls back to the RAW code, which is still a visible, actionable
    // message. The point of this test is that it renders at ALL, on the
    // right field, rather than being silently swallowed.
    const error = wrapper.get('[data-testid="bars-indicator-form-anchor5-it-error"]')
    expect(error.text()).toBe('anchor_5.it_blank')

    wrapper.unmount()
  })

  it('maps a server bars_indicator_pair_full refusal onto the competency field', async () => {
    createBarsIndicatorMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { competency_id: ['bars_indicator_pair_full'] } },
      })
    )

    const wrapper = mount(BarsIndicatorForm, {
      props: { indicator: null, competencies: COMPETENCIES, roles: ROLES, indicators: [] },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    await selectOption('bars-indicator-form-competency', 'COL')
    await selectOption('bars-indicator-form-role', 'ICO')
    await wrapper.get('[data-testid="bars-indicator-form-text-en"]').setValue('Text')
    await wrapper.get('[data-testid="bars-indicator-form-anchor5-en"]').setValue('A5')
    await wrapper.get('[data-testid="bars-indicator-form-anchor3-en"]').setValue('A3')
    await wrapper.get('[data-testid="bars-indicator-form-anchor1-en"]').setValue('A1')
    await wrapper.get('[data-testid="bars-indicator-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="bars-indicator-form-competency-error"]').text()).toContain(
      'catalogue.serverError.bars_indicator_pair_full'
    )

    wrapper.unmount()
  })
})
