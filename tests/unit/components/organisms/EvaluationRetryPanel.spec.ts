/**
 * EvaluationRetryPanel.vue (scoring-retry-rt-b, PR4a)
 *
 * The operator's single re-interview of a `pending` evaluation. Asserts:
 *   - the five states follow `retry_available`, `retry_attempt`,
 *     `retry_authorized_at` and the literal `status`, and nothing renders when
 *     there is no retry state;
 *   - the authorize action is gated by the `canRetry` flag the parent derives
 *     from the abilities contract, never by a role name;
 *   - nothing is sent until the operator confirms; the optional reason is
 *     trimmed and an empty one is omitted from the body;
 *   - success shows the link, Copy, the single-use statement, the ABSOLUTE
 *     expiry and the email status, and the link cannot come back after dismissal;
 *   - each 409 reason maps to its own i18n key, never the raw machine string,
 *     and disables the action;
 *   - every key exists in `it` and `en`, with no fixed lifetime anywhere.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import en from '../../../../i18n/locales/en.json'
import it_ from '../../../../i18n/locales/it.json'
import { formatDate } from '../../../../app/utils/format'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key
const authorizeRetryMock = vi.fn()

vi.mock('../../../../app/composables/useEvaluationRetry', () => ({
  useEvaluationRetry: () => ({ authorizeRetry: authorizeRetryMock }),
}))

const EvaluationRetryPanel = (
  await import('../../../../app/components/organisms/EvaluationRetryPanel.vue')
).default

type Props = {
  participantId: number
  status: string
  retryAvailable: boolean
  retryAttempt: boolean
  retryAuthorizedAt: string | null
  canRetry: boolean
  locale: string
}

function mountPanel(overrides: Partial<Props> = {}) {
  return mount(EvaluationRetryPanel, {
    props: {
      participantId: 42,
      status: 'completato',
      retryAvailable: true,
      retryAttempt: false,
      retryAuthorizedAt: null,
      canRetry: true,
      locale: 'en',
      ...overrides,
    },
    global: { mocks: { $t: tMock } },
  })
}

const SUCCESS = {
  status: 'in_attesa',
  entry_url: 'https://interview.example.com/en/interview/retry-token-abc',
  expires_at: '2026-10-07T10:00:00.000000Z',
  email_sent: true,
  competencies_reset: ['PRS', 'STG'],
}

async function openAndConfirm(wrapper: ReturnType<typeof mountPanel>) {
  await wrapper.get('[data-testid="evaluation-retry-open"]').trigger('click')
  await wrapper.get('[data-testid="evaluation-retry-confirm"]').trigger('click')
  await flushPromises()
}

afterEach(() => {
  vi.restoreAllMocks()
  authorizeRetryMock.mockReset()
})

describe('EvaluationRetryPanel — which state renders', () => {
  it('shows the authorize action when retry is available and the user may retry', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('[data-testid="evaluation-retry-open"]').exists()).toBe(true)
  })

  it('renders nothing for a user without the retry flag, even when retry is available', () => {
    const wrapper = mountPanel({ canRetry: false })

    expect(wrapper.find('[data-testid="evaluation-retry-open"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="evaluation-retry-state"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('renders nothing when there is no retry state (not available, not attempted)', () => {
    const wrapper = mountPanel({ retryAvailable: false, retryAttempt: false })

    expect(wrapper.find('[data-testid="evaluation-retry-open"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="evaluation-retry-state"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it.each([
    ['in_attesa', 'waiting'],
    ['in_corso', 'inProgress'],
    ['in_valutazione', 'scoring'],
    ['completato', 'finished'],
  ])('shows the %s retry state as %s, for a user without the flag too', (status, state) => {
    const wrapper = mountPanel({
      status,
      retryAvailable: false,
      retryAttempt: true,
      retryAuthorizedAt: '2026-10-06T09:30:00.000000Z',
      canRetry: false,
    })

    const line = wrapper.get('[data-testid="evaluation-retry-state"]')
    expect(line.attributes('data-state')).toBe(state)
    expect(wrapper.find('[data-testid="evaluation-retry-open"]').exists()).toBe(false)
  })

  it('keeps offering the action, not a progress line, while retry_available is true', () => {
    const wrapper = mountPanel({ status: 'in_attesa', retryAvailable: true, retryAttempt: true })

    expect(wrapper.find('[data-testid="evaluation-retry-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="evaluation-retry-open"]').exists()).toBe(true)
  })

  it('shows the absolute authorization date in the Waiting state only', () => {
    const waiting = mountPanel({
      status: 'in_attesa',
      retryAvailable: false,
      retryAttempt: true,
      retryAuthorizedAt: '2026-10-06T09:30:00.000000Z',
    })
    const scoring = mountPanel({
      status: 'in_valutazione',
      retryAvailable: false,
      retryAttempt: true,
      retryAuthorizedAt: '2026-10-06T09:30:00.000000Z',
    })

    expect(waiting.get('[data-testid="evaluation-retry-state"]').text()).toContain(
      formatDate('2026-10-06T09:30:00.000000Z', 'en')
    )
    expect(scoring.get('[data-testid="evaluation-retry-state"]').text()).not.toContain(
      formatDate('2026-10-06T09:30:00.000000Z', 'en')
    )
  })
})

describe('EvaluationRetryPanel — confirm step', () => {
  it('states the four consequences and sends nothing before confirm', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="evaluation-retry-open"]').trigger('click')

    const disclosure = wrapper.get('[data-testid="evaluation-retry-disclosure"]').text()
    for (const key of ['reDo', 'unreadable', 'once', 'link']) {
      expect(disclosure).toContain(`evaluationRetry.confirm.consequence.${key}`)
    }
    expect(authorizeRetryMock).not.toHaveBeenCalled()
  })

  it('caps the reason at 500 characters', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="evaluation-retry-open"]').trigger('click')

    expect(wrapper.get('[data-testid="evaluation-retry-reason"]').attributes('maxlength')).toBe(
      '500'
    )
  })

  it('cancel returns to the initial state without calling the API', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="evaluation-retry-open"]').trigger('click')
    await wrapper.get('[data-testid="evaluation-retry-cancel"]').trigger('click')

    expect(wrapper.find('[data-testid="evaluation-retry-open"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="evaluation-retry-disclosure"]').exists()).toBe(false)
    expect(authorizeRetryMock).not.toHaveBeenCalled()
  })
})

describe('EvaluationRetryPanel — the request', () => {
  it('sends the trimmed reason', async () => {
    authorizeRetryMock.mockResolvedValue(SUCCESS)
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="evaluation-retry-open"]').trigger('click')
    await wrapper.get('[data-testid="evaluation-retry-reason"]').setValue('  customer asked  ')
    await wrapper.get('[data-testid="evaluation-retry-confirm"]').trigger('click')
    await flushPromises()

    expect(authorizeRetryMock).toHaveBeenCalledWith(42, { reason: 'customer asked' })
  })

  it('sends no reason at all when the field is empty or blank', async () => {
    authorizeRetryMock.mockResolvedValue(SUCCESS)
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="evaluation-retry-open"]').trigger('click')
    await wrapper.get('[data-testid="evaluation-retry-reason"]').setValue('   ')
    await wrapper.get('[data-testid="evaluation-retry-confirm"]').trigger('click')
    await flushPromises()

    expect(authorizeRetryMock).toHaveBeenCalledWith(42, {})
  })
})

describe('EvaluationRetryPanel — success', () => {
  it('shows the link, Copy, the absolute expiry and the email status together, and emits', async () => {
    authorizeRetryMock.mockResolvedValue(SUCCESS)
    const wrapper = mountPanel()

    await openAndConfirm(wrapper)

    expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(SUCCESS.entry_url)
    expect(wrapper.find('[data-testid="entry-link-copy"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="entry-link-disclosure"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="entry-link-expiry"]').text()).toContain(
      formatDate(SUCCESS.expires_at, 'en')
    )
    expect(wrapper.get('[data-testid="evaluation-retry-email-status"]').text()).toBe(
      'evaluationRetry.success.emailSent'
    )
    expect(wrapper.emitted('authorized')).toHaveLength(1)
    expect(wrapper.emitted('authorized')?.[0]?.[0]).toEqual({
      status: 'in_attesa',
      competencies_reset: ['PRS', 'STG'],
    })
  })

  it('never offers to generate another link and never claims an earlier one was revoked', async () => {
    authorizeRetryMock.mockResolvedValue(SUCCESS)
    const wrapper = mountPanel()

    await openAndConfirm(wrapper)

    expect(wrapper.find('[data-testid="entry-link-generate"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/revok/i)
  })

  it('tells the operator to hand the link over when no email was sent', async () => {
    authorizeRetryMock.mockResolvedValue({ ...SUCCESS, email_sent: false })
    const wrapper = mountPanel()

    await openAndConfirm(wrapper)

    expect(wrapper.get('[data-testid="evaluation-retry-email-status"]').text()).toBe(
      'evaluationRetry.success.emailNotSent'
    )
  })

  it('removes the link for good once dismissed, even if the parent props change', async () => {
    authorizeRetryMock.mockResolvedValue(SUCCESS)
    const wrapper = mountPanel()

    await openAndConfirm(wrapper)
    await wrapper.get('[data-testid="evaluation-retry-dismiss"]').trigger('click')

    expect(wrapper.find('[data-testid="entry-link-url"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(SUCCESS.entry_url)

    await wrapper.setProps({
      status: 'in_attesa',
      retryAvailable: false,
      retryAttempt: true,
      retryAuthorizedAt: '2026-10-06T09:30:00.000000Z',
    })

    expect(wrapper.find('[data-testid="entry-link-url"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="evaluation-retry-state"]').attributes('data-state')).toBe(
      'waiting'
    )
  })

  it('does not bring the action back after a success, before the parent has refreshed', async () => {
    authorizeRetryMock.mockResolvedValue(SUCCESS)
    const wrapper = mountPanel()

    await openAndConfirm(wrapper)
    await wrapper.get('[data-testid="evaluation-retry-dismiss"]').trigger('click')

    // Props are untouched: the participant still reads retry_available = true.
    expect(wrapper.find('[data-testid="evaluation-retry-open"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="evaluation-retry-confirm"]').exists()).toBe(false)
  })
})

describe('EvaluationRetryPanel — 409 refusals', () => {
  it('maps a reason the UI does not know to the generic key, not a missing one', async () => {
    authorizeRetryMock.mockRejectedValue({ status: 409, data: { reason: 'some_new_reason' } })
    const wrapper = mountPanel()

    await openAndConfirm(wrapper)

    expect(wrapper.get('[data-testid="evaluation-retry-error"]').text()).toBe(
      'evaluationRetry.refusalReason.unknown'
    )
  })

  it.each([
    'retry_already_consumed',
    'not_completed',
    'test_mode_participant',
    'evaluation_not_pending',
    'project_inaccessible',
  ])('maps %s to its own i18n key and disables the action', async (reason) => {
    authorizeRetryMock.mockRejectedValue({ status: 409, data: { reason } })
    const wrapper = mountPanel()

    await openAndConfirm(wrapper)

    const alert = wrapper.get('[data-testid="evaluation-retry-error"]')
    expect(alert.text()).toBe(`evaluationRetry.refusalReason.${reason}`)
    expect(alert.text()).not.toBe(reason)
    expect(
      wrapper.get('[data-testid="evaluation-retry-confirm"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.emitted('authorized')).toBeUndefined()

    await wrapper.get('[data-testid="evaluation-retry-cancel"]').trigger('click')

    expect(
      wrapper.get('[data-testid="evaluation-retry-open"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.get('[data-testid="evaluation-retry-error"]').text()).toBe(
      `evaluationRetry.refusalReason.${reason}`
    )
  })

  it('falls back to the generic key for an unknown failure and keeps the action usable', async () => {
    authorizeRetryMock.mockRejectedValue(new Error('network'))
    const wrapper = mountPanel()

    await openAndConfirm(wrapper)

    expect(wrapper.get('[data-testid="evaluation-retry-error"]').text()).toBe(
      'evaluationRetry.refusalReason.unknown'
    )
    expect(wrapper.get('[data-testid="evaluation-retry-confirm"]').attributes('disabled')).toBe(
      undefined
    )
  })
})

describe('EvaluationRetryPanel — copy exists in it and en', () => {
  function leafPaths(node: unknown, prefix = ''): string[] {
    if (typeof node === 'string') return [prefix]
    if (typeof node !== 'object' || node === null) return []

    return Object.entries(node).flatMap(([key, value]) =>
      leafPaths(value, prefix ? `${prefix}.${key}` : key)
    )
  }

  const enLeaves = leafPaths((en as Record<string, unknown>).evaluationRetry, 'evaluationRetry')
  const itLeaves = leafPaths((it_ as Record<string, unknown>).evaluationRetry, 'evaluationRetry')

  it('has the same, non-empty set of keys in both locales', () => {
    expect(enLeaves.length).toBeGreaterThan(20)
    expect(itLeaves).toEqual(enLeaves)
  })

  it('has a refusal key for every machine reason plus the generic one', () => {
    for (const reason of [
      'retry_already_consumed',
      'not_completed',
      'test_mode_participant',
      'evaluation_not_pending',
      'project_inaccessible',
      'unknown',
    ]) {
      expect(enLeaves).toContain(`evaluationRetry.refusalReason.${reason}`)
    }
  })

  it('never states a fixed link lifetime in either language', () => {
    const text = JSON.stringify([
      (en as Record<string, unknown>).evaluationRetry,
      (it_ as Record<string, unknown>).evaluationRetry,
    ])

    expect(text).not.toMatch(/\b(30|24)\s*(minut|hour|ore\b|ora\b)/i)
    expect(text).not.toMatch(/\b(30|24)\b/)
  })
})
