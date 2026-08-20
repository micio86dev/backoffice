/**
 * ParticipantRecoveryPanel.vue (participant-error-recovery, design D9)
 *
 * The operator's ONLY path back out of `errore`. Asserts:
 *   - the competency-list + data-loss warning is sourced from the sessions
 *     prop (status='error'), not a fresh fetch;
 *   - a 409 refusal renders i18n-keyed copy mapped from the machine `reason`,
 *     never the raw string;
 *   - a successful recovery emits 'recovered' with the response payload.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { SessionSummary } from '../../../../app/composables/useSessionReview'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key
const recoverParticipantMock = vi.fn()

vi.mock('../../../../app/composables/useParticipantRecovery', () => ({
  useParticipantRecovery: () => ({
    recoverParticipant: recoverParticipantMock,
  }),
}))

const ParticipantRecoveryPanel = (
  await import('../../../../app/components/organisms/ParticipantRecoveryPanel.vue')
).default

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 1,
    competency_code: 'PRS',
    question_index: 0,
    provider: 'heygen',
    status: 'completed',
    ended_reason: 'completed',
    started_at: null,
    ended_at: null,
    duration_seconds: null,
    integrity_event_count: 0,
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ParticipantRecoveryPanel — initial state', () => {
  it('shows the Re-open action and no competency list before confirming', () => {
    const wrapper = mount(ParticipantRecoveryPanel, {
      props: { participantId: 1, sessions: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('[data-testid="participant-recover-open"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="participant-recover-disclosure"]').exists()).toBe(false)
  })
})

describe('ParticipantRecoveryPanel — confirm step sources the competency list from sessions', () => {
  it('lists only the sessions at status=error, not completed/pending sessions', async () => {
    const wrapper = mount(ParticipantRecoveryPanel, {
      props: {
        participantId: 1,
        sessions: [
          session({ id: 1, competency_code: 'PRS', status: 'completed' }),
          session({ id: 2, competency_code: 'STG', status: 'error' }),
          session({ id: 3, competency_code: 'INN', status: 'pending' }),
        ],
      },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="participant-recover-open"]').trigger('click')

    const items = wrapper.findAll('[data-testid="participant-recover-competency"]')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toBe('STG')
  })
})

describe('ParticipantRecoveryPanel — successful recovery', () => {
  it('calls recoverParticipant with the trimmed reason (or null) and emits "recovered"', async () => {
    recoverParticipantMock.mockResolvedValue({
      status: 'in_attesa',
      competencies_reset: ['STG'],
      utterances_discarded: 1,
    })

    const wrapper = mount(ParticipantRecoveryPanel, {
      props: {
        participantId: 42,
        sessions: [session({ competency_code: 'STG', status: 'error' })],
      },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="participant-recover-open"]').trigger('click')
    await wrapper.get('[data-testid="participant-recover-confirm"]').trigger('click')
    await flushPromises()

    expect(recoverParticipantMock).toHaveBeenCalledWith(42, { reason: null })
    expect(wrapper.emitted('recovered')).toHaveLength(1)
    expect(wrapper.emitted('recovered')?.[0]?.[0]).toEqual({
      status: 'in_attesa',
      competencies_reset: ['STG'],
      utterances_discarded: 1,
    })
    expect(wrapper.find('[data-testid="participant-recover-success"]').exists()).toBe(true)
  })

  it('trims and sends a non-empty reason', async () => {
    recoverParticipantMock.mockResolvedValue({
      status: 'in_attesa',
      competencies_reset: [],
      utterances_discarded: 0,
    })

    const wrapper = mount(ParticipantRecoveryPanel, {
      props: { participantId: 7, sessions: [] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="participant-recover-open"]').trigger('click')
    const textarea = wrapper.get<HTMLTextAreaElement>('[data-testid="participant-recover-reason"]')
    await textarea.setValue('  connection drop  ')
    await wrapper.get('[data-testid="participant-recover-confirm"]').trigger('click')
    await flushPromises()

    expect(recoverParticipantMock).toHaveBeenCalledWith(7, { reason: 'connection drop' })
  })
})

describe('ParticipantRecoveryPanel — 409 refusal maps reason to an i18n key, never the raw string', () => {
  it('renders the i18n-mapped copy for nothing_to_recover, not the raw reason', async () => {
    recoverParticipantMock.mockRejectedValue({
      status: 409,
      data: { reason: 'nothing_to_recover' },
    })

    const wrapper = mount(ParticipantRecoveryPanel, {
      props: { participantId: 1, sessions: [] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="participant-recover-open"]').trigger('click')
    await wrapper.get('[data-testid="participant-recover-confirm"]').trigger('click')
    await flushPromises()

    const errorAlert = wrapper.get('[data-testid="participant-recover-error"]')
    expect(errorAlert.text()).toBe('participantRecovery.refusalReason.nothing_to_recover')
    expect(wrapper.emitted('recovered')).toBeUndefined()
  })
})

describe('ParticipantRecoveryPanel — cancel', () => {
  it('returns to the initial state without calling the API', async () => {
    const wrapper = mount(ParticipantRecoveryPanel, {
      props: { participantId: 1, sessions: [] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="participant-recover-open"]').trigger('click')
    await wrapper.get('[data-testid="participant-recover-cancel"]').trigger('click')

    expect(wrapper.find('[data-testid="participant-recover-open"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="participant-recover-disclosure"]').exists()).toBe(false)
    expect(recoverParticipantMock).not.toHaveBeenCalled()
  })
})
