/**
 * ScoreChip.vue (PR B3, task 19.1; widened to {1,2,3,4,5,-1} — bars-full-
 * scale-1-5 PR 2, tasks 2.3/2.4)
 *
 * Renders a single BARS indicator score. DESIGN.md §8.3 / D1 / D6: the
 * domain {1,2,3,4,5} ∪ {-1} maps to seven chip states; `-1`/`null` means
 * UNASSESSABLE and renders a neutral `–`, never the literal `-1` and never on
 * the error/warning/success scale. `4`/`2` are residual levels and render
 * their OWN numeral (never `–`) with a distinct icon from their adjacent
 * anchor. An out-of-domain value renders the RAW value verbatim (never `–`)
 * with the loud `invalid` state. Color is never the sole signal (numeral +
 * icon carry the meaning too, WCAG 2.1 AA 1.4.1) — assertions below never
 * inspect a CSS color/border class (banned per strict-tdd — implementation
 * detail, not user-visible behavior), only the visible numeral/`–` text, the
 * rendered icon COMPONENT identity, and the visually-hidden i18n label.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/vue/24/outline'
import ScoreChip from '../../../../app/components/atoms/ScoreChip.vue'

const tMock = (key: string) => key

describe('ScoreChip', () => {
  it('renders "1" with the low/error accessible label', () => {
    const wrapper = mount(ScoreChip, { props: { score: 1 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('report.chip.low')
  })

  it('renders "3" with the mid/warning accessible label', () => {
    const wrapper = mount(ScoreChip, { props: { score: 3 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('report.chip.mid')
  })

  it('renders "5" with the high/success accessible label', () => {
    const wrapper = mount(ScoreChip, { props: { score: 5 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('report.chip.high')
  })

  it('renders the neutral "–" (never "-1") for the raw -1 sentinel, with the unassessable label', () => {
    const wrapper = mount(ScoreChip, { props: { score: -1 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).not.toContain('-1')
    expect(wrapper.text()).toContain('report.chip.unassessable')
  })

  it('renders the neutral "–" for a null score (API-mapped sentinel), with the unassessable label', () => {
    const wrapper = mount(ScoreChip, { props: { score: null }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).toContain('report.chip.unassessable')
  })

  it('marks the glyph icon aria-hidden (numeral + visually-hidden label already carry the meaning)', () => {
    const wrapper = mount(ScoreChip, { props: { score: 5 }, global: { mocks: { $t: tMock } } })
    const icon = wrapper.find('svg')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('aria-hidden')).toBe('true')
  })

  it('renders "2" (never "–") with the below-mid label and a distinct residual icon', () => {
    const wrapper = mount(ScoreChip, { props: { score: 2 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).not.toContain('–')
    expect(wrapper.text()).toContain('report.chip.belowMid')
    expect(wrapper.findComponent(ArrowDownCircleIcon).exists()).toBe(true)
  })

  it('renders "4" (never "–") with the above-mid label and a distinct residual icon', () => {
    const wrapper = mount(ScoreChip, { props: { score: 4 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('4')
    expect(wrapper.text()).not.toContain('–')
    expect(wrapper.text()).toContain('report.chip.aboveMid')
    expect(wrapper.findComponent(ArrowUpCircleIcon).exists()).toBe(true)
  })

  it('renders an out-of-domain score verbatim (never "–") with the invalid label and icon', () => {
    const wrapper = mount(ScoreChip, { props: { score: 6 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('6')
    expect(wrapper.text()).not.toContain('–')
    expect(wrapper.text()).toContain('report.chip.invalid')
    expect(wrapper.findComponent(ExclamationCircleIcon).exists()).toBe(true)
  })

  it('an invalid score is never rendered as the neutral unassessable icon', () => {
    const wrapper = mount(ScoreChip, { props: { score: 0 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).not.toContain('report.chip.unassessable')
  })
})

// ─── unassessableReason (B3, design.md D11) ──────────────────────────────────
//
// When the -1/null "unassessable" chip carries an `unassessableReason`, its
// screen-reader label REPLACES the generic `report.chip.unassessable` with
// the reason-specific `report.indicatorUnassessableReason.*` key — the chip's
// visual density is unchanged (still the neutral "–" glyph), only the label
// gains detail.

describe('ScoreChip unassessableReason (indicator-grain reason)', () => {
  it('without a reason, the unassessable chip keeps the generic label', () => {
    const wrapper = mount(ScoreChip, {
      props: { score: -1, unassessableReason: null },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).toContain('report.chip.unassessable')
  })

  it('with a reason, the unassessable chip label uses the reason-specific key instead of the generic one', () => {
    const wrapper = mount(ScoreChip, {
      props: { score: -1, unassessableReason: 'excerpt_unverifiable' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).toContain('report.indicatorUnassessableReason.excerpt_unverifiable')
    expect(wrapper.text()).not.toContain('report.chip.unassessable')
  })

  it('an unrecognized reason falls back loudly, never blank', () => {
    const wrapper = mount(ScoreChip, {
      props: { score: -1, unassessableReason: 'some_future_reason' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('report.indicatorUnassessableReason.unknown')
  })

  it('a reason on a LEGALLY-scored chip is ignored — the score label wins', () => {
    // A defensive case: unassessableReason should only ever be non-null when
    // score is -1/null, but the chip must not misrender if the API sent both.
    const wrapper = mount(ScoreChip, {
      props: { score: 5, unassessableReason: 'model_declared' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('report.chip.high')
    expect(wrapper.text()).not.toContain('report.indicatorUnassessableReason')
  })
})

describe('report.chip.belowMid / aboveMid / invalid i18n keys', () => {
  it('are defined with non-empty strings in both en and it locales', async () => {
    const en = (await import('../../../../i18n/locales/en.json')).default as {
      report: { chip: Record<string, string> }
    }
    const it = (await import('../../../../i18n/locales/it.json')).default as {
      report: { chip: Record<string, string> }
    }

    for (const key of ['belowMid', 'aboveMid', 'invalid']) {
      expect(en.report.chip[key]).toBeTruthy()
      expect(it.report.chip[key]).toBeTruthy()
      // Real translations, not a copy-pasted placeholder shared across locales.
      expect(en.report.chip[key]).not.toBe(it.report.chip[key])
    }
  })
})
