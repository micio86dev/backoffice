/**
 * TranscriptPanel.vue (operator-participant-visibility PR4, D2/D7).
 *
 * Presentational: the page fetches `{ is_partial, sessions }` from
 * `useTranscript` and passes it down — this component renders it and
 * nothing else. It receives NO status/lifecycle prop at all, which is what
 * makes "the partial label follows the payload, never a recomputed
 * lifecycle check" structurally true rather than merely tested: there is no
 * second input the label could be computed from.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TranscriptPanel from '../../../../app/components/organisms/TranscriptPanel.vue'
import type { TranscriptSession } from '../../../../app/composables/useTranscript'

const tMock = (key: string) => key

const SESSIONS: TranscriptSession[] = [
  {
    session_id: 10,
    competency_code: 'COL',
    question_index: 0,
    utterances: [
      {
        speaker: 'avatar',
        text: 'Tell me about a time you collaborated.',
        ts: '2026-03-14T10:00:00Z',
      },
      { speaker: 'candidate', text: 'Sure, once I worked with...', ts: '2026-03-14T10:00:05Z' },
    ],
  },
  {
    session_id: 11,
    competency_code: 'INN',
    question_index: 1,
    utterances: [
      { speaker: 'avatar', text: 'Describe an innovative solution.', ts: '2026-03-14T10:05:00Z' },
      { speaker: 'candidate', text: 'At my last job...', ts: '2026-03-14T10:05:10Z' },
    ],
  },
]

function mountPanel(props: { sessions: TranscriptSession[]; isPartial: boolean }) {
  return mount(TranscriptPanel, {
    props,
    global: { mocks: { $t: tMock } },
  })
}

describe('TranscriptPanel', () => {
  it('groups turns by question and attributes each turn to its speaker as a text label', () => {
    const wrapper = mountPanel({ sessions: SESSIONS, isPartial: false })

    // Grouped: one section per session/question, both competency codes present.
    expect(wrapper.text()).toContain('COL')
    expect(wrapper.text()).toContain('INN')

    // Both turns of a question render, attributed by a TEXT label (never
    // colour alone, DESIGN.md §9.1) — the speaker key resolves through i18n.
    expect(wrapper.text()).toContain('participants.detail.transcript.speaker.avatar')
    expect(wrapper.text()).toContain('participants.detail.transcript.speaker.candidate')
    expect(wrapper.text()).toContain('Tell me about a time you collaborated.')
    expect(wrapper.text()).toContain('Sure, once I worked with...')
  })

  it('renders a visible partial Alert ABOVE the turns when is_partial is true (DOM order, not mere presence)', () => {
    const wrapper = mountPanel({ sessions: SESSIONS, isPartial: true })

    const alert = wrapper.find('[data-testid="transcript-partial"]')
    expect(alert.exists()).toBe(true)

    const html = wrapper.html()
    const alertIndex = html.indexOf('transcript-partial')
    const firstTurnIndex = html.indexOf('Tell me about a time you collaborated.')
    expect(alertIndex).toBeGreaterThanOrEqual(0)
    expect(firstTurnIndex).toBeGreaterThan(alertIndex)
  })

  it('renders no partial label at all when is_partial is false', () => {
    const wrapper = mountPanel({ sessions: SESSIONS, isPartial: false })

    expect(wrapper.find('[data-testid="transcript-partial"]').exists()).toBe(false)
  })

  it('the partial label follows the isPartial prop alone — identical sessions, different prop, different output', () => {
    const partial = mountPanel({ sessions: SESSIONS, isPartial: true })
    const complete = mountPanel({ sessions: SESSIONS, isPartial: false })

    expect(partial.find('[data-testid="transcript-partial"]').exists()).toBe(true)
    expect(complete.find('[data-testid="transcript-partial"]').exists()).toBe(false)
  })

  it('says "no turns recorded" rather than rendering an empty area', () => {
    const wrapper = mountPanel({ sessions: [], isPartial: false })

    expect(wrapper.find('[data-testid="transcript-empty"]').exists()).toBe(true)
  })

  it('falls back to the raw literal for an unrecognized speaker value, never throwing', () => {
    const wrapper = mountPanel({
      sessions: [
        {
          session_id: 20,
          competency_code: 'PRS',
          question_index: 0,
          utterances: [{ speaker: 'system', text: 'A future third speaker.', ts: null }],
        },
      ],
      isPartial: false,
    })

    expect(wrapper.text()).toContain('system')
    expect(wrapper.text()).toContain('A future third speaker.')
  })
})
