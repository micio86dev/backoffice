/**
 * EvaluationReport.vue (PR B3, task 20.1; provenance footnote — bars-full-
 * scale-1-5 D7, tasks 2.10/2.11)
 *
 * Renders the full BARS competency grid: `<table>` + `<caption>` +
 * per-competency `CompetencyRow`s + `ExcerptList`s. Presentational — the
 * page/container fetches the data and handles 409/403/404 (D4); this
 * organism only ever receives already-loaded evaluation data.
 *
 * SLF fixture per esempio-report-valutazione.json / admin-backoffice spec
 * "SLF fixture renders per esempio-report-valutazione.json" scenario:
 * indicator scores [5, 3, -1] -> mean 4.0, reliability "67%".
 *
 * D7: a provenance footnote between the table and the excerpts block renders
 * the Evaluation's `prompt_version`/`model_version`/`framework_version`
 * LITERALLY — these are machine-facing values (CLAUDE.md) and MUST be
 * byte-identical across every locale, never translated.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EvaluationReport from '../../../../app/components/organisms/EvaluationReport.vue'
import { withTooltipProvider } from '../../support/tooltip-host'
import type {
  EvaluationReportData,
  EvaluationScoringMeta,
} from '../../../../app/composables/useEvaluationReport'

const tMock = (key: string) => key

const SCORING_META: EvaluationScoringMeta = {
  prompt_version: '2.0.0',
  model_version: 'claude-haiku-4-5-20251001',
  framework_version: '1.4.0',
}

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
    unscorable_reason: null,
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
    unscorable_reason: null,
  },
}

function mountReport(
  evaluation: EvaluationReportData,
  locale: string = 'en',
  meta: EvaluationScoringMeta = SCORING_META
) {
  // The glossary tips are reka-ui tooltips; in the app the provider is mounted
  // once by SidebarProvider in layouts/default.vue, so a spec that mounts this
  // organism on its own has to supply it.
  return mount(withTooltipProvider(EvaluationReport, { evaluation, locale, meta }), {
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

  it('names every indicator up front, and reveals its verbatim excerpt on request', async () => {
    const wrapper = mountReport(SLF_FIXTURE)

    // Collapsed, the report reads as a summary: indicator text and its score
    // chip, no wall of transcript.
    expect(wrapper.text()).toContain('Describe products and services accurately')
    expect(wrapper.text()).not.toContain('Durante un pranzo tra colleghi ho dovuto...')

    await wrapper.findAll('[data-slot="accordion-trigger"]')[0]!.trigger('click')

    expect(wrapper.text()).toContain('Durante un pranzo tra colleghi ho dovuto...')
    expect(wrapper.find('.font-mono').exists()).toBe(true)
  })

  it('renders "–" — never "0" — for an all-unassessable competency mean', () => {
    const wrapper = mountReport(ALL_UNASSESSABLE_FIXTURE)
    // Scoped to the <table> itself: the provenance footnote (D7) renders
    // OUTSIDE the table and legitimately contains version strings like
    // "2.0.0", whose dot-separated "0" segments would otherwise collide with
    // this bare-zero guard — a different concern (the competency mean cell).
    const tableText = wrapper.find('table').text()
    expect(tableText).toContain('STG')
    expect(tableText).toContain('–')
    expect(tableText).not.toMatch(/\b0\b/)
  })
})

describe('EvaluationReport — the grid stays pixel-stable', () => {
  /**
   * `tests/e2e/admin-flow.spec.ts` screenshots `getByRole('table')` against
   * FOUR committed baselines (chromium/webkit × darwin/linux). Anything drawn
   * INSIDE the table's box invalidates all four, and only two of them can be
   * regenerated on a developer machine — the linux pair belongs to CI. The
   * glossary and the evidence accordion are therefore siblings of the table,
   * never children of it. These tests are the guard rail that says so.
   */
  it('keeps the glossary tips outside the <table>', () => {
    const wrapper = mountReport(SLF_FIXTURE)

    expect(wrapper.text()).toContain('help.glossary.indicator.term')
    expect(wrapper.find('table').text()).not.toContain('help.glossary.indicator.term')
    expect(wrapper.find('table').findAll('button')).toHaveLength(0)
  })

  it('keeps the evidence accordion outside the <table>', () => {
    const wrapper = mountReport(SLF_FIXTURE)

    expect(wrapper.findAll('[data-slot="accordion-trigger"]').length).toBeGreaterThan(0)
    expect(wrapper.find('table').findAll('[data-slot="accordion-trigger"]')).toHaveLength(0)
  })

  it('leaves the table cells exactly as the baseline captured them', () => {
    const cells = mountReport(SLF_FIXTURE)
      .find('table')
      .findAll('th, td')
      .map((cell) => cell.text().replace(/\s+/g, ' '))

    expect(cells).toEqual([
      'report.table.competency',
      'report.table.mean',
      'report.table.reliability',
      'report.table.indicators',
      'SLF',
      '4.0',
      'report.reliability: 67%',
      '5report.chip.high3report.chip.mid–report.chip.unassessable',
    ])
  })
})

describe('EvaluationReport provenance footnote (D7)', () => {
  it('renders the three scoring provenance values literally', () => {
    const wrapper = mountReport(SLF_FIXTURE)
    expect(wrapper.text()).toContain('2.0.0')
    expect(wrapper.text()).toContain('claude-haiku-4-5-20251001')
    expect(wrapper.text()).toContain('1.4.0')
    expect(wrapper.text()).toContain('report.provenance.label')
  })

  it('renders the same literal provenance values in en and it — machine-facing, never translated', () => {
    const en = mountReport(SLF_FIXTURE, 'en')
    const it = mountReport(SLF_FIXTURE, 'it')

    const extract = (text: string) => text.match(/2\.0\.0.*claude-haiku-4-5-20251001.*1\.4\.0/)?.[0]

    expect(extract(en.text())).toBeTruthy()
    expect(extract(en.text())).toBe(extract(it.text()))
  })
})
