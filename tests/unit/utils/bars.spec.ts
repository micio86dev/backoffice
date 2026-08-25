/**
 * bars.ts (PR B3, task 19.1; widened to {1,2,3,4,5,-1} — bars-full-scale-1-5
 * PR 2, task 2.1)
 *
 * Pure BARS rendering-state helpers, correctness-critical per DESIGN.md §8.3:
 *   - Indicator scores are one integer from {1,2,3,4,5} ∪ {-1}; `-1`/`null`
 *     means UNASSESSABLE, never a numeric chip. `4`/`2` are residual levels
 *     and MUST render as their own distinct, non-neutral chip state — NEVER
 *     `unassessable` (D6, admin-backoffice spec "Indicator Chip Mapping Never
 *     Launders Out-Of-Domain Values Into Unassessable").
 *   - Any other numeric value (0, 6, a decimal, NaN) is a data-integrity bug
 *     and MUST map to an explicit `invalid` state — also never laundered
 *     into `unassessable`, which would hide the defect from the operator.
 *   - Competency mean thresholds: <2.5 error, 2.5–3.5 warning, >3.5 success;
 *     `null` (all-unassessable) renders neutral, never as if it were 0.
 */
import { describe, it, expect } from 'vitest'
import {
  indicatorChipState,
  competencyMeanState,
  unscorableReasonKey,
  indicatorUnassessableReasonKey,
} from '../../../app/utils/bars'

describe('indicatorChipState', () => {
  it('maps 1 to error', () => {
    expect(indicatorChipState(1)).toBe('error')
  })

  it('maps 3 to warning', () => {
    expect(indicatorChipState(3)).toBe('warning')
  })

  it('maps 5 to success', () => {
    expect(indicatorChipState(5)).toBe('success')
  })

  it('maps null (API-mapped sentinel) to unassessable', () => {
    expect(indicatorChipState(null)).toBe('unassessable')
  })

  it('maps raw -1 (reference-fixture sentinel) to unassessable', () => {
    expect(indicatorChipState(-1)).toBe('unassessable')
  })

  it('maps 2 to below-mid (residual level, distinct from unassessable)', () => {
    expect(indicatorChipState(2)).toBe('below-mid')
    expect(indicatorChipState(2)).not.toBe('unassessable')
  })

  it('maps 4 to above-mid (residual level, distinct from unassessable)', () => {
    expect(indicatorChipState(4)).toBe('above-mid')
    expect(indicatorChipState(4)).not.toBe('unassessable')
  })

  it('maps out-of-domain integer 0 to invalid, never unassessable', () => {
    expect(indicatorChipState(0)).toBe('invalid')
    expect(indicatorChipState(0)).not.toBe('unassessable')
  })

  it('maps out-of-domain integer 6 to invalid, never unassessable', () => {
    expect(indicatorChipState(6)).toBe('invalid')
    expect(indicatorChipState(6)).not.toBe('unassessable')
  })

  it('maps a decimal (2.5) to invalid, never unassessable', () => {
    expect(indicatorChipState(2.5)).toBe('invalid')
    expect(indicatorChipState(2.5)).not.toBe('unassessable')
  })

  it('maps NaN to invalid, never unassessable', () => {
    expect(indicatorChipState(Number.NaN)).toBe('invalid')
    expect(indicatorChipState(Number.NaN)).not.toBe('unassessable')
  })
})

describe('competencyMeanState', () => {
  it('is error below 2.5', () => {
    expect(competencyMeanState(2.33)).toBe('error')
  })

  it('is warning at exactly 2.5 (lower boundary is inclusive of warning)', () => {
    expect(competencyMeanState(2.5)).toBe('warning')
  })

  it('is warning at exactly 3.5 (upper boundary is inclusive of warning)', () => {
    expect(competencyMeanState(3.5)).toBe('warning')
  })

  it('is success above 3.5', () => {
    expect(competencyMeanState(3.67)).toBe('success')
  })

  it('is unassessable when mean is null (all indicators unassessable — never 0)', () => {
    expect(competencyMeanState(null)).toBe('unassessable')
  })
})

