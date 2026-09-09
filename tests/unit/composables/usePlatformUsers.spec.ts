/**
 * usePlatformUsers — the wire contract for BEAI's own people.
 *
 * Every other composable in this app has one of these, and for a reason the
 * component specs cannot cover: they mock this module wholesale, so nothing
 * would otherwise execute the real function. A typo'd path here would ship
 * green.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({ useApi: () => ({ apiFetch }) }))

const { usePlatformUsers } = await import('../../../app/composables/usePlatformUsers')

describe('usePlatformUsers', () => {
  beforeEach(() => {
    apiFetch.mockReset().mockResolvedValue({ data: [] })
  })

  it('lists from the platform surface, never the org one', async () => {
    await usePlatformUsers().listPlatformUsers()

    expect(apiFetch).toHaveBeenCalledWith('/admin/platform-users')
  })

  it('creates with the payload it was handed', async () => {
    const payload = { name: 'Ada', email: 'ada@beai.test', password: 'a-strong-password-123' }

    await usePlatformUsers().createPlatformUser(payload)

    expect(apiFetch).toHaveBeenCalledWith('/admin/platform-users', {
      method: 'POST',
      body: payload,
    })
  })

  it('updates by id', async () => {
    await usePlatformUsers().updatePlatformUser(7, { name: 'Ada Byron' })

    expect(apiFetch).toHaveBeenCalledWith('/admin/platform-users/7', {
      method: 'PATCH',
      body: { name: 'Ada Byron' },
    })
  })

  it('deactivates and activates through explicit POST verbs, never a DELETE', async () => {
    // A DELETE that does not delete would lie about what it does — the same
    // reason the org surface uses these verbs.
    await usePlatformUsers().deactivatePlatformUser(7)
    expect(apiFetch).toHaveBeenCalledWith('/admin/platform-users/7/deactivate', { method: 'POST' })

    await usePlatformUsers().activatePlatformUser(7)
    expect(apiFetch).toHaveBeenCalledWith('/admin/platform-users/7/activate', { method: 'POST' })
  })
})
