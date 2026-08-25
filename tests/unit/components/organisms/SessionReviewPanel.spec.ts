/**
 * SessionReviewPanel.vue — the interview review (C11).
 *
 * The contract worth pinning is that the score never appears WITHOUT the
 * events that produced it. A band an operator cannot check against its evidence
 * is a verdict on a candidate, not an input to a judgement — and this panel is
 * the only place that distinction is visible.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionReviewPanel from '../../../../app/components/organisms/SessionReviewPanel.vue'

const tMock = (key: string) => key

function review(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    participant_id: 7,
    competency_code: 'COL',
    question_index: 0,
    provider: 'heygen',
    provider_session_ref: 'sess_1',
    status: 'ended',
    ended_reason: 'completed',
    started_at: '2026-03-01T10:00:00+00:00',
    ended_at: '2026-03-01T10:10:00+00:00',
    duration_seconds: 600,
    integrity: {
      score: 0,
      band: 'low',
      coverage_complete: true,
      unavailable_layers: [],
      total: 0,
      counts: {},
      events: [],
      second_monitor: false,
      tab_hidden_sec: 0,
      face_absent_sec: 0,
      looking_away_sec: 0,
      multiple_faces_sec: 0,
      second_voice_sec: 0,
      fullscreen_exits: 0,
      clipboard_copies: 0,
      clipboard_pastes: 0,
    },
    snapshots: [],
    cost: { avatar: { provider: 'heygen', minutes: 10, usd: 2 }, is_estimate: true as const },
    ...over,
  }
}

function mountPanel(data: ReturnType<typeof review>) {
  return mount(SessionReviewPanel, {
    props: { review: data as never, locale: 'it' },
    global: { mocks: { $t: tMock } },
  })
}

describe('SessionReviewPanel', () => {
  it('shows the score beside the events that produced it, never alone', () => {
    const wrapper = mountPanel(
      review({
        integrity: {
          ...review().integrity,
          score: 18.4,
          band: 'medium',
          total: 2,
          events: [
            {
              kind: 'looking_away',
              ts: '2026-03-01T10:01:00+00:00',
              payload: { durationMs: 4000 },
            },
            { kind: 'focus_lost', ts: '2026-03-01T10:02:00+00:00', payload: {} },
          ],
        },
      })
    )

    expect(wrapper.find('[data-testid="integrity-score"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="integrity-events"] > li')).toHaveLength(2)
  })

  it('renders a clean session as "no events", not as an empty area', () => {
    const wrapper = mountPanel(review())

    expect(wrapper.find('[data-testid="integrity-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="integrity-events"]').exists()).toBe(false)
  })

  it('uses the signed URL exactly as the API gave it', () => {
    const url = 'https://example.test/signed?sig=abc&expires=123'
    const wrapper = mountPanel(
      review({ snapshots: [{ url, taken_at: '2026-03-01T10:03:00+00:00' }] })
    )

    expect(wrapper.get('[data-testid="snapshots"] img').attributes('src')).toBe(url)
  })

  it('says "no snapshots" rather than showing an empty strip', () => {
    expect(mountPanel(review()).find('[data-testid="snapshots-empty"]').exists()).toBe(true)
  })

  // No provider exposes a per-session billed amount, so the figure must never
  // read as a charge.
  it('labels cost through the estimate copy key', () => {
    expect(mountPanel(review()).text()).toContain('review.costEstimate')
  })

  it('shows a dash rather than zero when a session cannot be priced', () => {
    const wrapper = mountPanel(review({ cost: { avatar: null, is_estimate: true } }))

    // Zero would claim the session was free, which is a different statement
    // from "this cannot be priced".
    expect(wrapper.text()).toContain('–')
  })

  it('does not recompute the score: it renders what the API sent', () => {
    // 99.9 is impossible from the events below; if the panel ever recomputed,
    // this would silently disagree with the server.
    const wrapper = mountPanel(
      review({
        integrity: {
          ...review().integrity,
          score: 99.9,
          band: 'high',
          total: 1,
          events: [{ kind: 'looking_down', ts: '2026-03-01T10:01:00+00:00', payload: {} }],
        },
      })
    )

    expect(wrapper.get('[data-testid="integrity-band"]').text()).toContain('high')
  })
})

/**
 * The defect: on 2026-08-25 a real interview in which the candidate looked away
 * from the camera and picked up a phone rendered as "Rischio basso, punteggio
 * 0", because the detectors had never loaded and nothing distinguished "not
 * measured" from "measured, nothing found".
 *
 * These guard the read surface. Written AFTER the component, not before — they
 * are regression guards for what shipped, and did not drive it.
 */
describe('SessionReviewPanel — coverage honesty', () => {
  const withCoverage = (over: Record<string, unknown>) => ({
    ...review(),
    integrity: { ...review().integrity, ...over },
  })

  it('renders "not measured" instead of a risk band when the band is null', async () => {
    const wrapper = await mountPanel(
      withCoverage({ band: null, coverage_complete: false, unavailable_layers: ['face'] })
    )

    const badge = wrapper.find('[data-testid="integrity-band"]')
    expect(badge.exists()).toBe(true)
    // i18n is stubbed in this suite: $t returns the key, so the assertion is
    // that the NOT-MEASURED key is used — never a band key.
    expect(badge.text()).toBe('review.integrity.notMeasured')
  })

  it('never styles an unmeasured session with the success palette', async () => {
    // An operator scanning a list reads the colour before the word. Green here
    // would say "clean" about a session nobody observed.
    const wrapper = await mountPanel(
      withCoverage({ band: null, coverage_complete: false, unavailable_layers: ['face'] })
    )

    const cls = wrapper.find('[data-testid="integrity-band"]').attributes('class') ?? ''
    expect(cls).not.toContain('success')
  })

  it('explains why the band is missing, beside the badge', async () => {
    const wrapper = await mountPanel(
      withCoverage({ band: null, coverage_complete: false, unavailable_layers: ['face', 'phone'] })
    )

    const warning = wrapper.find('[data-testid="integrity-coverage-warning"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('review.integrity.coverageIncomplete')
    expect(warning.text()).toContain('review.integrity.unavailableLayers')
  })

  it('still shows a medium band under partial coverage — it is a valid lower bound', async () => {
    // A measurement never taken can only RAISE the true score. Withholding a
    // real finding would be the opposite of the point.
    const wrapper = await mountPanel(
      withCoverage({
        band: 'medium',
        score: 18.4,
        coverage_complete: false,
        unavailable_layers: ['phone'],
      })
    )

    expect(wrapper.find('[data-testid="integrity-band"]').text()).toBe(
      'review.integrity.band.medium'
    )
    expect(wrapper.find('[data-testid="integrity-coverage-warning"]').exists()).toBe(true)
  })

  it('shows no coverage warning when the session was fully observed', async () => {
    const wrapper = await mountPanel(
      withCoverage({ coverage_complete: true, unavailable_layers: [] })
    )

    expect(wrapper.find('[data-testid="integrity-coverage-warning"]').exists()).toBe(false)
  })

  it('does not warn against an API that predates the coverage fields', async () => {
    // `undefined` means "this server has no opinion about coverage", not
    // "coverage was incomplete". Warning on every session during a version skew
    // is noise, and noise is how a real warning stops being read.
    const integrity = { ...review().integrity }
    delete (integrity as Record<string, unknown>)['coverage_complete']
    delete (integrity as Record<string, unknown>)['unavailable_layers']

    const wrapper = await mountPanel({ ...review(), integrity })

    expect(wrapper.find('[data-testid="integrity-coverage-warning"]').exists()).toBe(false)
  })
})
