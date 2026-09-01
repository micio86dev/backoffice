/**
 * participant-lifecycle.ts (operator-participant-visibility PR4, D7 — mirror
 * of the server's LifecycleReadGate D1 two-clause rule).
 *
 * Client-side twin of `LifecycleReadGate::SCOPE_RULES`
 * (api/app/Support/Admin/LifecycleReadGate.php:76-77):
 *   - Transcript ready at status >= `in_corso` (the D1 minimum), OR `errore`
 *     (the off-progression allowance — terminal-failed is not "further
 *     along" the ordered progression, but the transcript IS reachable there)
 *   - Evaluation ready only at status === `completato`, off-progression list
 *     empty (the errore allowance is Transcript-only)
 *   - Any status NOT on the ordered list AND NOT in a scope's
 *     off-progression list (including any unrecognized value) is NOT ready
 *     for either scope — fail-closed, no `?? true` fallthrough, mirroring
 *     the server's own discipline.
 *
 * This is a pure, correctness-critical function: the detail page's "ready to
 * view" indicator would silently lie to the operator if a single threshold
 * drifted from the server's own gate.
 */
import { describe, it, expect } from 'vitest'
import {
  isParticipantResourceReady,
  ORDERED_STATUSES,
  PARTICIPANT_STATUSES,
  SCOPE_RULES,
  statusBadgeVariant,
} from '../../../app/utils/participant-lifecycle'

describe('isParticipantResourceReady', () => {
  describe('transcript scope (ready at >= in_corso, OR errore off-progression)', () => {
    it('is NOT ready at in_attesa', () => {
      expect(isParticipantResourceReady('in_attesa', 'transcript')).toBe(false)
    })

    it('IS ready at in_corso (D1 minimum)', () => {
      expect(isParticipantResourceReady('in_corso', 'transcript')).toBe(true)
    })

    it('IS ready at in_valutazione', () => {
      expect(isParticipantResourceReady('in_valutazione', 'transcript')).toBe(true)
    })

    it('IS ready at completato', () => {
      expect(isParticipantResourceReady('completato', 'transcript')).toBe(true)
    })

    it('IS ready at errore (off-progression allowance, not ranked)', () => {
      expect(isParticipantResourceReady('errore', 'transcript')).toBe(true)
    })
  })

  describe('evaluation scope (ready ONLY at completato)', () => {
    it('is NOT ready at in_attesa', () => {
      expect(isParticipantResourceReady('in_attesa', 'evaluation')).toBe(false)
    })

    it('is NOT ready at in_corso', () => {
      expect(isParticipantResourceReady('in_corso', 'evaluation')).toBe(false)
    })

    it('is NOT ready at in_valutazione (transcript-ready is not evaluation-ready)', () => {
      expect(isParticipantResourceReady('in_valutazione', 'evaluation')).toBe(false)
    })

    it('IS ready at completato', () => {
      expect(isParticipantResourceReady('completato', 'evaluation')).toBe(true)
    })

    it('is NOT ready at errore', () => {
      expect(isParticipantResourceReady('errore', 'evaluation')).toBe(false)
    })
  })

  describe('fail-closed on an unrecognized status', () => {
    it('denies both scopes for a status outside the known set (never a silent true)', () => {
      expect(isParticipantResourceReady('some_future_status', 'transcript')).toBe(false)
      expect(isParticipantResourceReady('some_future_status', 'evaluation')).toBe(false)
    })
  })
})

// D7's own disjointness invariant — the client-side twin of the server's D1
// safety property (LifecycleReadGateTest.php: "no off_progression member of
// any scope appears in ORDERED_STATUSES"). With this held, the `||` in
// `isParticipantResourceReady` can never change the outcome for a RANKED
// status: the off-progression clause is structurally unreachable for it.
describe('D7 disjointness invariant (client twin of D1)', () => {
  it('no offProgression member of any scope appears in ORDERED_STATUSES', () => {
    for (const [scope, rule] of Object.entries(SCOPE_RULES)) {
      for (const offProgressionStatus of rule.offProgression) {
        expect(
          (ORDERED_STATUSES as readonly string[]).includes(offProgressionStatus),
          `Scope '${scope}': offProgression member '${offProgressionStatus}' must never rank on ORDERED_STATUSES.`
        ).toBe(false)
      }
    }
  })

  it("evaluation's offProgression allow-list is empty (the errore allowance is transcript-only)", () => {
    expect(SCOPE_RULES.evaluation.offProgression).toEqual([])
  })
})

describe('statusBadgeVariant', () => {
  // Only Badge's own pre-verified-contrast variants are ever returned — NOT
  // arbitrary text-success/text-error utility classes. A real @axe-core
  // WCAG 2.1 AA run against the pinned Playwright container caught the
  // custom-class version failing "color-contrast" (text-success ~1.96:1 on
  // a transparent/white background, nowhere near the 4.5:1 floor) — see
  // the mutation-test note in the docblock above statusBadgeVariant.
  //
  // The variants are now SEMANTIC, and that constraint is honoured rather than
  // repealed: `success`/`warning`/`info`/`neutral` each pair a `-light` fill
  // with its `-dark` foreground, measured numerically in theme.spec.ts
  // (6.49:1, 6.37:1, 7.15:1). None of them is the raw `text-success`-on-white
  // combination axe-core rejected — which is precisely why they use the
  // `-dark` tokens.
  //
  // What changed is the MAPPING. `completato` was `default`, i.e. `bg-primary`
  // — the Quint purple. Every terminal state looked like the brand rather than
  // like an outcome, so the badge said a state existed without saying whether
  // it was good, and spent the brand's loudest colour doing it.
  it('returns neutral for the not-yet-started status', () => {
    expect(statusBadgeVariant('in_attesa')).toBe('neutral')
  })

  it('distinguishes running from being-processed, which used to look identical', () => {
    // Both were `outline`. They are different states — one needs the candidate,
    // the other needs only time — and an operator scanning a list could not
    // tell them apart.
    expect(statusBadgeVariant('in_corso')).toBe('info')
    expect(statusBadgeVariant('in_valutazione')).toBe('warning')
  })

  it('returns success for completato, never the brand colour', () => {
    expect(statusBadgeVariant('completato')).toBe('success')
    expect(statusBadgeVariant('completato')).not.toBe('default')
  })

  it('returns destructive (pre-verified contrast, existing codebase pattern) for errore', () => {
    expect(statusBadgeVariant('errore')).toBe('destructive')
  })

  it('returns neutral for an unrecognized status (never throws, never falsely destructive/success)', () => {
    // An unknown status must not be dressed as an outcome in either direction:
    // green would claim a success that was never reported, red an error that
    // never happened.
    expect(statusBadgeVariant('some_future_status')).toBe('neutral')
  })
})

describe('PARTICIPANT_STATUSES', () => {
  it('lists exactly the 5 known domain statuses, in lifecycle order, errore last', () => {
    expect(PARTICIPANT_STATUSES).toEqual([
      'in_attesa',
      'in_corso',
      'in_valutazione',
      'completato',
      'errore',
    ])
  })
})
