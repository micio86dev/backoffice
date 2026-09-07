/**
 * MetricCard.vue (PR B2, task 17.5/18.1 — RED)
 *
 * Presentational KPI card: label + value, both passed in already-formatted
 * (Intl.NumberFormat/Intl.DateTimeFormat happen at the call site — see
 * format.ts) so this atom stays free of locale logic.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricCard from '../../../../app/components/molecules/MetricCard.vue'

describe('MetricCard', () => {
  it('renders the given label and value', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Total candidates', value: '128' },
    })

    expect(wrapper.text()).toContain('Total candidates')
    expect(wrapper.text()).toContain('128')
  })

  it('renders a DIFFERENT label/value pair for different props (proves real prop rendering)', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Completion rate', value: '75%' },
    })

    expect(wrapper.text()).toContain('Completion rate')
    expect(wrapper.text()).toContain('75%')
    expect(wrapper.text()).not.toContain('Total candidates')
  })

  // dashboard-e2e: the KPI tiles expose no data-testid today (only the cost
  // card did, via a raw attribute) — DESIGN.md §5 forbids CSS-selector
  // assertions, so the e2e spec cannot target a tile honestly without this.
  it('forwards testId to the root element as data-testid', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Total candidates', value: '128', testId: 'dashboard-total-participants' },
    })

    expect(wrapper.attributes('data-testid')).toBe('dashboard-total-participants')
  })

  it('renders no data-testid when testId is not provided', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Total candidates', value: '128' },
    })

    expect(wrapper.attributes('data-testid')).toBeUndefined()
  })

  it('renders the detail line only when there is one', () => {
    // `detail` had no test in the component's own spec — it was covered only
    // indirectly from a page spec, which is coverage by accident.
    expect(
      mount(MetricCard, { props: { label: 'Cost', value: '$ 12' } })
        .find('[data-testid="metric-card-detail"]')
        .exists()
    ).toBe(false)

    expect(
      mount(MetricCard, { props: { label: 'Cost', value: '$ 12', detail: 'LLM $ 9 · TTS $ 3' } })
        .get('[data-testid="metric-card-detail"]')
        .text()
    ).toBe('LLM $ 9 · TTS $ 3')
  })

  it('derives the detail testid from testId, so two cards cannot collide', () => {
    // A repeatable component with one hardcoded id hands every instance the
    // same handle; two detail-bearing cards on a page make a strict-mode
    // locator ambiguous. The generic id remains the fallback, because a page
    // spec already queries it on a card that passes no testId.
    const wrapper = mount(MetricCard, {
      props: { label: 'Cost', value: '$ 12', detail: 'LLM $ 9', testId: 'dashboard-cost' },
    })

    expect(wrapper.get('[data-testid="dashboard-cost-detail"]').text()).toBe('LLM $ 9')
    expect(wrapper.find('[data-testid="metric-card-detail"]').exists()).toBe(false)
  })

  it('names the tile by pointing the group at the label element', () => {
    // The point of the change: shadcn's CardTitle/CardDescription are plain
    // divs, so a tile used to be three unassociated text runs. `role="group"`
    // + `aria-labelledby` gives it an accessible NAME, which is also what lets
    // the e2e locate tiles by role instead of by test id.
    const wrapper = mount(MetricCard, {
      props: { label: 'AI & avatar spend', value: 'USD 12.00', testId: 'dashboard-cost' },
    })

    expect(wrapper.attributes('role')).toBe('group')
    // The id must RESOLVE to the label. An aria-labelledby pointing at nothing
    // names the group nothing at all and renders identically, so this is the
    // only assertion that separates the two.
    const labelledBy = wrapper.attributes('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(wrapper.get(`#${labelledBy}`).text()).toBe('AI & avatar spend')
  })

  it('names the tile even with no testId, because the name is not a test hook', () => {
    // This is the whole reason the id comes from useId() and not from testId.
    // SessionReviewPanel and the interview detail page render MetricCard with
    // no testId; deriving the accessible name from a test hook would leave
    // every one of those tiles unnamed — an accessibility property that only
    // exists when something is looking at it.
    const wrapper = mount(MetricCard, { props: { label: 'Durata', value: '12 min' } })

    const labelledBy = wrapper.attributes('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(wrapper.get(`#${labelledBy}`).text()).toBe('Durata')
  })

  it('gives two tiles on one page different label ids', () => {
    // A hardcoded id would make both groups name themselves after whichever
    // element landed in the DOM first — announced correctly in isolation and
    // wrongly on the page that actually ships.
    //
    // Both tiles are mounted in ONE app on purpose: useId() counts per app
    // instance, so two separate mount() calls each return 'v-0' and would prove
    // nothing about a real page, where every tile shares one app.
    const page = mount(
      {
        components: { MetricCard },
        template: `
          <div>
            <MetricCard label="Uno" value="1" />
            <MetricCard label="Due" value="2" />
          </div>
        `,
      },
      { global: { stubs: {} } }
    )

    const [first, second] = page.findAllComponents(MetricCard)
    const firstId = first!.attributes('aria-labelledby')
    const secondId = second!.attributes('aria-labelledby')

    expect(firstId).toBeTruthy()
    expect(firstId).not.toBe(secondId)
    // Each id must resolve to ITS OWN label, not merely differ.
    expect(page.get(`#${firstId}`).text()).toBe('Uno')
    expect(page.get(`#${secondId}`).text()).toBe('Due')
  })
})
