/**
 * useLlmCredentials (pluggable-conversation-llm PR P7, task P7.1 — RED).
 *
 * Thin wiring over `useApi().apiFetch`, mirroring `useAvatarTemplates.spec.ts`:
 * what is worth asserting is the SHAPE of each call — a wrong verb or path
 * fails at runtime, and the only symptom is a screen that quietly does
 * nothing. There is deliberately no "verify" call of its own (design D9 — no
 * validate-without-storing endpoint exists): validation happens INLINE on
 * `create`/`rotate`, so those two calls are what this suite proves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useLlmCredentials } = await import('../../../app/composables/useLlmCredentials')

describe('useLlmCredentials', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the collection endpoint', async () => {
    await useLlmCredentials().listCredentials()

    expect(apiFetch).toHaveBeenCalledWith('/llm-credentials')
  })

  it('creates with POST, sending name/vendor/api_key', async () => {
    await useLlmCredentials().createCredential({
      name: 'Prod Gemini key',
      vendor: 'google',
      api_key: 'secret-value',
    })

    expect(apiFetch).toHaveBeenCalledWith('/llm-credentials', {
      method: 'POST',
      body: { name: 'Prod Gemini key', vendor: 'google', api_key: 'secret-value' },
    })
  })

  it('rotates with PATCH against the credential id, never a dedicated verb', async () => {
    await useLlmCredentials().rotateCredential(7, { api_key: 'new-secret' })

    const [path, options] = apiFetch.mock.calls[0] as [string, { method: string; body: object }]

    expect(path).toBe('/llm-credentials/7')
    expect(options.method).toBe('PATCH')
    expect(options.body).toEqual({ api_key: 'new-secret' })
  })

  it('deletes with DELETE', async () => {
    await useLlmCredentials().deleteCredential(4)

    expect(apiFetch).toHaveBeenCalledWith('/llm-credentials/4', { method: 'DELETE' })
  })

  it('lets an API failure propagate (a 409 credential_in_use on delete is not swallowed here)', async () => {
    apiFetch.mockRejectedValue(
      Object.assign(new Error('409'), {
        status: 409,
        data: { error: 'credential_in_use', message: 'in use', templates: ['A', 'B'] },
      })
    )

    // Swallowed here, the caller could not tell a refusal from an empty
    // result — the panel is responsible for resolving the 409 into a
    // readable message (P7.5/P7.6).
    await expect(useLlmCredentials().deleteCredential(1)).rejects.toThrow()
  })
})
