/**
 * CompetencyRow.vue (PR B3, task 19.4 — RED)
 *
 * One BARS competency row: code + mean (CompetencyMean) + reliability
 * (ReliabilityBadge) + indicator chip strip as a `<ul>` with an `aria-label`
 * naming the competency (DESIGN.md §5/§8.3).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompetencyRow from '../../../../app/components/molecules/CompetencyRow.vue'
import ScoreChip from '../../../../app/components/atoms/ScoreChip.vue'
import type { EvaluationCompetencyResult } from '../../../../app/composables/useEvaluationReport'

const tMock = (key: string) => key

function result(overrides: Partial<EvaluationCompetencyResult> = {}): EvaluationCompetencyResult {
  return {
    score: 4,
    reliability: '67%',
    behaviors: [
      { indicator: 'a', score: 5, explanation: 'x', excerpts: ['e1'] },
      { indicator: 'b', score: 3, explanation: 'y', excerpts: ['e2'] },
      { indicator: 'c', score: null, explanation: 'z', excerpts: [] },
    ],
    unscorable_reason: null,
    ...overrides,
  }
}

describe('CompetencyRow', () => {
  it('renders the competency code, mean, reliability, and a chip per indicator', () => {
    const wrapper = mount(CompetencyRow, {
      props: { code: 'SLF', result: result(), locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('SLF')
    expect(wrapper.text()).toContain('4.0')
    expect(wrapper.text()).toContain('67%')
    // One chip per behavior (5, 3, unassessable-'–').
    expect(wrapper.findAllComponents(ScoreChip).length).toBe(3)
  })

  it('names the indicator strip with an aria-label identifying the competency', () => {
    const wrapper = mount(CompetencyRow, {
      props: { code: 'SLF', result: result(), locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    const list = wrapper.get('ul[aria-label]')
    expect(list.attributes('aria-label')).toContain('SLF')
  })

  it('renders "–" (never "0") for an all-unassessable competency mean', () => {
    const wrapper = mount(CompetencyRow, {
      props: {
        code: 'STG',
        result: result({
          score: null,
          behaviors: [
            { indicator: 'a', score: null, explanation: 'x', excerpts: [] },
            { indicator: 'b', score: null, explanation: 'y', excerpts: [] },
          ],
        }),
        locale: 'en',
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).not.toMatch(/\b0\b/)
  })
})

// ─── Unscorable rendering (A5.5/A5.6, design.md D11) ─────────────────────────
//
// Today the Indicators cell for an unscorable competency is an empty <ul> —
// the unexplained visual hole this slice closes. The reason sits on the
// SAME row as the 0%/'–' badges, so an operator cannot read one without the
// other.

describe('CompetencyRow — unscorable_reason rendering', () => {
  it('renders the i18n-keyed explanation in the Indicators cell for an unscorable competency', () => {
    const wrapper = mount(CompetencyRow, {
      props: {
        code: 'PRS',
        result: result({
          score: null,
          reliability: '0%',
          behaviors: [],
          unscorable_reason: 'llm_truncated',
        }),
        locale: 'en',
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.unscorable.llm_truncated')
    // No indicator chips — nothing to isolate, the whole competency is unscorable.
    expect(wrapper.findAllComponents(ScoreChip).length).toBe(0)
  })

  it('renders the neutral fallback for an unrecognized unscorable_reason, never blank', () => {
    const wrapper = mount(CompetencyRow, {
      props: {
        code: 'STG',
        result: result({
          score: null,
          reliability: '0%',
          behaviors: [],
          unscorable_reason: 'some_future_reason',
        }),
        locale: 'en',
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.unscorable.unknown')
  })

  it('keeps the Mean cell "–" and reliability "0%" unchanged alongside the explanation', () => {
    const wrapper = mount(CompetencyRow, {
      props: {
        code: 'PRS',
        result: result({
          score: null,
          reliability: '0%',
          behaviors: [],
          unscorable_reason: 'llm_truncated',
        }),
        locale: 'en',
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).toContain('0%')
    expect(wrapper.text()).toContain('report.unscorable.llm_truncated')
  })

  it('renders no explanation and the ordinary chip strip for a scored competency (unscorable_reason null)', () => {
    const wrapper = mount(CompetencyRow, {
      props: { code: 'SLF', result: result(), locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).not.toContain('report.unscorable.')
    expect(wrapper.findAllComponents(ScoreChip).length).toBe(3)
  })
})
