/**
 * EvidenceAccordion.vue — RED
 *
 * Replaces the old flat "Estratti" block. That block re-listed every
 * competency a second time and printed indicator text and excerpts with no
 * scores, while the grid above printed scores with no indicator text — the
 * operator had to join the two by counting positions.
 *
 * Here each competency group holds one expandable item per indicator, in the
 * SAME order as that competency's chip strip in the grid, so chip N and item N
 * are the same indicator. Everything in this organism renders OUTSIDE the
 * <table> element (see EvaluationReport.spec.ts).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EvidenceAccordion from '../../../../app/components/organisms/EvidenceAccordion.vue'
import { withTooltipProvider } from '../../support/tooltip-host'
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
        unassessable_reason: null,
      },
      {
        indicator: 'Link own arguments to customer needs',
        score: 3,
        explanation: 'Solid but improvable.',
        excerpts: ['avevamo parlato direttamente con dei potenziali clienti...'],
        unassessable_reason: null,
      },
      {
        indicator: 'Negotiate to reach solutions',
        score: -1,
        explanation: '',
        excerpts: [],
        unassessable_reason: 'model_declared',
      },
    ],
    unscorable_reason: null,
  },
}

const NO_INDICATORS_FIXTURE: EvaluationReportData = {
  STG: { score: null, reliability: '0%', behaviors: [], unscorable_reason: null },
}

const UNSCORABLE_FIXTURE: EvaluationReportData = {
  STG: { score: null, reliability: '0%', behaviors: [], unscorable_reason: 'role_no_bars' },
}

function mountPanel(evaluation: EvaluationReportData = SLF_FIXTURE) {
  return mount(withTooltipProvider(EvidenceAccordion, { evaluation }), {
    global: { mocks: { $t: tMock } },
  })
}

describe('EvidenceAccordion', () => {
  it('introduces the section and says how it lines up with the grid above', () => {
    const text = mountPanel().text()

    expect(text).toContain('report.evidence.title')
    expect(text).toContain('report.evidence.intro')
  })

  it('groups items under the competency code they belong to', () => {
    expect(mountPanel().text()).toContain('SLF')
  })

  it('renders one item per indicator, in the order the grid draws the chips', () => {
    const triggers = mountPanel().findAll('[data-slot="accordion-trigger"]')

    expect(triggers).toHaveLength(3)
    expect(triggers[0]!.text()).toContain('Describe products and services accurately')
    expect(triggers[1]!.text()).toContain('Link own arguments to customer needs')
    expect(triggers[2]!.text()).toContain('Negotiate to reach solutions')
  })

  it('opens one indicator without opening the others', async () => {
    const wrapper = mountPanel()
    const triggers = wrapper.findAll('[data-slot="accordion-trigger"]')

    await triggers[1]!.trigger('click')

    expect(triggers[0]!.attributes('aria-expanded')).toBe('false')
    expect(triggers[1]!.attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('avevamo parlato direttamente con dei potenziali clienti...')
  })

  it('expands every item at once, then offers the inverse', async () => {
    const wrapper = mountPanel()
    const toggle = wrapper.get('[data-testid="evidence-toggle-all"]')

    expect(toggle.text()).toContain('report.evidence.expandAll')

    await toggle.trigger('click')

    for (const trigger of wrapper.findAll('[data-slot="accordion-trigger"]')) {
      expect(trigger.attributes('aria-expanded')).toBe('true')
    }
    expect(toggle.text()).toContain('report.evidence.collapseAll')

    await toggle.trigger('click')

    for (const trigger of wrapper.findAll('[data-slot="accordion-trigger"]')) {
      expect(trigger.attributes('aria-expanded')).toBe('false')
    }
  })

  it('states plainly that a competency has no indicators instead of rendering an empty expander', () => {
    const wrapper = mountPanel(NO_INDICATORS_FIXTURE)

    expect(wrapper.findAll('[data-slot="accordion-trigger"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('report.evidence.noIndicators')
  })

  it('gives the real reason when the competency could not be scored at all', () => {
    const wrapper = mountPanel(UNSCORABLE_FIXTURE)

    expect(wrapper.findAll('[data-slot="accordion-trigger"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('report.unscorable.role_no_bars')
    expect(wrapper.text()).not.toContain('report.evidence.noIndicators')
  })

  it('offers the glossary term for "excerpt" beside the evidence it introduces', () => {
    expect(mountPanel().text()).toContain('help.glossary.excerpt.term')
  })
})
