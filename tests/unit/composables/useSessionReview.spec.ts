/**
 * useSessionReview — the wire between the screens and the API. Thin by design, so what is
 * worth asserting is the SHAPE of each call (verb, path, body) and that a
 * failure propagates untouched: a wrong verb or path fails only at runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useSessionReview } = await import('../../../app/composables/useSessionReview')

describe('useSessionReview', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists the sessions of a participant', async () => {
    await useSessionReview().listSessions(7)

    expect(apiFetch).toHaveBeenCalledWith('/participants/7/sessions')
  })

  it('fetches one session review by id', async () => {
    const review = { data: { id: 4, cost: { avatar: null, llm: null } } }
    apiFetch.mockResolvedValue(review)

    await expect(useSessionReview().fetchReview('4')).resolves.toBe(review)
    expect(apiFetch).toHaveBeenCalledWith('/interview-sessions/4/review')
  })

  it('lets a missing session (404) propagate', async () => {
    const missing = Object.assign(new Error('nf'), { status: 404 })
    apiFetch.mockRejectedValue(missing)

    await expect(useSessionReview().fetchReview(4)).rejects.toBe(missing)
  })
})
