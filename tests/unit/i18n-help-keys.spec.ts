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
