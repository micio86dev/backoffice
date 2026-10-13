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

  // OC-06: `useMoney` reads the display currency from here, so the layout's
  // one read (and a Settings save) is what every cost surface follows.
  describe('currencyCode', () => {
    it('follows a read, and reads null for no acting organization', async () => {
      const api = useOrganization()

      apiFetch.mockResolvedValueOnce({ data: { currency_code: 'EUR' } })
      await api.fetchOrganization()
      expect(api.currencyCode.value).toBe('EUR')

      apiFetch.mockResolvedValueOnce({ data: null })
      await api.fetchOrganization()
      expect(api.currencyCode.value).toBeNull()
    })

    it('follows a successful save', async () => {
      apiFetch.mockResolvedValueOnce({ data: { currency_code: 'USD' } })
      const api = useOrganization()

      await api.updateOrganization({ currency_code: 'USD' })

      expect(api.currencyCode.value).toBe('USD')
    })
  })

  it('uploads the logo as multipart FormData under the "logo" field, with no explicit Content-Type', async () => {
    const file = new File(['x'], 'logo.png', { type: 'image/png' })

    await useOrganization().uploadLogo(file)

    const [path, options] = apiFetch.mock.calls[0]!
    expect(path).toBe('/organization/logo')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect((options.body as FormData).get('logo')).toBe(file)
    expect(options.headers).toBeUndefined()
  })

  it('removes the logo with DELETE', async () => {
    await useOrganization().removeLogo()

    expect(apiFetch).toHaveBeenCalledWith('/organization/logo', { method: 'DELETE' })
  })

  it('keeps the previous currency when a save answers without one', async () => {
    const api = useOrganization()
    apiFetch.mockResolvedValueOnce({ data: { currency_code: 'EUR' } })
    await api.fetchOrganization()

    apiFetch.mockResolvedValueOnce({ data: {} })
    await api.updateOrganization({ name: 'Renamed' })

    expect(api.currencyCode.value).toBe('EUR')
  })
})
