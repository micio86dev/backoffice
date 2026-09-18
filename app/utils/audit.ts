/**
 * Pure audit-signal rendering helpers (scoring-audit-jev design D9,
 * admin-backoffice spec "A Net-New Review-Status Element Renders
 * Per-Indicator Audit Signal — ScoreChip Stays Score-Only"), mirroring
 * `utils/bars.ts`'s own shape: a TOTAL function per concern, never a raw
 * machine value printed bare, an unrecognised value falls back loudly rather
 * than rendering blank.
 *
 * `AuditFlag.vue`'s five wire statuses — `judged`, `unavailable`,
 * `malformed`, `skipped`, plus the serializer-only synthetic
 * `never_audited` — each get their own Badge VARIANT (a distinct visual
 * treatment per status, per the spec's own scenario). The raw
 * `support_probability` number is a SEPARATE concern and is rendered
 * verbatim as a percentage with no threshold/band (D9's "no High/Medium/Low
 * bands" doctrine, the same one `ReliabilityBadge.vue` already applies to
 * `reliability`) — this file never buckets it.
 */
import type { BadgeVariants } from '@/components/ui/badge'

/**
 * `status` is typed `string` by the generated OpenAPI schema
 * (`EvaluationAuditVerdict['status']`, `useEvaluationReport.ts`) — the
 * closed five-value wire vocabulary below (`judged`/`unavailable`/
 * `malformed`/`skipped`/`never_audited`) is enforced at the database CHECK
 * (`indicator_score_audits_status_check`) and the serializer, not
 * expressible in the generated type. Every function here therefore accepts
 * a bare `string` and falls back loudly (never silently) for anything
 * outside the five known values — the same TOTAL-function discipline
 * `auditOutcomeReasonKey` already applies to `outcome_reason`.
 */

/**
 * One Badge variant per status — five statuses, five distinct treatments.
 * `judged` uses `info` (a neutral "here is the signal" tone, never
 * success/warning by VALUE — the probability itself carries no colour);
 * `unavailable`/`malformed` are the two "could not check" outcomes and get
 * their own distinguishable warning-family variants; `skipped` is neutral
 * (an intentional, expected non-judgement); `never_audited` is `outline` —
 * visually the quietest of the five, since it asserts nothing about the
 * indicator at all. An UNRECOGNISED status gets its own `destructive`-family
 * treatment too (a data-integrity signal worth noticing), never silently
 * reusing `never_audited`'s quiet one.
 */
export function auditFlagVariant(status: string): NonNullable<BadgeVariants['variant']> {
  switch (status) {
    case 'judged':
      return 'info'
    case 'unavailable':
      return 'warning'
    case 'malformed':
      return 'destructive'
    case 'skipped':
      return 'neutral'
    case 'never_audited':
      return 'outline'
    default:
      return 'destructive' // unrecognised — see the module docblock
  }
}

/** i18n key per status — never a bare machine string. */
export function auditFlagLabelKey(status: string): string {
  switch (status) {
    case 'judged':
      return 'report.audit.flag.judged'
    case 'unavailable':
      return 'report.audit.flag.unavailable'
    case 'malformed':
      return 'report.audit.flag.malformed'
    case 'skipped':
      return 'report.audit.flag.skipped'
    case 'never_audited':
      return 'report.audit.flag.neverAudited'
    default:
      return 'report.audit.flag.unknown'
  }
}

/**
 * The eight `outcome_reason` values shipped by the API across
 * `skipped`/`unavailable`/`malformed` (design C-E's vocabulary table).
 * `judged` never carries a reason (the CHECK equivalence at
 * `indicator_score_audits_reason_check`).
 */
const KNOWN_AUDIT_OUTCOME_REASONS = [
  'unassessable_by_construction',
  'assessed_without_excerpts',
  'judge_unreachable',
  'judge_http_error',
  'judge_timeout',
  'verdict_missing',
  'verdict_unparseable',
  'probability_out_of_domain',
] as const

/**
 * Maps `audit.outcome_reason` to an i18n key (same TOTAL-function shape as
 * `indicatorUnassessableReasonKey` in `utils/bars.ts`):
 *   - `null` → `null` — `judged`/`never_audited` carry no reason.
 *   - a KNOWN reason → its own key under `report.audit.reason`.
 *   - an UNRECOGNISED reason → the neutral fallback, never the raw string.
 */
export function auditOutcomeReasonKey(reason: string | null | undefined): string | null {
  if (reason == null) return null
  return (KNOWN_AUDIT_OUTCOME_REASONS as readonly string[]).includes(reason)
    ? `report.audit.reason.${reason}`
    : 'report.audit.reason.unknown'
}

/**
 * `support_probability` rendered VERBATIM as a whole-number percentage — a
 * unit conversion (0..1 → 0%..100%), never a derived band (D9). `null` when
 * the status carries no probability (every non-`judged` status).
 */
export function auditSupportPercentage(probability: number | null): string | null {
  if (probability === null) return null
  return `${Math.round(probability * 100)}%`
}
