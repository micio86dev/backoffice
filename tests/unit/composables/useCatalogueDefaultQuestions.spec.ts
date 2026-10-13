/**
 * useCatalogueDefaultQuestions — the wire between the screens and the API. Thin by design, so what is
 * worth asserting is the SHAPE of each call (verb, path, body) and that a
 * failure propagates untouched: a wrong verb or path fails only at runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useCatalogueDefaultQuestions } =
  await import('../../../app/composables/useCatalogueDefaultQuestions')

describe('useCatalogueDefaultQuestions', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the collection endpoint', async () => {
    await useCatalogueDefaultQuestions().fetchDefaultQuestions()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/default-questions')
  })

  it('creates with POST carrying the bilingual text and position', async () => {
    const payload = { competency_id: 3, position: 2, text: { en: 'Tell me', it: 'Raccontami' } }

    await useCatalogueDefaultQuestions().createDefaultQuestion(payload as never)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/default-questions', {
      method: 'POST',
      body: payload,
    })
  })

  it('updates one row with PATCH on its own id', async () => {
    await useCatalogueDefaultQuestions().updateDefaultQuestion(9, { position: 4 } as never)

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/default-questions/9', {
      method: 'PATCH',
      body: { position: 4 },
    })
  })

  it('deletes with DELETE and resolves to undefined', async () => {
    await expect(useCatalogueDefaultQuestions().deleteDefaultQuestion(9)).resolves.toBeUndefined()

    expect(apiFetch).toHaveBeenCalledWith('/catalogue/default-questions/9', { method: 'DELETE' })
  })

  it('lets an API failure propagate', async () => {
    const failure = new Error('boom')
    apiFetch.mockRejectedValue(failure)

    await expect(useCatalogueDefaultQuestions().createDefaultQuestion({} as never)).rejects.toBe(
      failure
    )
  })
})
