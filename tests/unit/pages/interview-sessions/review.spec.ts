/**
 * pages/interview-sessions/[id].vue (C11) — the session review view.
 *
 * Held here: a failed review states WHICH failure it was and never falls
 * through to an empty panel (a 403 must not read as "no events"); the sibling
 * nav is best-effort and its failure never blanks the review.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = (key: string) => key

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

const review = { id: 5, participant_id: 11 }
const siblings = [
  { id: 5, competency_code: 'COL', question_index: 0 },
  { id: 6, competency_code: 'INN', question_index: 1 },
]

async function mountPage(composable: {
  fetchReview: ReturnType<typeof vi.fn>
  listSessions: ReturnType<typeof vi.fn>
}) {
  vi.doMock('../../../../app/composables/useSessionReview', () => ({
    useSessionReview: () => composable,
  }))

  const Page = (await import('../../../../app/pages/interview-sessions/[id].vue')).default
  const wrapper = mount(Page, {
    global: {
      mocks: { $t: tMock },
      stubs: {
        SessionReviewPanel: {
          props: ['review', 'locale'],
          template: '<div data-testid="panel" />',
        },
        SessionNav: {
          props: ['sessions', 'currentSessionId'],
          template: '<div data-testid="nav">{{ sessions.length }}</div>',
        },
      },
    },
  })
  await flushPromises()

  return wrapper
}

describe('pages/interview-sessions/[id].vue', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock, locale: ref('en') }))
    )
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ params: { id: '5' } }))
    )
  })

  it('loads the review by the route id, then the participant siblings for the nav', async () => {
    const fetchReview = vi.fn().mockResolvedValue({ data: review })
    const listSessions = vi.fn().mockResolvedValue({ data: siblings })

    const wrapper = await mountPage({ fetchReview, listSessions })

    expect(fetchReview).toHaveBeenCalledWith('5')
    expect(listSessions).toHaveBeenCalledWith(11)
    expect(wrapper.find('[data-testid="panel"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="nav"]').text()).toBe('2')
    expect(wrapper.get('[data-testid="back-to-participant"]').attributes('href')).toBe(
      '/participants/11'
    )
    expect(wrapper.find('[data-testid="review-error"]').exists()).toBe(false)
  })

  it.each([
    [409, 'not-ready'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'error'],
  ])(
    'a %i on the review is stated as %s, with no panel and no sibling lookup',
    async (status, state) => {
      const fetchReview = vi.fn().mockRejectedValue(httpError(status))
      const listSessions = vi.fn()

      const wrapper = await mountPage({ fetchReview, listSessions })

      expect(wrapper.get('[data-testid="review-error"]').attributes('data-state')).toBe(state)
      expect(wrapper.find('[data-testid="panel"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="back-to-participant"]').exists()).toBe(false)
      expect(listSessions).not.toHaveBeenCalled()
    }
  )

  it('keeps the review on screen when only the sibling lookup fails', async () => {
    const fetchReview = vi.fn().mockResolvedValue({ data: review })
    const listSessions = vi.fn().mockRejectedValue(httpError(500))

    const wrapper = await mountPage({ fetchReview, listSessions })

    expect(wrapper.find('[data-testid="panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="review-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="nav"]').text()).toBe('0')
  })
})
