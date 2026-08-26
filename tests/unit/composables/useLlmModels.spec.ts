/**
 * useLlmModels (pluggable-conversation-llm PR P8, task P8.9 — RED).
 *
 * Thin wiring over `useApi().apiFetch`, mirroring `useLlmCredentials.spec.ts`:
 * `GET /llm-models` is a read-only, global price list (design D9) — one call,
 * no state, no caching.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useLlmModels } = await import('../../../app/composables/useLlmModels')

describe('useLlmModels', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the /llm-models endpoint', async () => {
    await useLlmModels().listModels()

    expect(apiFetch).toHaveBeenCalledWith('/llm-models')
  })

  it('returns whatever the endpoint answers, unmodified', async () => {
    const payload = { data: [{ key: 'gemini-3-flash-preview' }] }
    apiFetch.mockResolvedValue(payload)

    await expect(useLlmModels().listModels()).resolves.toEqual(payload)
  })
})
