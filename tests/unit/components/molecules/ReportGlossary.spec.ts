/**
 * ReportGlossary.vue — RED
 *
 * The four words the grid is written in, explained where the grid is read. It
 * sits ABOVE the grid on purpose: "what is an indicator" is a question the
 * operator has while looking at the chips, and HelpSheet's route-keyed
 * glossary does not cover /participants/{id} (its `participants` topic carries
 * project/lifecycle/entry-link terms, not the BARS vocabulary).
 *
 * It renders OUTSIDE the <table> — see EvaluationReport.spec.ts for why that
 * boundary is load-bearing.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReportGlossary from '../../../../app/components/molecules/ReportGlossary.vue'
import HelpTip from '../../../../app/components/atoms/HelpTip.vue'
import { withTooltipProvider } from '../../support/tooltip-host'

const tMock = (key: string) => key

function mountGlossary() {
  return mount(withTooltipProvider(ReportGlossary), {
    global: { mocks: { $t: tMock } },
  })
}

describe('ReportGlossary', () => {
  // `excerpt` is deliberately NOT here: it belongs beside the evidence
  // section that actually shows excerpts (EvidenceAccordion), not above a
  // grid that shows none. One tip per place the word is used.
  it('covers the vocabulary the grid is written in', () => {
    const terms = mountGlossary()
      .findAllComponents(HelpTip)
      .map((tip) => tip.props('term'))

    expect(terms).toEqual(['competency', 'indicator', 'reliability', 'bars'])
  })

  it('labels the row so the terms are not mistaken for filters or actions', () => {
    expect(mountGlossary().text()).toContain('report.glossary.label')
  })

  it('renders one focusable trigger per term', () => {
    expect(mountGlossary().findAll('button')).toHaveLength(4)
  })
})
