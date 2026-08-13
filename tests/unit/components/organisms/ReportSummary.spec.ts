/**
 * ReportSummary.vue (Unit 7, task 27.5 — RED)
 *
 * Renders counts by status and mean competency score per code from
 * `/evaluations/summary`. `scored_count`/`result_count` are both shown so a
 * mean built from a fraction of the filtered set reads as visibly partial
 * (D7).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReportSummary from '../../../../app/components/organisms/ReportSummary.vue'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${JSON.stringify(params)})` : key

describe('ReportSummary', () => {
  it('renders counts by status', () => {
    const wrapper = mount(ReportSummary, {
      props: {
        summary: {
          by_status: { completed: 12, pending: 3 },
          competencies: [],
        },
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('3')
  })

  it('renders the mean score per competency code, visibly partial when scored_count < result_count', () => {
    const wrapper = mount(ReportSummary, {
      props: {
        summary: {
          by_status: {},
          competencies: [
            { competency_code: 'COL', mean_score: 3.67, scored_count: 3, result_count: 40 },
          ],
        },
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('COL')
    expect(wrapper.text()).toContain('3.67')
    // D7: 3 of 40 scored must be visible, not silently averaged as authoritative.
    expect(wrapper.text()).toContain('reports.summary.scoredOf({"scored":3,"result":40})')
  })

  it('renders a null mean without implying a score of zero', () => {
    const wrapper = mount(ReportSummary, {
      props: {
        summary: {
          by_status: {},
          competencies: [
            { competency_code: 'COL', mean_score: null, scored_count: 0, result_count: 5 },
          ],
        },
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).not.toContain('0"')
    expect(wrapper.find('[data-testid="report-summary-mean-COL"]').text()).toBe('—')
  })
})
