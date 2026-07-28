/**
 * participant-query.ts (PR B2, task 17.4 — RED)
 *
 * Pure query-string builder for GET /api/participants. Extracted from the
 * composable (Extract-Before-Mock rule) so filter/pagination logic is
 * testable with zero HTTP mocks.
 */
import { describe, it, expect } from 'vitest'
import { buildParticipantListQuery } from '../../../app/utils/participant-query'

describe('buildParticipantListQuery', () => {
  it('returns an empty string when no params are given', () => {
    expect(buildParticipantListQuery({})).toBe('')
  })

  it('serializes page and perPage as page/per_page', () => {
    expect(buildParticipantListQuery({ page: 2, perPage: 50 })).toBe('?page=2&per_page=50')
  })

  it('serializes projectId as project_id', () => {
    expect(buildParticipantListQuery({ projectId: 7 })).toBe('?project_id=7')
  })

  it('serializes status verbatim', () => {
    expect(buildParticipantListQuery({ status: 'in_valutazione' })).toBe('?status=in_valutazione')
  })

  it('serializes and URL-encodes a free-text search query', () => {
    expect(buildParticipantListQuery({ q: 'jane doe' })).toBe('?q=jane+doe')
  })

  it('combines multiple filters in a stable, deterministic order', () => {
    expect(
      buildParticipantListQuery({
        page: 3,
        perPage: 20,
        projectId: 1,
        status: 'completato',
        q: 'x',
      })
    ).toBe('?page=3&per_page=20&project_id=1&status=completato&q=x')
  })

  it('omits a filter whose value is an empty string (no q= with nothing after it)', () => {
    expect(buildParticipantListQuery({ q: '' })).toBe('')
  })
})
