/**
 * usePlatformUsers — typed reads/writes over `/admin/platform-users`, BEAI's
 * own people (platform-user-management D1).
 *
 * The all-clients counterpart of `useUsers`. Same five verbs, a different
 * population, and no `role`: `is_superadmin` is the only platform identity
 * the system has, so there is nothing to pick between.
 *
 * A SEPARATE composable rather than a flag on `useUsers`, because the two call
 * different endpoints against different populations — the shared thing is the
 * FORM and the PANEL, which take a `variant` and choose between these two.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type PlatformUserListResponse =
  paths['/admin/platform-users']['get']['responses']['200']['content']['application/json']

export type PlatformUserResponse =
  paths['/admin/platform-users']['post']['responses']['201']['content']['application/json']

export type CreatePlatformUserPayload =
  paths['/admin/platform-users']['post']['requestBody']['content']['application/json']

/**
 * Read from the PATCH request body the spec publishes, not derived from the
 * create payload. They are structurally identical today, and a derivation is
 * an assumption the codegen could contradict silently.
 */
export type UpdatePlatformUserPayload = NonNullable<
  paths['/admin/platform-users/{id}']['patch']['requestBody']
>['content']['application/json']

export function usePlatformUsers() {
  const { apiFetch } = useApi()

  async function listPlatformUsers(): Promise<PlatformUserListResponse> {
    return apiFetch<PlatformUserListResponse>('/admin/platform-users')
  }

  async function createPlatformUser(
    payload: CreatePlatformUserPayload
  ): Promise<PlatformUserResponse> {
    return apiFetch<PlatformUserResponse>('/admin/platform-users', {
      method: 'POST',
      body: payload,
    })
  }

  async function updatePlatformUser(
    id: number | string,
    payload: UpdatePlatformUserPayload
  ): Promise<PlatformUserResponse> {
    return apiFetch<PlatformUserResponse>(`/admin/platform-users/${id}`, {
      method: 'PATCH',
      body: payload,
    })
  }

  async function deactivatePlatformUser(id: number | string): Promise<void> {
    await apiFetch<null>(`/admin/platform-users/${id}/deactivate`, { method: 'POST' })
  }

  async function activatePlatformUser(id: number | string): Promise<void> {
    await apiFetch<null>(`/admin/platform-users/${id}/activate`, { method: 'POST' })
  }

  return {
    listPlatformUsers,
    createPlatformUser,
    updatePlatformUser,
    deactivatePlatformUser,
    activatePlatformUser,
  }
}
