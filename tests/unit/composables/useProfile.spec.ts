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

  it.each([
    [
      'http cross-origin -> same-origin path',
      'http://localhost:8000/api/profile/photo?v=a.png',
      '/api/profile/photo?v=a.png',
    ],
    ['https unchanged', 'https://api.example.com/p.png?v=1', 'https://api.example.com/p.png?v=1'],
    ['blob unchanged', 'blob:http://localhost:3001/uuid', 'blob:http://localhost:3001/uuid'],
    ['null stays null', null, null],
  ])('normalises photo_url on the profile read: %s', async (_n, input, expected) => {
    apiFetch.mockResolvedValue({ data: { name: 'Ada', photo_url: input } })

    const result = await useProfile().fetchProfile()

    expect(result.data.photo_url).toBe(expected)
    expect(result.data.name).toBe('Ada')
  })

  it('normalises photo_url on profile update and photo upload/delete responses', async () => {
    const raw = 'http://localhost:8000/api/profile/photo?v=b.png'
    apiFetch.mockResolvedValue({ data: { photo_url: raw } })

    const u = await useProfile().updateProfile({ name: 'n', email: 'e@x.test', locale: 'it' })
    const up = await useProfile().uploadPhoto(new File(['x'], 'p.png', { type: 'image/png' }))
    const del = await useProfile().deletePhoto()

    for (const r of [u, up, del]) expect(r.data.photo_url).toBe('/api/profile/photo?v=b.png')
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

  // user-avatar-image (design D6): apiFetch forwards options.body untouched
  // and ofetch does not JSON-serialise a FormData body — so uploadPhoto
  // builds and sends a real FormData, never a JSON object, with no useApi.ts
  // change required. The E2E case in Phase 9 is what verifies ofetch itself
  // never coerces it; this test only proves useProfile builds it correctly.
  it('uploads a photo as multipart FormData under the "photo" field — POST, no id', async () => {
    apiFetch.mockResolvedValue({ data: { photo_url: 'https://example.test/signed.jpg' } })
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })

    await useProfile().uploadPhoto(file)

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const [path, options] = apiFetch.mock.calls[0] as [string, { method: string; body: FormData }]
    expect(path).toBe('/profile/photo')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('photo')).toBe(file)
  })

  it('removes the photo with DELETE — no id in the path, ever', async () => {
    apiFetch.mockResolvedValue({ data: { photo_url: null } })

    await useProfile().deletePhoto()

    expect(apiFetch).toHaveBeenCalledWith('/profile/photo', { method: 'DELETE' })
  })
})
