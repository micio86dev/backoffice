/**
 * EvaluationReport.vue (PR B3, task 20.1 — RED)
 *
 * Renders the full BARS competency grid: `<table>` + `<caption>` +
 * per-competency `CompetencyRow`s + `ExcerptList`s. Presentational — the
 * page/container fetches the data and handles 409/403/404 (D4); this
 * organism only ever receives already-loaded evaluation data.
 *
 * SLF fixture per esempio-report-valutazione.json / admin-backoffice spec
 * "SLF fixture renders per esempio-report-valutazione.json" scenario:
 * indicator scores [5, 3, -1] -> mean 4.0, reliability "67%".
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EvaluationReport from '../../../../app/components/organisms/EvaluationReport.vue'
import type { EvaluationReportData } from '../../../../app/composables/useEvaluationReport'

const tMock = (key: string) => key

const SLF_FIXTURE: EvaluationReportData = {
  SLF: {
    score: 4.0,
    reliability: '67%',
    behaviors: [
      {
        indicator: 'Describe products and services accurately',
        score: 5,
        explanation: 'Clear and engaging description.',
        excerpts: ['Durante un pranzo tra colleghi ho dovuto...'],
      },
      {
        indicator: 'Link own arguments to customer needs and priorities',
        score: 3,
        explanation: 'Solid but improvable link to customer needs.',
        excerpts: ['avevamo parlato direttamente con dei potenziali clienti...'],
      },
      {
        indicator: 'Negotiate to reach solutions that meet the primary interests of customers',
        // Reference fixture uses the raw -1 sentinel; the live API maps to
        // null — both must render identically (see app/utils/bars.ts).
        score: -1,
        explanation: 'No relevant example provided; unassessable.',
        excerpts: [],
      },
    ],
  },
}

const ALL_UNASSESSABLE_FIXTURE: EvaluationReportData = {
  STG: {
    score: null,
    reliability: '100%',
    behaviors: [
      { indicator: 'a', score: null, explanation: 'x', excerpts: [] },
      { indicator: 'b', score: null, explanation: 'y', excerpts: [] },
    ],
  },
}

function mountReport(evaluation: EvaluationReportData) {
  return mount(EvaluationReport, {
    props: { evaluation, locale: 'en' },
    global: { mocks: { $t: tMock } },
  })
}

describe('EvaluationReport', () => {
  it('renders a <table> with a <caption>', () => {
    const wrapper = mountReport(SLF_FIXTURE)
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('caption').exists()).toBe(true)
  })

  it('renders the SLF fixture per esempio-report-valutazione.json: mean 4.0, reliability 67%', () => {
    const wrapper = mountReport(SLF_FIXTURE)
    expect(wrapper.text()).toContain('SLF')
    expect(wrapper.text()).toContain('4.0')
    expect(wrapper.text()).toContain('67%')
  })

  it('renders the third (unassessable) indicator as a neutral "–", never the literal -1', () => {
    const wrapper = mountReport(SLF_FIXTURE)
    expect(wrapper.text()).not.toContain('-1')
    expect(wrapper.text()).toContain('report.chip.unassessable')
  })

  it('renders verbatim excerpts for the assessed indicators, monospace', () => {
    const wrapper = mountReport(SLF_FIXTURE)
    expect(wrapper.text()).toContain('Durante un pranzo tra colleghi ho dovuto...')
    expect(wrapper.find('.font-mono').exists()).toBe(true)
  })

  it('renders "–" — never "0" — for an all-unassessable competency mean', () => {
    const wrapper = mountReport(ALL_UNASSESSABLE_FIXTURE)
    expect(wrapper.text()).toContain('STG')
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).not.toMatch(/\b0\b/)
  })
})
