/**
 * i18n-help-keys.spec.ts (form-clarity-and-console-warnings, D6)
 *
 * "Every non-obvious form field explains itself" (admin-backoffice spec) MUST
 * be i18n-keyed in BOTH `it` and `en` — this pins the 16 new help-text keys
 * design.md's D6 copy table drafts, so a locale that forgot one fails here
 * rather than as a silently blank hint in production.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const IT = JSON.parse(readFileSync(resolve(__dirname, '../../i18n/locales/it.json'), 'utf-8'))
const EN = JSON.parse(readFileSync(resolve(__dirname, '../../i18n/locales/en.json'), 'utf-8'))

const HELP_KEY_PATHS = [
  'projects.form.help.name',
  'projects.form.help.slug',
  'projects.form.help.language',
  'projects.form.help.assessmentTypeFreezes',
  'projects.form.help.pauseEveryN',
  'projects.form.help.nudgeMinChars',
  'projects.form.help.exitRedirectUrl',
  'projects.form.help.webhookUrl',
  'projects.form.help.competencies',
  'users.form.help.email',
  'users.form.help.password',
  'users.form.help.role',
  'settings.webhooks.help.url',
  'settings.organization.help.name',
  'settings.apiKeys.help.name',
  'avatar_templates.form.help.name',
] as const

// bars-coverage-visibility Phase 3 (design D6) — the 4 new coverage-copy
// keys, asserted the same way: no bare literal, both locales carry it.
const COVERAGE_KEY_PATHS = [
  'projects.competencyPicker.noBars',
  'projects.competencyPicker.attachedNoBars',
  'projects.competencyPicker.coverageSummary',
  'projects.table.uncoveredCompetencies',
] as const

// Evaluation-report clarity: the glossary tips above the grid and the
// indicator/score/evidence accordion that replaced the flat excerpts block.
const REPORT_CLARITY_KEY_PATHS = [
  'help.glossary.indicator.term',
  'help.glossary.indicator.definition',
  'help.glossary.excerpt.term',
  'help.glossary.excerpt.definition',
  'report.help.trigger',
  'report.glossary.label',
  'report.evidence.title',
  'report.evidence.intro',
  'report.evidence.explanation',
  'report.evidence.noIndicators',
  'report.evidence.expandAll',
  'report.evidence.collapseAll',
] as const

// Conversation-LLM cost (pluggable-conversation-llm P9): the two surfaces
// that price a session or a template, plus the glossary term they share. The
// copy IS the safeguard here — every one of these strings exists to stop a
// figure being read as a bill, a rate, or a zero — so a locale that forgot one
// must fail here rather than ship a blank line where the caveat belonged.
const LLM_COST_KEY_PATHS = [
  'help.glossary.llmCost.term',
  'help.glossary.llmCost.definition',
  'review.cost.separateMeters',
  'review.cost.avatarMeter',
  'review.cost.llmMeter',
  'review.cost.llmEstimated',
  'review.cost.llmActual',
  'review.cost.llmNotBilled',
  'avatar_templates.llmForecastIntro',
  'avatar_templates.llmForecast',
  'avatar_templates.llmForecastUnavailable',
  'settings.tabs.llmCredentials',
  'settings.sectionDescription.llmCredentials',
] as const

// Conversation-LLM binding errors (pluggable-conversation-llm, P8.10 follow-up).
// P8.10 authored three of these and missed two, so `AvatarTemplate::booted()`
// could throw a code the form had no copy for — and the operator read the raw
// `model_not_found` / `vendor_mismatch` in red. This list is derived from the
// THROW SITES, not from what the locale happens to contain: every
// `InvalidLlmBindingException` reason plus `UnsupportedLlmModeException`'s
// `mode_unsupported`, so adding a server code without copy fails here.
//
// The last two have no throw site: they are client-side refusals. I1 is a
// database CHECK (both-or-neither), so a half-bound draft must be stopped in
// the form rather than sent to be rejected — an operator who picked one half
// caused no server error and must not be shown one.
const LLM_BINDING_ERROR_KEY_PATHS = [
  'avatar_templates.error.llm.model_not_found',
  'avatar_templates.error.llm.model_unavailable',
  'avatar_templates.error.llm.mode_unsupported',
  'avatar_templates.error.llm.credential_not_found',
  'avatar_templates.error.llm.vendor_mismatch',
  'avatar_templates.error.llm.model_required',
  'avatar_templates.error.llm.credential_required',
] as const

// Post-save warnings. `pages/avatar-templates/index.vue` renders these with a
// BARE `$t()` — no `te()` gate, unlike the 422 mapper — so a code with no copy
// is shown to the operator as the i18n key itself. That is what production did
// on every HeyGen save: `avatar_templates.warning.llm_secret_failed`, verbatim,
// in the alert.
//
// The namespace was authored for the Tavus path only (`pal_*`,
// `tavus_key_missing`); the whole `llm_*` family `HeygenLlmRegistrar` emits was
// never given copy in either locale. Derived from the EMIT sites — every
// `['status' => 'warning', 'message' => …]` in `HeygenLlmRegistrar` and
// `TavusPalSync` — so a new warning code without copy fails here.
const WARNING_KEY_PATHS = [
  'avatar_templates.warning.title',
  'avatar_templates.warning.pal_sync_failed',
  'avatar_templates.warning.pal_sync_unreachable',
  'avatar_templates.warning.tavus_key_missing',
  'avatar_templates.warning.pal_id_missing',
  'avatar_templates.warning.llm_provider_unreachable',
  'avatar_templates.warning.llm_credential_missing',
  'avatar_templates.warning.llm_secret_failed',
  'avatar_templates.warning.llm_config_failed',
] as const

function get(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      obj
    )
}

describe('form help text — locale key parity', () => {
  it.each(HELP_KEY_PATHS)('both locales carry a non-empty string at %s', (path) => {
    expect(typeof get(IT, path), `it.json is missing "${path}"`).toBe('string')
    expect(get(IT, path)).not.toBe('')
    expect(typeof get(EN, path), `en.json is missing "${path}"`).toBe('string')
    expect(get(EN, path)).not.toBe('')
  })

  // D6's three-question rule cuts UserForm's `name` deliberately (self-evident
  // field) — asserted as absence, so a future contributor does not "fix" the
  // apparent gap by re-adding noise D6 argues against.
  it('users.form.help.name is deliberately CUT (D6 — self-evident field)', () => {
    expect(get(EN, 'users.form.help.name')).toBeUndefined()
    expect(get(IT, 'users.form.help.name')).toBeUndefined()
  })

  // Same cut, for AvatarTemplateForm's `description` (D6).
  it('avatar_templates.form.help.description is deliberately CUT (D6)', () => {
    expect(get(EN, 'avatar_templates.form.help.description')).toBeUndefined()
    expect(get(IT, 'avatar_templates.form.help.description')).toBeUndefined()
  })

  // D6's inversion fix: the existing `roleCodeRequiredForStandard` copy is
  // EXTENDED to also state permanence (the flagged spec/design gap — recorded
  // in tasks.md), rather than adding a parallel key.
  it("projects.form.roleCodeRequiredForStandard states permanence (spec's Permanence scenario)", () => {
    expect(String(get(EN, 'projects.form.roleCodeRequiredForStandard'))).toMatch(/permanent/i)
    expect(String(get(IT, 'projects.form.roleCodeRequiredForStandard'))).toMatch(/modificabile/i)
  })

  it.each(COVERAGE_KEY_PATHS)('both locales carry a non-empty string at %s', (path) => {
    expect(typeof get(IT, path), `it.json is missing "${path}"`).toBe('string')
    expect(get(IT, path)).not.toBe('')
    expect(typeof get(EN, path), `en.json is missing "${path}"`).toBe('string')
    expect(get(EN, path)).not.toBe('')
  })

  it.each(REPORT_CLARITY_KEY_PATHS)('both locales carry a non-empty string at %s', (path) => {
    expect(typeof get(IT, path), `it.json is missing "${path}"`).toBe('string')
    expect(get(IT, path)).not.toBe('')
    expect(typeof get(EN, path), `en.json is missing "${path}"`).toBe('string')
    expect(get(EN, path)).not.toBe('')
  })

  it.each(LLM_COST_KEY_PATHS)('both locales carry a non-empty string at %s', (path) => {
    expect(typeof get(IT, path), `it.json is missing "${path}"`).toBe('string')
    expect(get(IT, path)).not.toBe('')
    expect(typeof get(EN, path), `en.json is missing "${path}"`).toBe('string')
    expect(get(EN, path)).not.toBe('')
  })

  it.each(WARNING_KEY_PATHS)('both locales carry a non-empty string at %s', (path) => {
    expect(typeof get(IT, path), `it.json is missing "${path}"`).toBe('string')
    expect(get(IT, path)).not.toBe('')
    expect(typeof get(EN, path), `en.json is missing "${path}"`).toBe('string')
    expect(get(EN, path)).not.toBe('')
  })

  it.each(LLM_BINDING_ERROR_KEY_PATHS)('both locales carry a non-empty string at %s', (path) => {
    expect(typeof get(IT, path), `it.json is missing "${path}"`).toBe('string')
    expect(get(IT, path)).not.toBe('')
    expect(typeof get(EN, path), `en.json is missing "${path}"`).toBe('string')
    expect(get(EN, path)).not.toBe('')
  })

  // The form falls back to the RAW server code when a key is missing
  // (AvatarTemplateForm.vue's `te()` gate). That fallback is a safety net, not
  // a delivery mechanism: copy that is only the code itself would satisfy the
  // parity assertion above while showing the operator exactly what they saw
  // before. So the copy must not BE the code.
  it.each(LLM_BINDING_ERROR_KEY_PATHS)('the copy at %s is prose, not the bare code', (path) => {
    const code = path.split('.').pop()!

    for (const locale of [IT, EN]) {
      expect(String(get(locale, path))).not.toBe(code)
      expect(String(get(locale, path)).length).toBeGreaterThan(code.length)
    }
  })
})

/**
 * The two refusals this feature exists to encode live in the COPY, not only in
 * the components — so they are asserted against the copy.
 *
 * 1. No per-minute LLM rate. Input tokens grow quadratically in turn count,
 *    so a rate is arithmetically meaningless and invites an operator to
 *    multiply it by a session length and be confidently wrong.
 * 2. Avatar minutes and LLM tokens are two vendors on two meters, never one
 *    total (ratified at `SessionCostEstimator.php:20-22`).
 */
