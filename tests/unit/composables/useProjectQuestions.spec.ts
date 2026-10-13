/**
 * useProjectQuestions — the wire between the screens and the API. Thin by design, so what is
 * worth asserting is the SHAPE of each call (verb, path, body) and that a
 * failure propagates untouched: a wrong verb or path fails only at runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useProjectQuestions } = await import('../../../app/composables/useProjectQuestions')

describe('useProjectQuestions', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists the questions of one project', async () => {
    await useProjectQuestions().fetchQuestions(5)

    expect(apiFetch).toHaveBeenCalledWith('/projects/5/questions')
  })

  it('creates with POST, keeping the locale map as authored', async () => {
    const payload = { competency_id: 2, text: { en: 'Hello', it: null } }

    await useProjectQuestions().createQuestion(5, payload)

    expect(apiFetch).toHaveBeenCalledWith('/projects/5/questions', {
      method: 'POST',
      body: payload,
    })
  })

  it('updates only the text with PATCH on the question id', async () => {
    await useProjectQuestions().updateQuestion(5, 8, { en: 'Edited' })

    expect(apiFetch).toHaveBeenCalledWith('/projects/5/questions/8', {
      method: 'PATCH',
      body: { text: { en: 'Edited' } },
    })
  })

  it('deletes with DELETE', async () => {
    await expect(useProjectQuestions().deleteQuestion(5, 8)).resolves.toBeUndefined()

    expect(apiFetch).toHaveBeenCalledWith('/projects/5/questions/8', { method: 'DELETE' })
  })

  it('reorders by sending the WHOLE ordered id list in one PUT', async () => {
    await useProjectQuestions().reorderQuestions(5, [3, 1, 2])

    expect(apiFetch).toHaveBeenCalledWith('/projects/5/questions/order', {
      method: 'PUT',
      body: { ids: [3, 1, 2] },
    })
  })

  it('lets a failed reorder reject so the caller keeps the previous order', async () => {
    const failure = new Error('conflict')
    apiFetch.mockRejectedValue(failure)

    await expect(useProjectQuestions().reorderQuestions(5, [1])).rejects.toBe(failure)
  })
})
