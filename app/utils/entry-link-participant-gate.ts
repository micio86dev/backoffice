/**
 * entry-link-participant-gate.ts
 *
 * Pure client-side mirror of the PARTICIPANT-STATUS half of the API's mint
 * decision (`api/app/Support/Sso/EntryLinkMinter.php:57-70`) — the
 * `project-accessibility.ts` sibling only mirrors the PROJECT gate
 * (`projectIsAccessible()`), a deliberately separate predicate documented in
 * its own docblock; this one exists so the participant-level refusal gets the
 * same "state a reason instead of offering a guaranteed-409 action" treatment,
 * without overloading that unrelated function.
 *
 * Used ONLY to disable the mint action with a STATED reason — never as
 * authorization of its own. `POST /api/entry-links` still enforces this
 * independently and returns 409 regardless of what this predicate says.
 */

export type EntryLinkParticipantReason = 'completed' | 'failed'

/**
 * `null` when the participant's status does not refuse a mint on its own —
 * the caller still has to check the project gate separately.
 */
export function entryLinkParticipantReason(status: string): EntryLinkParticipantReason | null {
  if (status === 'completato') return 'completed'
  if (status === 'errore') return 'failed'

  return null
}
