/**
 * useProfile.ts (user-profile-self-service, design D1) — typed reads/writes
 * over the self-resolving singular `/api/profile` and `/api/profile/password`
 * resources. Thin wiring over `useApi().apiFetch`, mirroring
 * `useOrganization.spec.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useProfile } = await import('../../../app/composables/useProfile')

describe('useProfile', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: {} })
  })

  it('reads the self-resolving singular resource — no id in the path', async () => {
    await useProfile().fetchProfile()

    expect(apiFetch).toHaveBeenCalledWith('/profile')
  })

  it('updates with PATCH', async () => {
    await useProfile().updateProfile({ name: 'New Name', email: 'new@example.test', locale: 'it' })

    expect(apiFetch).toHaveBeenCalledWith('/profile', {
      method: 'PATCH',
      body: { name: 'New Name', email: 'new@example.test', locale: 'it' },
    })
  })

  it('changes the password with PUT — no id in the path, ever', async () => {
    apiFetch.mockResolvedValue({ access_token: 'new-token', token_type: 'bearer' })

    const result = await useProfile().updatePassword({
      current_password: 'old-pass',
      password: 'new-pass-123',
      password_confirmation: 'new-pass-123',
    })

    expect(apiFetch).toHaveBeenCalledWith('/profile/password', {
      method: 'PUT',
      body: {
        current_password: 'old-pass',
        password: 'new-pass-123',
        password_confirmation: 'new-pass-123',
      },
    })
    expect(result).toEqual({ access_token: 'new-token', token_type: 'bearer' })
  })
})
