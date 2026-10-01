/**
 * useReusableLinks.ts (reusable-interview-links, B6a)
 *
 * Thin composable wiring over useApi().apiFetch, mirroring useEntryLinks.spec.ts.
 * This slice owns the create call only; list and disable arrive with the links
 * panel in the next slice.
 *
 * What the composable must NOT do is as load-bearing as what it does: the
 * create response carries the one and only copy of the link, so the composable
 * returns it to the caller and keeps nothing.
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
})
