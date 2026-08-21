/**
 * Client-side mirror of the API's `LifecycleReadGate`
 * (`api/app/Support/Admin/LifecycleReadGate.php`), operator-participant-
 * visibility design D7 (mirrors D1's two-clause rule).
 *
 * `ORDERED_STATUSES` intentionally does NOT include `errore` — terminal-
 * failed is not "further along" the progression (D1). `PARTICIPANT_STATUSES`
 * (5 values, `errore` included) is the full known-status set, used for
 * filter UI and status labels.
 *
 * `SCOPE_RULES` copies the server's SHAPE, not just its values: each scope
 * names a `minimum` (a point ON `ORDERED_STATUSES`) plus an `offProgression`
 * allow-list of statuses that are NOT on it and are admitted through a
 * second, explicitly disjoint clause — never by appending them to the
 * ordered list (that would assert they rank ABOVE `completato`). Keeping the
 * same two-field shape on both sides is what makes a future threshold move a
 * one-line diff a reviewer can compare side by side.
 *
 * This is a display-only convenience mirror — the server remains the sole
 * authority (every read still goes through `AdminParticipantReader` and
 * returns a real 409 for a not-yet-ready resource). Getting this threshold
 * wrong would mislead an operator about whether a resource is ready, so it
 * is treated as correctness-critical and tested against the full 5-status x
 * 2-scope matrix plus D1's own disjointness invariant, mirroring the API's
 * own gate tests (`LifecycleReadGateTest.php`).
 */

export const ORDERED_STATUSES = ['in_attesa', 'in_corso', 'in_valutazione', 'completato'] as const

export const PARTICIPANT_STATUSES = [...ORDERED_STATUSES, 'errore'] as const

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number]

export type ParticipantResourceScope = 'transcript' | 'evaluation'

interface ScopeRule {
  /** A point ON `ORDERED_STATUSES`. */
  minimum: (typeof ORDERED_STATUSES)[number]
  /** Statuses that are NOT on `ORDERED_STATUSES`, admitted regardless of rank. */
  offProgression: readonly string[]
}

/**
 * Client-side twin of `LifecycleReadGate::SCOPE_RULES`
 * (LifecycleReadGate.php:76-77). `errore` is off-progression for
 * `transcript` ONLY — Evaluation's list stays empty (D1: a BARS verdict for
 * a crashed interview is explicitly out of scope).
 */
export const SCOPE_RULES: Record<ParticipantResourceScope, ScopeRule> = {
  transcript: { minimum: 'in_corso', offProgression: ['errore'] },
  evaluation: { minimum: 'completato', offProgression: [] },
}

/** The ranked comparison, extracted verbatim like the server's own `reaches()`. */
function reaches(status: string, minimum: (typeof ORDERED_STATUSES)[number]): boolean {
  const index = ORDERED_STATUSES.indexOf(status as (typeof ORDERED_STATUSES)[number])
  if (index === -1) return false

  return index >= ORDERED_STATUSES.indexOf(minimum)
}

/**
 * Fail-closed: a status that is neither on `ORDERED_STATUSES` at or past the
 * scope's minimum, NOR in the scope's `offProgression` list (including any
 * future/unrecognized value), returns `false`. There is no `?? true`
 * fallthrough, matching the server gate's own discipline.
 */
export function isParticipantResourceReady(
  status: string,
  scope: ParticipantResourceScope
): boolean {
  const rule = SCOPE_RULES[scope]

  return reaches(status, rule.minimum) || rule.offProgression.includes(status)
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
