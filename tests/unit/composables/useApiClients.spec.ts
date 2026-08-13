/**
 * useApiClients (Unit 6, task 23.2/24.3 support) — typed reads/writes over
 * the existing C5 `/m2m/clients` endpoints. Thin wiring over
 * `useApi().apiFetch`, mirroring `useParticipants.ts:16-30`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useApiClients } = await import('../../../app/composables/useApiClients')

describe('useApiClients', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the collection endpoint', async () => {
    await useApiClients().listClients()

    expect(apiFetch).toHaveBeenCalledWith('/m2m/clients')
  })

  it('creates with POST and returns the raw key alongside the resource', async () => {
    apiFetch.mockResolvedValue({ data: { id: '1' }, api_key: 'beai_live_abc' })

    const result = await useApiClients().createClient({ name: 'CI key', abilities: ['read'] })

    expect(apiFetch).toHaveBeenCalledWith('/m2m/clients', {
      method: 'POST',
      body: { name: 'CI key', abilities: ['read'] },
    })
    expect(result.api_key).toBe('beai_live_abc')
  })

  it('revokes with DELETE', async () => {
    await useApiClients().revokeClient(4)

    expect(apiFetch).toHaveBeenCalledWith('/m2m/clients/4', { method: 'DELETE' })
  })
})
