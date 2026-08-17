/**
 * CompetencyPicker.vue (Unit 2b, task 20.3 — RED)
 *
 * `FieldSet` + `FieldLegend` + `Checkbox` grid (D10 — never a combobox for
 * 14–18 options). Filtering by assessment type / role is the CALLER's
 * responsibility (`ProjectForm.vue` composes the right `options` list); this
 * molecule renders whatever options it is given and tracks selection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CompetencyPicker from '../../../../app/components/molecules/CompetencyPicker.vue'

// Echoes interpolation params (mirrors avatar-templates-page.spec.ts's
// convention) — a plain `(key) => key` stub silently discards the second
// argument, which would let a hardcoded `missingCount`/`total` pass
// unnoticed: only the boolean `missingCount > 0` boundary would be checked,
// never the actual numbers "10 of 18" / "0 of 15" the coverageSummary key
// is supposed to carry.
const tMock = vi.fn((key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key
)

// No global clearMocks configured in vitest.config.ts — cleared explicitly
// so tests asserting on tMock's call history (not just rendered text) never
// see a PRIOR test's calls.
beforeEach(() => {
  tMock.mockClear()
})

const OPTIONS = [
  { id: 1, code: 'COL', name: 'Collaboration', barsAvailable: true },
  { id: 2, code: 'COM', name: 'Communication', barsAvailable: true },
]

describe('CompetencyPicker', () => {
  it('renders a checkbox per option inside a FieldSet/FieldLegend grid', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: OPTIONS, modelValue: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('fieldset').exists()).toBe(true)
    expect(wrapper.find('legend').exists()).toBe(true)
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Collaboration')
    expect(wrapper.text()).toContain('Communication')
  })

  it('renders the empty state when there are no options for the current selection', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: [], modelValue: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('projects.competencyPicker.empty')
  })

  it('reflects modelValue as pre-checked boxes', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: OPTIONS, modelValue: [2] },
      global: { mocks: { $t: tMock } },
    })

    const checkboxes = wrapper.findAll('[role="checkbox"]')
    expect(checkboxes[0]!.attributes('aria-checked')).toBe('false')
    expect(checkboxes[1]!.attributes('aria-checked')).toBe('true')
  })

  it('emits update:modelValue with the toggled id added', async () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: OPTIONS, modelValue: [] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.findAll('[role="checkbox"]')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[1]])
  })

  it('emits update:modelValue with the toggled id removed', async () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: OPTIONS, modelValue: [1, 2] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.findAll('[role="checkbox"]')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2]])
  })
})

// bars-coverage-visibility D2/D6 — disable-for-selection, never for
// deselection. `barsAvailable` is required (never optional) on
// CompetencyOption so a construction site cannot silently forget to answer
// the coverage question.
describe('CompetencyPicker — coverage-aware selection (D2)', () => {
  const COVERAGE_OPTIONS = [
    { id: 1, code: 'PRS', name: 'Presence', barsAvailable: false },
    { id: 2, code: 'STG', name: 'Strategy', barsAvailable: true },
  ]

  it('disables the checkbox for an uncovered option NOT already attached', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: COVERAGE_OPTIONS, modelValue: [], persistedIds: [] },
      global: { mocks: { $t: tMock } },
    })

    const checkboxes = wrapper.findAll('[role="checkbox"]')
    expect(checkboxes[0]!.attributes('disabled')).toBeDefined()
    expect(checkboxes[1]!.attributes('disabled')).toBeUndefined()
  })

  // Previously only the `disabled` ATTRIBUTE was asserted — this proves the
  // BEHAVIOUR the attribute is supposed to guarantee: a click on the
  // disabled checkbox must not emit a selection at all, not merely render
  // visually disabled while still being toggleable some other way.
  it('a click on the disabled checkbox emits nothing — no update:modelValue at all', async () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: COVERAGE_OPTIONS, modelValue: [], persistedIds: [] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.findAll('[role="checkbox"]')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('keeps an ALREADY-ATTACHED uncovered option enabled and removable', async () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: COVERAGE_OPTIONS, modelValue: [1, 2], persistedIds: [1] },
      global: { mocks: { $t: tMock } },
    })

    const checkboxes = wrapper.findAll('[role="checkbox"]')
    expect(checkboxes[0]!.attributes('disabled')).toBeUndefined()

    await checkboxes[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2]])
  })

  it("points a disabled option's checkbox at the noBars reason via aria-describedby", () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: COVERAGE_OPTIONS, modelValue: [], persistedIds: [] },
      global: { mocks: { $t: tMock } },
    })

    const checkbox = wrapper.findAll('[role="checkbox"]')[0]!
    const describedBy = checkbox.attributes('aria-describedby') ?? ''
    const describedIds = describedBy.split(/\s+/).filter(Boolean)

    const matched = describedIds.some((id) => {
      const el = wrapper.find(`#${id}`)
      return el.exists() && el.text() === 'projects.competencyPicker.noBars'
    })
    expect(matched).toBe(true)
  })

  it("points an attached-but-uncovered option's checkbox at the attachedNoBars reason", () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: COVERAGE_OPTIONS, modelValue: [1, 2], persistedIds: [1] },
      global: { mocks: { $t: tMock } },
    })

    const checkbox = wrapper.findAll('[role="checkbox"]')[0]!
    const describedBy = checkbox.attributes('aria-describedby') ?? ''
    const describedIds = describedBy.split(/\s+/).filter(Boolean)

    const matched = describedIds.some((id) => {
      const el = wrapper.find(`#${id}`)
      return el.exists() && el.text() === 'projects.competencyPicker.attachedNoBars'
    })
    expect(matched).toBe(true)
  })

  it('renders no per-option reason for a covered option', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: COVERAGE_OPTIONS, modelValue: [], persistedIds: [] },
      global: { mocks: { $t: tMock } },
    })

    // The covered checkbox (index 1, STG) must not be pointed at either
    // reason key — even though the OTHER (uncovered) option in this same
    // fixture legitimately renders `noBars`.
    const checkbox = wrapper.findAll('[role="checkbox"]')[1]!
    expect(checkbox.attributes('aria-describedby')).toBeUndefined()
  })

  it('shows the group-level coverage summary when at least one competency is missing anchors', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: COVERAGE_OPTIONS, modelValue: [], persistedIds: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('projects.competencyPicker.coverageSummary')
  })

  // Verifies the ACTUAL interpolated numbers, not just that the key rendered
  // — a plain `(key) => key` stub cannot tell "10 of 18" apart from a
  // hardcoded `missingCount` of any other value, since it discards the
  // params entirely. Mirrors design.md D6's own FLL example (18 assigned,
  // 8 anchored, 10 missing) and ICO's (15 assigned, 15 anchored, 0 missing).
  it('states the exact missing/total counts — FLL example: 10 of 18', () => {
    const fllOptions = [
      { id: 1, code: 'STG', name: 'Strategy', barsAvailable: true },
      { id: 2, code: 'INN', name: 'Innovation', barsAvailable: true },
      { id: 3, code: 'CSF', name: 'Customer Focus', barsAvailable: true },
      { id: 4, code: 'OPX', name: 'Operational Excellence', barsAvailable: true },
      { id: 5, code: 'INS', name: 'Inspiring Others', barsAvailable: true },
      { id: 6, code: 'INF', name: 'Influence', barsAvailable: true },
      { id: 7, code: 'RES', name: 'Resilience', barsAvailable: true },
      { id: 8, code: 'LRN', name: 'Learning', barsAvailable: true },
      { id: 9, code: 'PRS', name: 'Presence', barsAvailable: false },
      { id: 10, code: 'JDG', name: 'Judgement', barsAvailable: false },
      { id: 11, code: 'DRV', name: 'Drive', barsAvailable: false },
      { id: 12, code: 'SLF', name: 'Sales Focus', barsAvailable: false },
      { id: 13, code: 'TMG', name: 'Team Management', barsAvailable: false },
      { id: 14, code: 'COM', name: 'Communication', barsAvailable: false },
      { id: 15, code: 'COL', name: 'Collaboration', barsAvailable: false },
      { id: 16, code: 'NET', name: 'Networking', barsAvailable: false },
      { id: 17, code: 'ITG', name: 'Integrity', barsAvailable: false },
      { id: 18, code: 'INC', name: 'Inclusion', barsAvailable: false },
    ]
    const wrapper = mount(CompetencyPicker, {
      props: { options: fllOptions, modelValue: [], persistedIds: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain(
      'projects.competencyPicker.coverageSummary {"missing":10,"total":18}'
    )
  })

  it('hides the group-level coverage summary when every competency is covered (ICO example: 0 of 15)', () => {
    const icoOptions = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      code: `C${i}`,
      name: `Competency ${i}`,
      barsAvailable: true,
    }))
    const wrapper = mount(CompetencyPicker, {
      props: { options: icoOptions, modelValue: [], persistedIds: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).not.toContain('projects.competencyPicker.coverageSummary')
    // Would have hardcoded missingCount to 0 without genuinely computing it
    // from `options` — proven by NOT calling $t with a non-zero missing
    // count anywhere in this render.
    const coverageSummaryCalls = tMock.mock.calls.filter(
      ([key]) => key === 'projects.competencyPicker.coverageSummary'
    )
    expect(coverageSummaryCalls).toEqual([])
  })

  it('hides the group-level coverage summary when every competency is covered (small fixture)', () => {
    const wrapper = mount(CompetencyPicker, {
      props: {
        options: [{ id: 2, code: 'STG', name: 'Strategy', barsAvailable: true }],
        modelValue: [],
        persistedIds: [],
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).not.toContain('projects.competencyPicker.coverageSummary')
  })

  it('treats barsAvailable=null options (potential-assessment competencies) as always selectable', async () => {
    const wrapper = mount(CompetencyPicker, {
      props: {
        options: [{ id: 3, code: 'MTG', name: 'MTG', barsAvailable: null }],
        modelValue: [],
        persistedIds: [],
      },
      global: { mocks: { $t: tMock } },
    })

    const checkbox = wrapper.findAll('[role="checkbox"]')[0]!
    expect(checkbox.attributes('disabled')).toBeUndefined()

    await checkbox.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[3]])
  })
})
