/**
 * usePlatformSettings — the wire between the screens and the API. Thin by design, so what is
 * worth asserting is the SHAPE of each call (verb, path, body) and that a
 * failure propagates untouched: a wrong verb or path fails only at runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { usePlatformSettings } = await import('../../../app/composables/usePlatformSettings')

describe('usePlatformSettings', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('reads the platform settings', async () => {
    await usePlatformSettings().fetchPlatformSettings()

    expect(apiFetch).toHaveBeenCalledWith('/admin/settings')
  })

  it('PATCHes only the caps it is given, nested under max_questions_per_competency', async () => {
    await usePlatformSettings().updatePlatformSettings({ standard: 3 } as never)

    expect(apiFetch).toHaveBeenCalledWith('/admin/settings', {
      method: 'PATCH',
      body: { max_questions_per_competency: { standard: 3 } },
    })
  })

  it('returns the full merged map the server answers with', async () => {
    const merged = { data: { max_questions_per_competency: { standard: 3, potential: 4 } } }
    apiFetch.mockResolvedValue(merged)

    await expect(
      usePlatformSettings().updatePlatformSettings({ standard: 3 } as never)
    ).resolves.toBe(merged)
  })

  it('PATCHes only interview_intro_phrase when saving the intro, never the caps', async () => {
    await usePlatformSettings().updateInterviewIntroPhrase({ en: 'Hello', it: 'Ciao' })

    expect(apiFetch).toHaveBeenCalledWith('/admin/settings', {
      method: 'PATCH',
      body: { interview_intro_phrase: { en: 'Hello', it: 'Ciao' } },
    })
  })

  it('sends an explicit null to clear the intro', async () => {
    await usePlatformSettings().updateInterviewIntroPhrase(null)

    expect(apiFetch).toHaveBeenCalledWith('/admin/settings', {
      method: 'PATCH',
      body: { interview_intro_phrase: null },
    })
  })

  it('PATCHes only interview_closing_phrase when saving the closing greeting', async () => {
    await usePlatformSettings().updateInterviewClosingPhrase({ en: 'Thanks', it: 'Grazie' })

    expect(apiFetch).toHaveBeenCalledWith('/admin/settings', {
      method: 'PATCH',
      body: { interview_closing_phrase: { en: 'Thanks', it: 'Grazie' } },
    })
  })

  it('sends an explicit null to clear the closing greeting', async () => {
    await usePlatformSettings().updateInterviewClosingPhrase(null)

    expect(apiFetch).toHaveBeenCalledWith('/admin/settings', {
      method: 'PATCH',
      body: { interview_closing_phrase: null },
    })
  })

  it('lets a refusal (403/422) propagate to the caller', async () => {
    const refusal = Object.assign(new Error('forbidden'), { status: 403 })
    apiFetch.mockRejectedValue(refusal)

    await expect(usePlatformSettings().fetchPlatformSettings()).rejects.toBe(refusal)
  })
})
