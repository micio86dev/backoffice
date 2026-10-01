/**
 * useReusableLinks.ts (reusable-interview-links, B6a)
 *
 * Thin composable wiring over useApi().apiFetch, mirroring useEntryLinks.spec.ts.
 * Create shipped with the invite drawer (B6a); list and disable ship with the
 * links panel (B6b).
 *
 * What the composable must NOT do is as load-bearing as what it does: the
 * create response carries the one and only copy of the link, so the composable
 * returns it to the caller and keeps nothing. List and disable keep nothing
 * either: the panel owns the rows, and a refetch is the only way a row changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ENTRY_URL = 'https://interview.example.test/it/interview/reusable#beai_rl_SECRET'

function createResponse() {
  return {
    data: {
      id: 'rlk_01HZ0000000000000000000000',
      label: 'Milan fair stand',
      token_prefix: 'beai_rl_AbCdEfGh',
      lang: 'it',
      status: 'active',
      uses_count: 0,
      last_used_at: null,
      created_by: { name: 'Ada Admin' },
      created_at: '2026-10-01T10:00:00.000000Z',
      disabled_at: null,
    },
    entry_url: ENTRY_URL,
  }
}

describe('useReusableLinks', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('createReusableLink(projectId, payload) POSTs /projects/{id}/reusable-links with the exact payload', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(createResponse())
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
    const { createReusableLink } = useReusableLinks()

    const payload = { label: 'Milan fair stand' }
    await createReusableLink(42, payload)

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(apiFetchMock).toHaveBeenCalledWith('/projects/42/reusable-links', {
      method: 'POST',
      body: payload,
    })
  })

  it('sends an empty payload as an empty object, not as { label: null }', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(createResponse())
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
    const { createReusableLink } = useReusableLinks()

    await createReusableLink(7, {})

    expect(apiFetchMock).toHaveBeenCalledWith('/projects/7/reusable-links', {
      method: 'POST',
      body: {},
    })
  })

  it('returns the create result to the caller untouched', async () => {
    const response = createResponse()
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: vi.fn().mockResolvedValue(response) }),
    }))

    const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
    const { createReusableLink } = useReusableLinks()

    await expect(createReusableLink(1, {})).resolves.toEqual(response)
  })

  it('lets a failure reach the caller with its 422 shape intact', async () => {
    const failure = Object.assign(new Error('Unprocessable'), {
      status: 422,
      data: { message: 'invalid', errors: { label: ['The label is too long.'] } },
    })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: vi.fn().mockRejectedValue(failure) }),
    }))

    const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
    const { createReusableLink } = useReusableLinks()

    // The same object, so `applyServerFieldErrors` can read `data.errors`.
    await expect(createReusableLink(1, { label: 'x' })).rejects.toBe(failure)
  })

  it('keeps no copy of the link: a second composable instance holds nothing', async () => {
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: vi.fn().mockResolvedValue(createResponse()) }),
    }))

    const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
    const first = useReusableLinks()

    await first.createReusableLink(1, {})

    // Only functions are exposed: no ref, no cache, no `last` result to read
    // the token back from.
    const exposed = Object.values(useReusableLinks())

    expect(exposed.every((value) => typeof value === 'function')).toBe(true)
    expect(JSON.stringify(Object.keys(first))).not.toMatch(/last|cache|url|token/i)
  })

  describe('listReusableLinks', () => {
    it('GETs /projects/{id}/reusable-links and returns the list untouched', async () => {
      const listing = { data: [createResponse().data] }
      const apiFetchMock = vi.fn().mockResolvedValue(listing)
      vi.doMock('../../../app/composables/useApi', () => ({
        useApi: () => ({ apiFetch: apiFetchMock }),
      }))

      const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
      const { listReusableLinks } = useReusableLinks()

      await expect(listReusableLinks(42)).resolves.toBe(listing)
      expect(apiFetchMock).toHaveBeenCalledTimes(1)
      // No options at all: a GET is the default, and nothing here may add a body.
      expect(apiFetchMock).toHaveBeenCalledWith('/projects/42/reusable-links')
    })

    it('scopes the request to the project it was asked about', async () => {
      const apiFetchMock = vi.fn().mockResolvedValue({ data: [] })
      vi.doMock('../../../app/composables/useApi', () => ({
        useApi: () => ({ apiFetch: apiFetchMock }),
      }))

      const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
      const { listReusableLinks } = useReusableLinks()

      await listReusableLinks(7)

      expect(apiFetchMock).toHaveBeenCalledWith('/projects/7/reusable-links')
    })

    it('lets a failure reach the caller as the same object', async () => {
      const failure = Object.assign(new Error('Forbidden'), { status: 403 })
      vi.doMock('../../../app/composables/useApi', () => ({
        useApi: () => ({ apiFetch: vi.fn().mockRejectedValue(failure) }),
      }))

      const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
      const { listReusableLinks } = useReusableLinks()

      // The caller maps the status (403 vs 404 vs the rest) through the shared
      // error-state helper, so the object must arrive unwrapped.
      await expect(listReusableLinks(1)).rejects.toBe(failure)
    })
  })

  describe('disableReusableLink', () => {
    it('DELETEs /projects/{id}/reusable-links/{link} and resolves to nothing', async () => {
      const apiFetchMock = vi.fn().mockResolvedValue(undefined)
      vi.doMock('../../../app/composables/useApi', () => ({
        useApi: () => ({ apiFetch: apiFetchMock }),
      }))

      const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
      const { disableReusableLink } = useReusableLinks()

      await expect(
        disableReusableLink(42, 'rlk_01HZ0000000000000000000000')
      ).resolves.toBeUndefined()
      expect(apiFetchMock).toHaveBeenCalledTimes(1)
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/projects/42/reusable-links/rlk_01HZ0000000000000000000000',
        { method: 'DELETE' }
      )
    })

    it('addresses the link it was given, not a fixed one', async () => {
      const apiFetchMock = vi.fn().mockResolvedValue(undefined)
      vi.doMock('../../../app/composables/useApi', () => ({
        useApi: () => ({ apiFetch: apiFetchMock }),
      }))

      const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
      const { disableReusableLink } = useReusableLinks()

      await disableReusableLink(9, 'rlk_01HZ9999999999999999999999')

      expect(apiFetchMock).toHaveBeenCalledWith(
        '/projects/9/reusable-links/rlk_01HZ9999999999999999999999',
        { method: 'DELETE' }
      )
    })

    it('lets a failure reach the caller as the same object', async () => {
      const failure = Object.assign(new Error('Not found'), { status: 404 })
      vi.doMock('../../../app/composables/useApi', () => ({
        useApi: () => ({ apiFetch: vi.fn().mockRejectedValue(failure) }),
      }))

      const { useReusableLinks } = await import('../../../app/composables/useReusableLinks')
      const { disableReusableLink } = useReusableLinks()

      await expect(disableReusableLink(1, 'rlk_x')).rejects.toBe(failure)
    })
  })
})
