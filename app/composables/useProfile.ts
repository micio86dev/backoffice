/**
 * useProfile — typed reads/writes over the self-resolving singular
 * `/api/profile` and `/api/profile/password` resources (user-profile-
 * self-service, design D1). No id ever appears in any path. Thin wiring
 * over `useApi().apiFetch`, mirroring `useOrganization.ts`.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type ProfileResponse =
  paths['/profile']['get']['responses']['200']['content']['application/json']

export type UpdateProfilePayload = NonNullable<
  paths['/profile']['patch']['requestBody']
>['content']['application/json']

export type UpdatePasswordPayload =
  paths['/profile/password']['put']['requestBody']['content']['application/json']

export type UpdatePasswordResponse =
  paths['/profile/password']['put']['responses']['200']['content']['application/json']

export function useProfile() {
  const { apiFetch } = useApi()

  async function fetchProfile(): Promise<ProfileResponse> {
    return apiFetch<ProfileResponse>('/profile')
  }

  async function updateProfile(payload: UpdateProfilePayload): Promise<ProfileResponse> {
    return apiFetch<ProfileResponse>('/profile', { method: 'PATCH', body: payload })
  }

  async function updatePassword(payload: UpdatePasswordPayload): Promise<UpdatePasswordResponse> {
    return apiFetch<UpdatePasswordResponse>('/profile/password', { method: 'PUT', body: payload })
  }

  return { fetchProfile, updateProfile, updatePassword }
}
