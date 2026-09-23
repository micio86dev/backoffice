/**
 * useEntryLinks.ts (operator-interview-link)
 *
 * Thin composable wiring over useApi().apiFetch — mirrors
 * useParticipants.spec.ts's pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useEntryLinks', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('generateEntryLink(payload) POSTs /entry-links with the given body', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEntryLinks } = await import('../../../app/composables/useEntryLinks')
    const { generateEntryLink } = useEntryLinks()

    const payload = { project_id: 1, candidate_ref: 'cand-1', display_name: 'Mario Rossi' }
    const result = await generateEntryLink(payload)

    expect(apiFetchMock).toHaveBeenCalledWith('/entry-links', { method: 'POST', body: payload })
    expect(result).toEqual({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
  })

  // interview-scheduling (PR-F, T-F1): `scheduled_at` is now part of
  // `GenerateEntryLinkPayload` (types/api.ts, regenerated from the api's
  // openapi.json after PR-E). This composable is a thin, untyped-at-runtime
  // passthrough (`apiFetch<T>(url, {body: payload})`), so no runtime code
  // change was needed here — this test documents and locks in that the
  // regenerated type accepts the field and the composable forwards it
  // unmodified, rather than silently dropping or renaming it.
  it('forwards scheduled_at through to the POST body untouched', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({
      id: 7,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      scheduled_at: '2026-10-01T12:00:00.000000Z',
      scheduling_status: 'pending',
    })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEntryLinks } = await import('../../../app/composables/useEntryLinks')
    const { generateEntryLink } = useEntryLinks()

    const payload = {
      project_id: 1,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      email: 'mario@example.test',
      scheduled_at: '2026-10-01T12:00:00.000+02:00',
    }
    const result = await generateEntryLink(payload)

    expect(apiFetchMock).toHaveBeenCalledWith('/entry-links', { method: 'POST', body: payload })
    expect(result).toEqual({
      id: 7,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      scheduled_at: '2026-10-01T12:00:00.000000Z',
      scheduling_status: 'pending',
    })
  })
})
