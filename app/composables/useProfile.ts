/**
 * useProfile — typed reads/writes over the self-resolving singular
 * `/api/profile` and `/api/profile/password` resources (user-profile-
 * self-service, design D1). No id ever appears in any path. Thin wiring
 * over `useApi().apiFetch`, mirroring `useOrganization.ts`.
 *
 * `uploadPhoto`/`deletePhoto` (user-avatar-image, design D6): the same
 * `/profile/photo` sub-resource, `POST`/`DELETE`, no id, ever.
 * `useApi.ts` needs NO change — `apiFetch` forwards `options.body`
 * untouched, and ofetch does not JSON-serialise a `FormData` body nor set
 * `Content-Type` for it (the browser sets the multipart boundary itself).
 * Verified, not merely assumed: the E2E case in Phase 9 is what actually
 * catches it if that ofetch behaviour ever changed — if it silently
 * started coercing the body to `[object FormData]`, that test's mocked
 * upload would fail to see a real file.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'
import { toSameOriginImageUrl } from '../utils/image-url'

export type ProfileResponse =
  paths['/profile']['get']['responses']['200']['content']['application/json']

export type UpdateProfilePayload = NonNullable<
  paths['/profile']['patch']['requestBody']
>['content']['application/json']

export type UpdatePasswordPayload =
  paths['/profile/password']['put']['requestBody']['content']['application/json']

export type UpdatePasswordResponse =
  paths['/profile/password']['put']['responses']['200']['content']['application/json']

export type ProfilePhotoResponse =
  paths['/profile/photo']['post']['responses']['200']['content']['application/json']

/**
 * The API builds `photo_url` from APP_URL — an http cross-origin URL in local
 * docker, which the backoffice CSP (`img-src`) blocks. Normalised once here so
 * every consumer (profile page, photo form) receives a same-origin path.
 */
function withSameOriginPhoto<T extends { data: { photo_url?: string | null } }>(response: T): T {
  const url = response?.data?.photo_url
  if (typeof url !== 'string') return response

  return { ...response, data: { ...response.data, photo_url: toSameOriginImageUrl(url) } }
}

export function useProfile() {
  const { apiFetch } = useApi()

  async function fetchProfile(): Promise<ProfileResponse> {
    return withSameOriginPhoto(await apiFetch<ProfileResponse>('/profile'))
  }

  async function updateProfile(payload: UpdateProfilePayload): Promise<ProfileResponse> {
    return withSameOriginPhoto(
      await apiFetch<ProfileResponse>('/profile', { method: 'PATCH', body: payload })
    )
  }

  async function updatePassword(payload: UpdatePasswordPayload): Promise<UpdatePasswordResponse> {
    return apiFetch<UpdatePasswordResponse>('/profile/password', { method: 'PUT', body: payload })
  }

  async function uploadPhoto(file: File): Promise<ProfilePhotoResponse> {
    const formData = new FormData()
    formData.set('photo', file)
    return withSameOriginPhoto(
      await apiFetch<ProfilePhotoResponse>('/profile/photo', { method: 'POST', body: formData })
    )
  }

  async function deletePhoto(): Promise<ProfilePhotoResponse> {
    return withSameOriginPhoto(
      await apiFetch<ProfilePhotoResponse>('/profile/photo', { method: 'DELETE' })
    )
  }

  return { fetchProfile, updateProfile, updatePassword, uploadPhoto, deletePhoto }
}