describe('conversation-LLM cost copy states its own caveats', () => {
  it('the template forecast says it is a total for a reference interview, not a rate', () => {
    expect(String(get(EN, 'avatar_templates.llmForecast'))).toMatch(/not a rate per minute/i)
    expect(String(get(IT, 'avatar_templates.llmForecast'))).toMatch(/non una tariffa al minuto/i)
  })

  it('the session review says the two meters are never added together', () => {
    expect(String(get(EN, 'review.cost.separateMeters'))).toMatch(/never added together/i)
    expect(String(get(IT, 'review.cost.separateMeters'))).toMatch(/mai sommati/i)
  })

  // "Absent" and "zero" are different claims, and the copy has to say which
  // one it is making.
  it('the not-billed line refuses to be read as a charge of zero', () => {
    expect(String(get(EN, 'review.cost.llmNotBilled'))).toMatch(/not a charge of zero/i)
    expect(String(get(IT, 'review.cost.llmNotBilled'))).toMatch(/addebito pari a zero/i)
  })
})

/**
 * `help.glossary.bars.definition` shipped a false statement: that a BARS
 * answer is "scored 1, 3 or 5 — never a value in between". The product scores
 * on {1,2,3,4,5} ∪ {-1}; 2 and 4 are RESIDUAL levels, legal whenever the
 * evidence matches neither bounding anchor (CLAUDE.md, DESIGN.md §8.3), and
 * -1 means unassessable and is excluded from the competency mean.
 *
 * That string is now surfaced in a tooltip on the report itself, next to the
 * chips that visibly contradict it — so the lie had to go before it got a more
 * prominent home. These tests keep it gone.
 */
describe('help.glossary.bars.definition describes the real 1–5 scale', () => {
  const definition = (locale: unknown) => String(get(locale, 'help.glossary.bars.definition'))

  it('no longer claims 1, 3 and 5 are the only possible scores', () => {
    expect(definition(EN)).not.toMatch(/1,\s*3\s*or\s*5/i)
    expect(definition(IT)).not.toMatch(/1,\s*3\s*o\s*5/i)
    expect(definition(EN)).not.toMatch(/never a value in between/i)
    expect(definition(IT)).not.toMatch(/mai un valore intermedio/i)
  })

  it('accounts for the residual levels 2 and 4', () => {
    for (const locale of [EN, IT]) {
      expect(definition(locale)).toMatch(/\b2\b/)
      expect(definition(locale)).toMatch(/\b4\b/)
    }
  })

  it('says an unassessable indicator is left out of the average', () => {
    expect(definition(EN)).toMatch(/average/i)
    expect(definition(IT)).toMatch(/media/i)
  })
})
