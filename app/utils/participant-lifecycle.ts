/**
 * Client-side mirror of the API's `LifecycleReadGate` (design D2,
 * `api/app/Support/Admin/LifecycleReadGate.php`).
 *
 * The ordered list intentionally does NOT include `errore` (terminal-failed
 * is not "further along" — see D2) and is used ONLY for the transcript
 * threshold comparison. `PARTICIPANT_STATUSES` (5 values, `errore` included)
 * is the full known-status set, used for filter UI and status labels.
 *
 * This is a display-only convenience mirror — the server remains the sole
 * authority (every read still goes through `AdminParticipantReader` and
 * returns a real 409 for a not-yet-ready resource). Getting this threshold
 * wrong would mislead an operator about whether a report is ready, so it is
 * treated as correctness-critical and tested against the full 5-status x
 * 2-scope matrix, mirroring the API's own gate matrix test
 * (`AdminLifecycleGateMatrixTest.php`).
 */

const ORDERED_STATUSES = ['in_attesa', 'in_corso', 'in_valutazione', 'completato'] as const

export const PARTICIPANT_STATUSES = [...ORDERED_STATUSES, 'errore'] as const

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number]

export type ParticipantResourceScope = 'transcript' | 'evaluation'

const TRANSCRIPT_THRESHOLD_INDEX = ORDERED_STATUSES.indexOf('in_valutazione')

/**
 * Fail-closed: any status not found in the ordered list (including `errore`
 * and any future/unrecognized value) returns `false` for every scope. There
 * is no `?? true` fallthrough, matching the server gate's own discipline.
 */
export function isParticipantResourceReady(
  status: string,
  scope: ParticipantResourceScope
): boolean {
  const index = ORDERED_STATUSES.indexOf(status as (typeof ORDERED_STATUSES)[number])
  if (index === -1) return false

  if (scope === 'evaluation') return status === 'completato'

  return index >= TRANSCRIPT_THRESHOLD_INDEX
}

export type StatusBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

/**
 * Maps a participant status to one of Badge's OWN pre-verified-contrast
 * variants — never a custom Tailwind class. An earlier version of this
 * function returned a semantic tone consumed via a hand-rolled
 * `text-success`/`text-error` class map; a real @axe-core WCAG 2.1 AA run
 * against the pinned Playwright container caught that combination failing
 * "color-contrast" (raw `--color-success` text on a transparent/near-white
 * background is roughly 1.96:1, nowhere near the 4.5:1 AA floor for normal
 * text — DESIGN.md never published a contrast-checked pairing for it,
 * unlike `--destructive`, which IS pre-verified and is exactly what Badge's
 * own `destructive` variant already uses). Reusing Badge's existing
 * variants keeps every status badge on an already-audited contrast pair.
 */
export function statusBadgeVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case 'completato':
      return 'default'
    case 'errore':
      return 'destructive'
    case 'in_corso':
    case 'in_valutazione':
      return 'outline'
    case 'in_attesa':
      return 'secondary'
    default:
      return 'secondary'
  }
}
