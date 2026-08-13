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
