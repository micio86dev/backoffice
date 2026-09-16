/**
 * Reads `{data:{violations}}` from a `POST /catalogue/revisions/publish`
 * 422 rejection (`PublishRevision::violations()`, framework-catalogue-
 * authoring design D3) — the full blocking-reason list, replacing the
 * generic "publish was refused" banner PR10 left as a known limitation
 * (PR10b, task 39b.5).
 *
 * `PublishViolation` is now DERIVED FROM THE GENERATED CLIENT, as every
 * other type in this app is — `useCatalogue.ts`'s `PublishRevisionViolations
 * Response` used to mismodel the wire shape (a 9-slot tuple mirroring
 * `PublishRevision::violations()`'s own private `...Violations()` call
 * sites, an artifact of Scramble tracing the spread pattern
 * `[...$violations, ...$this->xViolations($id)]` as fixed tuple positions
 * instead of a flattened list). PR10c (framework-catalogue-authoring,
 * 39c.3) fixed the server-side OpenAPI model to the real flat
 * `array<{rule, subject, detail}>` shape, so this file's own former
 * hand-written exception is gone along with the reason for it.
 */
import type { PublishRevisionViolationsResponse } from '@/composables/useCatalogue'

export type PublishViolation = PublishRevisionViolationsResponse['violations'][number]

export function extractPublishViolations(error: unknown): PublishViolation[] {
  if (typeof error !== 'object' || error === null) return []
  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return []
  const violations = (data as { violations?: unknown }).violations
  if (!Array.isArray(violations)) return []

  return violations.filter((violation): violation is PublishViolation => {
    if (typeof violation !== 'object' || violation === null) return false
    const { rule, subject, detail } = violation as Record<string, unknown>
    return typeof rule === 'string' && typeof subject === 'string' && typeof detail === 'string'
  })
}
