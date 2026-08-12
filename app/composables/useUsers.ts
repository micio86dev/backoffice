/**
 * useUsers — typed reads/writes over the D4 admin-only user-management
 * endpoints. Deactivate/activate are explicit POST verbs, never a DELETE
 * (D5). Thin wiring over `useApi().apiFetch`, mirroring
 * `useParticipants.ts:16-30`.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type UserListResponse =
  paths['/users']['get']['responses']['200']['content']['application/json']

export type UserResponse =
  paths['/users']['post']['responses']['201']['content']['application/json']

export type CreateUserPayload =
  paths['/users']['post']['requestBody']['content']['application/json']

export type UpdateUserPayload = Partial<CreateUserPayload>

export function useUsers() {
  const { apiFetch } = useApi()

  async function listUsers(): Promise<UserListResponse> {
    return apiFetch<UserListResponse>('/users')
  }

  async function createUser(payload: CreateUserPayload): Promise<UserResponse> {
    return apiFetch<UserResponse>('/users', { method: 'POST', body: payload })
  }

  async function updateUser(
    id: number | string,
    payload: UpdateUserPayload
  ): Promise<UserResponse> {
    return apiFetch<UserResponse>(`/users/${id}`, { method: 'PATCH', body: payload })
  }

  async function deactivateUser(id: number | string): Promise<void> {
    await apiFetch<null>(`/users/${id}/deactivate`, { method: 'POST' })
  }

  async function activateUser(id: number | string): Promise<void> {
    await apiFetch<null>(`/users/${id}/activate`, { method: 'POST' })
  }

  return { listUsers, createUser, updateUser, deactivateUser, activateUser }
}
