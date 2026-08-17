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
})
