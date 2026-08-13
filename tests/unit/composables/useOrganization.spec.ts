/**
 * useOrganization (Unit 6, task 23.2/24.1 support) — typed reads/writes over
 * `GET/PATCH /api/organization` (D2/D3). Thin wiring over
 * `useApi().apiFetch`, mirroring `useParticipants.ts:16-30`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useOrganization } = await import('../../../app/composables/useOrganization')

describe('useOrganization', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: {} })
  })

  it('reads the self-resolving singular resource — no id in the path', async () => {
    await useOrganization().fetchOrganization()

    expect(apiFetch).toHaveBeenCalledWith('/organization')
  })

  it('updates with PATCH', async () => {
    await useOrganization().updateOrganization({ name: 'New Name' })

    expect(apiFetch).toHaveBeenCalledWith('/organization', {
      method: 'PATCH',
      body: { name: 'New Name' },
    })
  })
})
