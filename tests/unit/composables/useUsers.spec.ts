/**
 * useUsers (Unit 6, task 23.2/24.5 support) — typed reads/writes over the
 * D4 admin-only user-management endpoints. Thin wiring over
 * `useApi().apiFetch`, mirroring `useParticipants.ts:16-30`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useUsers } = await import('../../../app/composables/useUsers')

describe('useUsers', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the collection endpoint', async () => {
    await useUsers().listUsers()

    expect(apiFetch).toHaveBeenCalledWith('/users')
  })

  it('creates with POST', async () => {
    await useUsers().createUser({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'password123',
      role: 'operator',
    })

    expect(apiFetch).toHaveBeenCalledWith('/users', {
      method: 'POST',
      body: { name: 'Ada', email: 'ada@example.com', password: 'password123', role: 'operator' },
    })
  })

  it('updates with PATCH', async () => {
    await useUsers().updateUser(7, { role: 'admin' })

    expect(apiFetch).toHaveBeenCalledWith('/users/7', { method: 'PATCH', body: { role: 'admin' } })
  })

  it('deactivates through its own POST endpoint, never a DELETE', async () => {
    await useUsers().deactivateUser(7)

    expect(apiFetch).toHaveBeenCalledWith('/users/7/deactivate', { method: 'POST' })
  })

  it('activates through its own POST endpoint', async () => {
    await useUsers().activateUser(7)

    expect(apiFetch).toHaveBeenCalledWith('/users/7/activate', { method: 'POST' })
  })
})
