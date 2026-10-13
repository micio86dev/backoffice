/**
 * useParticipantRecovery — the wire between the screens and the API. Thin by design, so what is
 * worth asserting is the SHAPE of each call (verb, path, body) and that a
 * failure propagates untouched: a wrong verb or path fails only at runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useParticipantRecovery } = await import('../../../app/composables/useParticipantRecovery')

describe('useParticipantRecovery', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('POSTs an empty body by default', async () => {
    await useParticipantRecovery().recoverParticipant(12)

    expect(apiFetch).toHaveBeenCalledWith('/participants/12/recover', {
      method: 'POST',
      body: {},
    })
  })

  it('forwards the given payload to the participant path', async () => {
    await useParticipantRecovery().recoverParticipant('abc', { note: 'x' } as never)

    expect(apiFetch).toHaveBeenCalledWith('/participants/abc/recover', {
      method: 'POST',
      body: { note: 'x' },
    })
  })

  it('surfaces a 409 refusal with its machine reason for the caller to map', async () => {
    const refusal = Object.assign(new Error('conflict'), {
      status: 409,
      data: { reason: 'still_live' },
    })
    apiFetch.mockRejectedValue(refusal)

    await expect(useParticipantRecovery().recoverParticipant(12)).rejects.toMatchObject({
      status: 409,
      data: { reason: 'still_live' },
    })
  })
})