// ─── unscorableReasonKey (A5.1/A5.2, design.md D12) ──────────────────────────
//
// A total function: `null` maps to `null` (no explanation to render — the
// competency scored normally), each of the four known reasons maps to its
// own i18n key, and an UNRECOGNIZED reason renders loudly via the neutral
// fallback key — NEVER a blank cell and NEVER the raw machine key printed
// bare. This is D6 of bars-full-scale-1-5 applied to a second field: the
// failure mode that made ship-ordering load-bearing was silent masking.

describe('unscorableReasonKey', () => {
  it('maps null to null (competency scored normally, no explanation to render)', () => {
    expect(unscorableReasonKey(null)).toBeNull()
  })

  it('maps role_no_bars to its own i18n key', () => {
    expect(unscorableReasonKey('role_no_bars')).toBe('report.unscorable.role_no_bars')
  })

  it('maps anchor_translation_missing to its own i18n key', () => {
    expect(unscorableReasonKey('anchor_translation_missing')).toBe(
      'report.unscorable.anchor_translation_missing'
    )
  })

  it('maps llm_parse_error to its own i18n key', () => {
    expect(unscorableReasonKey('llm_parse_error')).toBe('report.unscorable.llm_parse_error')
  })

  it('maps llm_truncated to its own i18n key', () => {
    expect(unscorableReasonKey('llm_truncated')).toBe('report.unscorable.llm_truncated')
  })

  it('maps an unrecognized reason to the neutral fallback key, never blank', () => {
    expect(unscorableReasonKey('some_future_reason_not_yet_shipped')).toBe(
      'report.unscorable.unknown'
    )
  })
})

// ─── indicatorUnassessableReasonKey (B3, design.md D11) ──────────────────────
//
// The indicator-grain sibling of unscorableReasonKey — same total-function
// shape, different key base and different (3-value) known set.

describe('indicatorUnassessableReasonKey', () => {
  it('maps null to null (legally-scored indicator, nothing to render)', () => {
    expect(indicatorUnassessableReasonKey(null)).toBeNull()
  })

  it('maps model_declared to its own i18n key', () => {
    expect(indicatorUnassessableReasonKey('model_declared')).toBe(
      'report.indicatorUnassessableReason.model_declared'
    )
  })

  it('maps excerpt_unverifiable to its own i18n key', () => {
    expect(indicatorUnassessableReasonKey('excerpt_unverifiable')).toBe(
      'report.indicatorUnassessableReason.excerpt_unverifiable'
    )
  })

  it('maps score_illegal to its own i18n key', () => {
    expect(indicatorUnassessableReasonKey('score_illegal')).toBe(
      'report.indicatorUnassessableReason.score_illegal'
    )
  })

  it('maps an unrecognized reason to the neutral fallback key, never blank', () => {
    expect(indicatorUnassessableReasonKey('some_future_reason_not_yet_shipped')).toBe(
      'report.indicatorUnassessableReason.unknown'
    )
  })
})

/**
 * An ABSENT reason must mean "scorable", exactly as an explicit null does.
 *
 * Both functions compared with `=== null`, so a payload that simply omits the
 * field — an older API, a serializer that drops nulls, a partial fixture — fell
 * through to the "unrecognised reason" branch. The operator was then shown a row
 * carrying a real score AND the words "not assessed", with an empty parenthesis
 * where the reason should be. Self-contradictory output, stated confidently.
 *
 * Caught on 2026-08-25 by an E2E screenshot, once repaired mocks finally let the
 * report render.
 */
describe('a missing reason is not an unrecognised reason', () => {
  it('unscorableReasonKey treats undefined like null', () => {
    expect(unscorableReasonKey(undefined as unknown as null)).toBeNull()
  })

  it('indicatorUnassessableReasonKey treats undefined like null', () => {
    expect(indicatorUnassessableReasonKey(undefined as unknown as null)).toBeNull()
  })

  it('still flags a genuinely unrecognised reason', () => {
    // The tolerance above must not swallow the case these functions exist for.
    expect(unscorableReasonKey('something_new')).toBe('report.unscorable.unknown')
    expect(indicatorUnassessableReasonKey('something_new')).toBe(
      'report.indicatorUnassessableReason.unknown'
    )
  })
})
