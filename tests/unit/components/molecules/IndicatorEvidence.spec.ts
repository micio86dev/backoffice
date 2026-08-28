/**
 * IndicatorEvidence.vue — RED
 *
 * One disclosure unit of the evaluation report: an indicator's TEXT, the
 * SCORE it received, and the verbatim EVIDENCE behind that score, in a single
 * place.
 *
 * Before this component those three lived apart — the score in the grid, the
 * indicator text and its excerpts in a separate block below, with nothing
 * linking a chip to the sentence that justified it. The trigger therefore
 * carries the chip AND the indicator text: that pairing IS the join, and it
 * is what these tests pin.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { Accordion } from '../../../../app/components/ui/accordion'
import IndicatorEvidence from '../../../../app/components/molecules/IndicatorEvidence.vue'
import type { EvaluationBehavior } from '../../../../app/composables/useEvaluationReport'

const tMock = (key: string) => key

const SCORED: EvaluationBehavior = {
  indicator: 'Describe products and services accurately',
  score: 5,
  explanation: 'Clear and engaging description.',
  excerpts: ['Durante un pranzo tra colleghi ho dovuto...'],
  unassessable_reason: null,
}

const UNASSESSABLE: EvaluationBehavior = {
  indicator: 'Negotiate to reach solutions that meet customer interests',
  score: -1,
  explanation: '',
  excerpts: [],
  unassessable_reason: 'model_declared',
}

function mountItem(behavior: EvaluationBehavior, open = false) {
  return mount(Accordion, {
    props: { type: 'multiple' as const, defaultValue: open ? ['SLF-0'] : [] },
    slots: { default: () => h(IndicatorEvidence, { value: 'SLF-0', behavior }) },
    global: { mocks: { $t: tMock } },
  })
}

describe('IndicatorEvidence', () => {
  it('puts the indicator text on the trigger, where it can be read without expanding', () => {
    expect(mountItem(SCORED).find('button').text()).toContain(
      'Describe products and services accurately'
    )
  })

  it('puts the score chip on the same trigger — that pairing is the chip-to-evidence join', () => {
    const trigger = mountItem(SCORED).find('button')

    // ScoreChip's accessible label, i.e. the SAME chip the grid renders for
    // this indicator, in the same position.
    expect(trigger.text()).toContain('report.chip.high')
  })

  it('starts collapsed, so a long report opens as a summary rather than a wall of text', () => {
    expect(mountItem(SCORED).find('button').attributes('aria-expanded')).toBe('false')
  })

  it('exposes the reka-ui accordion ARIA wiring: a labelled region controlled by the trigger', () => {
    const wrapper = mountItem(SCORED, true)
    const trigger = wrapper.find('button')
    const region = wrapper.find('[role="region"]')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(region.exists()).toBe(true)
    expect(region.attributes('aria-labelledby')).toBe(trigger.attributes('id'))
    // NOT asserted: `aria-controls` on the trigger. reka-ui 2.10 mints the
    // content id lazily, inside AccordionContent's own setup, and the id is
    // not reactive back onto the already-rendered CollapsibleTrigger — so the
    // trigger ships `aria-controls=""`. That is a reka-ui defect, upstream of
    // this component; pinning it here would only freeze the bug into our
    // suite. The `aria-expanded` + labelled `role="region"` pair is what
    // assistive tech actually navigates by, and both are correct.
  })

  it('reveals the verbatim excerpt and the scorer rationale once expanded', () => {
    const region = mountItem(SCORED, true).find('[role="region"]')

    expect(region.text()).toContain('report.evidence.explanation')
    expect(region.text()).toContain('Clear and engaging description.')
    expect(region.text()).toContain('Durante un pranzo tra colleghi ho dovuto...')
  })

  it('omits the rationale block entirely when the explanation is empty — no bare label', () => {
    const region = mountItem(UNASSESSABLE, true).find('[role="region"]')

    expect(region.text()).not.toContain('report.evidence.explanation')
  })

  it('announces an unassessable indicator as unassessable, never as a low score', () => {
    const trigger = mountItem(UNASSESSABLE).find('button')

    expect(trigger.text()).toContain('report.indicatorUnassessableReason.model_declared')
    expect(trigger.text()).not.toContain('report.chip.low')
    // The -1 sentinel is a rendering detail of the pipeline, never operator copy.
    expect(trigger.text()).not.toContain('-1')
  })

  it('says plainly that an indicator produced no excerpts rather than opening onto nothing', () => {
    expect(mountItem(UNASSESSABLE, true).find('[role="region"]').text()).toContain(
      'report.excerpts.empty'
    )
  })
})
