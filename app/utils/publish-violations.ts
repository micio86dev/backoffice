/**
 * Reads `{data:{violations}}` from a `POST /catalogue/revisions/publish`
 * 422 rejection (`PublishRevision::violations()`, framework-catalogue-
 * authoring design D3) — the full blocking-reason list, replacing the
 * generic "publish was refused" banner PR10 left as a known limitation
 * (PR10b, task 39b.5).
 *
 * NOT derived from the generated client — checked here as a DELIBERATE,
 * narrow exception to that rule, not a shortcut, because the generated
 * `PublishRevisionViolationsResponse` (`useCatalogue.ts`) does not merely
 * lack precision here, it MISMODELS the wire shape. `types/api.ts`'s actual
 * inferred type for `violations` is a 3-way union where the tuple variant's
 * OWN first slot is itself `[{rule:'roles_closed_set',...}] | string[]` — a
 * nested array inside the outer one — slots 1 through 7 are bare
 * `unknown[]`, and slot 8 is `{rule:'cross_role_duplicate_anchor_new_to_
 * revision',...}[]`. No real HTTP response body could ever satisfy that
 * shape: `PublishRevision::violations()`'s OWN PHPDoc return type is
 * `list<array{rule: string, subject: string, detail: string}>` — a FLAT
 * list, always, field-for-field what `PublishViolation` declares below.
 * Scramble's static trace evidently modeled each of the method's 9 private
 * `...Violations()` call sites as a fixed tuple position instead of
 * recognizing the `[...$violations, ...$this->xViolations($id)]` spread
 * pattern that flattens them at runtime — an artifact of the ANALYZER, not
 * a real ambiguity in what the API returns. Deriving a client type from
 * that generated shape would encode Scramble's mistake, not the contract.
 *
 * The real fix is server-side (a precise Scramble-friendly `@return`
 * annotation, or a dedicated Resource class for this response, the same
 * pattern `useDashboardMetrics.ts`'s own docblock records for an EARLIER
 * instance of this exact class of problem) — out of reach from this repo
 * alone under this session's explicit instruction not to modify `api`.
 * Follow-up, not assumed to be silently fine: flag this file for review
 * once that annotation lands, and delete this exception in favor of the
 * generated type at that point.
 */
export interface PublishViolation {
  rule: string
  subject: string
  detail: string
}

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
