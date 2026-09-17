/**
 * useFrameworkVersions — the wire between the project form's framework-version
 * picker and the API (C4).
 *
 * Thin by design, so what is worth asserting is the SHAPE of the call: a
 * wrong path fails at runtime in a way no type check catches, and the only
 * symptom is a picker that quietly stays empty.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useFrameworkVersions } = await import('../../../app/composables/useFrameworkVersions')

describe('useFrameworkVersions', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the framework versions endpoint', async () => {
    await useFrameworkVersions().listVersions()

    expect(apiFetch).toHaveBeenCalledWith('/framework/versions')
  })

  it('returns whatever the API responds with, unmodified', async () => {
    const payload = {
      data: [
        {
          id: 1,
          organization_id: 7,
          version: 'v1.0',
          label: 'Initial',
          is_locked: false,
          created_at: null,
          updated_at: null,
        },
      ],
    }
    apiFetch.mockResolvedValue(payload)

    await expect(useFrameworkVersions().listVersions()).resolves.toBe(payload)
  })
})
